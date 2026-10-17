import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import nodeNet from 'node:net';
import dgram from 'node:dgram';
import { compile } from '../src/compiler/index.ts';
import { net } from '../src/runtime/stdlib/net/index.ts';
import { setHost, getHost } from '../src/runtime/stdlib/host.ts';
import { runGui } from './gui-runtime.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';
import { FakeUpnp } from './upnp-fake.ts';
import { tmpDir } from './tmp.ts';

/**
 * The driver through iva's own runtime: the compiled project's systems run
 * on real sockets (Node's, as the panel's host gives them), CF.request goes
 * over Node's http - to a fake MediaServer and MediaRenderer on 127.0.0.2
 * (127.0.0.1 is a system the runtime loops back inside the panel). The SSDP
 * system is pointed at the fake's socket instead of the multicast group (no
 * network needed), its local port any.
 */

/** the panel's host as Node gives it: sockets and HTTP */
function nodeHost() {
  const provider = {
    name: 'node',
    Socket: nodeNet.Socket,
    Server: nodeNet.Server,
    createTcpSocket: () => new nodeNet.Socket(),
    createUdpSocket: () => dgram.createSocket({ type: 'udp4', reuseAddr: true }),
    createTcpServer: (o: any, l: any) => nodeNet.createServer(o, l),
  };
  const host = {
    name: 'node',
    net: provider,
    http: {
      name: 'node',
      createServer: http.createServer,
      request: (o: any, cb: any) => http.request(o.url, { method: o.method, headers: o.headers }, cb),
      get: (o: any, cb: any) => http.get(o.url, cb),
    },
  };
  return { provider, host };
}

const until = async (what: string, ok: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`waited ${ms} ms for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
};

test('through the runtime: found by M-SEARCH over UDP, described and browsed over HTTP, a track played on the renderer, its state polled, the volume set, gone on a byebye', async () => {
  const fake = await new FakeUpnp({ host: '127.0.0.2' }).start();
  const { provider, host } = nodeHost();
  const wasProvider = net.getProvider();
  const wasHost = getHost();
  net.setProvider(provider as any);
  setHost(host as any);
  let CF: any;
  let IvaUpnp: any;
  try {
    const dir = tmpDir('iva-upnp-rt-');
    fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Upnp } from 'iva/drivers/upnp';
export default (
  <Project name="T" width={400} height={300}>
    <Page name="Main">
      <Upnp ssdp={{ host: '127.0.0.2', port: ${fake.ssdpPort}, localPort: -1, notify: false, mx: 1 }} pollEvery={200}
            servers={{ list: l('servers'), selected: s('server') }} renderers={{ list: l('renderers'), selected: s('renderer') }}
            browse={{ list: l('browse'), path: s('path'), up: d('up') }}
            transport={{ play: d('play'), pause: d('pause'), stop: d('stop'), next: d('next'), state: s('state'), title: s('title'), artist: s('artist'), art: s('art'), position: a('position'), elapsed: s('elapsed'), duration: s('duration') }}
            volume={{ level: a('volume'), mute: d('mute') }} status={s('status')} />
    </Page>
  </Project>
);`);
    const r = await compile(path.join(dir, 'app.jsx'));
    const systems = r.xml.slice(r.xml.indexOf('<systems>') + 9, r.xml.indexOf('</systems>'));
    const body = r.xml.slice(r.xml.indexOf('<pages>'), r.xml.lastIndexOf('</gui>'));
    const gui = await runGui(body, { systems });
    CF = gui.CF;
    const j = {
      servers: `l${r.joins.list.servers}`, renderers: `l${r.joins.list.renderers}`, browse: `l${r.joins.list.browse}`,
      server: `s${r.joins.serial.server}`, path: `s${r.joins.serial.path}`, state: `s${r.joins.serial.state}`, title: `s${r.joins.serial.title}`, artist: `s${r.joins.serial.artist}`,
      art: `s${r.joins.serial.art}`, status: `s${r.joins.serial.status}`, duration: `s${r.joins.serial.duration}`,
      play: `d${r.joins.digital.play}`, pause: `d${r.joins.digital.pause}`, up: `d${r.joins.digital.up}`, mute: `d${r.joins.digital.mute}`,
      volume: `a${r.joins.analog.volume}`, position: `a${r.joins.analog.position}`,
    };
    // (the join store itself: CF.getJoin knows only the joins some element has, and the test project has none)
    const join = async (id: string) => joinStore.get(id.slice(1), id.charAt(0) as 'd' | 'a' | 's');
    const rows = (list: string) => (CF.listsStore[list] ?? []) as any[];
    // the scripts as the panel loads them: the joins, the driver, the start module; then the modules run and the systems start (loadProject's order)
    IvaUpnp = new Function(`${r.scripts.map((s) => s.code).join('\n')}\nreturn IvaUpnp;`)();
    for (const mod of CF.modules) mod.setup();
    CF.startSystems();

    await until('the M-SEARCH', () => fake.searches.length >= 2);
    assert.deepEqual(fake.searches.slice(0, 2).map((s) => s.st), ['urn:schemas-upnp-org:device:MediaServer:1', 'urn:schemas-upnp-org:device:MediaRenderer:1']);
    await until('the devices listed', () => rows(j.servers).length === 1 && rows(j.renderers).length === 1);
    assert.deepEqual(fake.requests.filter((q) => q.startsWith('GET')).sort(), ['GET /renderer.xml', 'GET /server.xml'], 'each description once');
    assert.deepEqual([rows(j.servers)[0].s1, rows(j.servers)[0].s3, rows(j.renderers)[0].s1], ['iva fake server', `${fake.base}/icons/server.png`, 'iva fake renderer']);
    assert.equal(await join(j.status), '1 server, 1 renderer');

    // the server tapped: its root; Music; the album; the tracks
    IvaUpnp.rowDown(j.servers);
    IvaUpnp.tap(j.servers, 0);
    await until('the root browsed', () => rows(j.browse).length === 2);
    assert.deepEqual(rows(j.browse).map((x) => [x.s1, x.s2]), [['Music', '2 items'], ['Video', '1 item']]);
    assert.equal(await join(j.server), 'iva fake server');
    assert.equal(await join(j.path), 'iva fake server');
    IvaUpnp.rowDown(j.browse);
    IvaUpnp.tap(j.browse, 0);
    await until('Music browsed', () => rows(j.browse).length === 2 && rows(j.browse)[0].s1 === 'Kind of Blue');
    assert.equal(rows(j.browse)[0].s3, `${fake.base}/AlbumArt/kob.jpg`, 'an album folder with art');
    IvaUpnp.rowDown(j.browse);
    IvaUpnp.tap(j.browse, 0);
    await until('the album browsed', () => rows(j.browse).length === 3);
    assert.deepEqual(rows(j.browse).map((x) => x.s1), ['So What', 'Freddie Freeloader', 'Blue in Green & more']);
    assert.equal(await join(j.path), 'iva fake server / Music / Kind of Blue');
    const browses = fake.calls.filter((c) => c.action === 'Browse');
    assert.equal(browses.length, 3);
    assert.deepEqual(browses[2].args, { ObjectID: '1$1', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: '0', RequestedCount: '100', SortCriteria: '' });

    // the renderer tapped: polled
    IvaUpnp.rowDown(j.renderers);
    IvaUpnp.tap(j.renderers, 0);
    await until('the state', () => fake.calls.some((c) => c.action === 'GetVolume'));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await join(j.state), 'No media');
    assert.equal(await join(j.volume), Math.round(0.3 * 65535), 'the renderer\'s volume on the slider');
    assert.ok(fake.calls.some((c) => c.action === 'GetProtocolInfo'));

    // a track tapped: on the renderer, the next one queued
    IvaUpnp.rowDown(j.browse);
    IvaUpnp.tap(j.browse, 1);
    await until('queued', () => fake.calls.some((c) => c.action === 'SetNextAVTransportURI'));
    const played = fake.calls.filter((c) => ['SetAVTransportURI', 'Play', 'SetNextAVTransportURI'].includes(c.action));
    assert.deepEqual(played.map((c) => c.action), ['SetAVTransportURI', 'Play', 'SetNextAVTransportURI']);
    assert.equal(played[0].args.CurrentURI, `${fake.base}/media/1%241%242.wav`);
    assert.ok(played[0].args.CurrentURIMetaData.includes('<dc:title>Freddie Freeloader</dc:title>'));
    assert.equal(played[2].args.NextURI, `${fake.base}/media/1%241%243.wav`);
    assert.equal(fake.renderer.state, 'PLAYING');
    const polled = fake.calls.filter((c) => c.action === 'GetPositionInfo').length;
    await until('polled playing', () => fake.calls.filter((c) => c.action === 'GetPositionInfo').length >= polled + 2);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(await join(j.state), 'Playing');
    assert.equal(await join(j.title), 'Freddie Freeloader');
    assert.equal(await join(j.artist), 'Miles Davis');
    assert.equal(await join(j.art), `${fake.base}/AlbumArt/1$1$2.jpg`);
    assert.equal(await join(j.duration), '0:02');
    assert.equal(rows(j.browse)[1].d1, 1, 'the row playing marked');

    // the buttons' joins, the volume slider, mute, a seek
    CF.setJoin(j.pause, 1);
    CF.setJoin(j.pause, 0);
    await until('paused', () => fake.renderer.state === 'PAUSED_PLAYBACK');
    CF.setJoin(j.play, 1);
    CF.setJoin(j.play, 0);
    await until('playing again', () => fake.renderer.state === 'PLAYING');
    CF.setJoin(j.volume, Math.round(0.5 * 65535));
    await until('the volume', () => fake.renderer.volume === 50);
    CF.setJoin(j.mute, 1);
    await until('muted', () => fake.renderer.mute === 1);
    CF.setJoin(j.position, Math.round(65535 / 2));
    await until('a seek', () => fake.calls.some((c) => c.action === 'Seek'));
    assert.deepEqual(fake.calls.find((c) => c.action === 'Seek')!.args, { InstanceID: '0', Unit: 'REL_TIME', Target: '0:00:01' });

    // up a level: the folder again
    CF.setJoin(j.up, 1);
    CF.setJoin(j.up, 0);
    await until('up', () => rows(j.browse).length === 2 && rows(j.browse)[0].s1 === 'Kind of Blue');

    // the server's byebye (to the socket that searched): gone from the list, its selection with it
    fake.notify('server', 'ssdp:byebye');
    await until('gone', () => rows(j.servers).length === 0);
    assert.equal(await join(j.server), '');
    assert.equal(await join(j.status), 'iva fake server went away');
  } finally {
    IvaUpnp?.stop();
    CF?.stopSystems();
    fake.stop();
    net.setProvider(wasProvider);
    setHost(wasHost);
  }
});

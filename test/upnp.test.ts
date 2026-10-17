import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import { UPNP_RUNTIME } from '../lib/drivers/upnp/runtime.ts';
import { compile } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';
import {
  SERVER_DESCRIPTION, RENDERER_DESCRIPTION, SERVER_UDN, RENDERER_UDN, MUSIC_DIDL, ROOT_DIDL,
  browseResponse, errorResponse, actionResponse, ssdpReply, ssdpNotify,
} from './upnp-fixtures.ts';

const SERVER_LOCATION = 'http://10.0.0.5:8200/rootDesc.xml';
const RENDERER_LOCATION = 'http://10.0.0.7:49494/description.xml';
const CD = 'urn:schemas-upnp-org:service:ContentDirectory:1';
const AVT = 'urn:schemas-upnp-org:service:AVTransport:1';
const RC = 'urn:schemas-upnp-org:service:RenderingControl:1';

/** the script loaded with a CF and a clock of its own; `dom`: with a DOMParser (the panel's WebView has one), else the hand parser */
function load(CF: any, clock: { setTimeout: any; clearTimeout: any; setInterval: any; clearInterval: any; Date: any }, dom = false) {
  return new Function('CF', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'DOMParser', `${UPNP_RUNTIME}\nreturn IvaUpnp;`)(
    CF, clock.setTimeout, clock.clearTimeout, clock.setInterval, clock.clearInterval, clock.Date, dom ? DOMParser : undefined);
}
const realClock = { setTimeout, clearTimeout, setInterval, clearInterval, Date };
const parsers = (dom = false) => load({ log() {} }, realClock, dom);

/**
 * Just enough of iViewer's CF for iva-upnp.js: joins, watchers, lists, the
 * SSDP system's feedback, CF.request answered from a table of what the
 * devices say. A clock to move (timers fire as it goes).
 */
function panel() {
  const joins: Record<string, any> = {};
  const sets: { join: string; value: any; quiet: boolean }[] = [];
  const watchers: { event: string; joins?: string | string[]; cb: (...a: any[]) => void; system?: string; feedback?: string }[] = [];
  const lists: Record<string, any[]> = {};
  const sent: { system: string; data: string }[] = [];
  const requests: { url: string; method: string; headers: Record<string, string>; body: string; cb: (status: number, headers: any, body: string) => void }[] = [];
  /** what the devices answer: by URL, or by SOAPACTION's action (the body given, or a function of the arguments) */
  const answers: Record<string, string | ((args: Record<string, string>, body: string) => [number, string] | string)> = {};
  const logged: string[] = [];
  let now = 1_700_000_000_000;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void; every?: number }>();
  const clock = {
    setTimeout: (fn: () => void, ms: number) => (timers.set(++seq, { at: now + ms, fn }), seq),
    setInterval: (fn: () => void, ms: number) => (timers.set(++seq, { at: now + ms, fn, every: ms }), seq),
    clearTimeout: (id: number) => timers.delete(id),
    clearInterval: (id: number) => timers.delete(id),
    Date: { now: () => now },
  };
  /** the clock on by ms, timers firing as it goes, answers arriving as they're due */
  const tick = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((x, y) => x[1].at - y[1].at || x[0] - y[0])[0];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at += t.every;
      else timers.delete(id);
      t.fn();
    }
    now = end;
  };
  const fire = (event: string, join: string, ...rest: any[]) => {
    for (const w of [...watchers]) {
      if (w.event !== event) continue;
      if (w.joins && !(Array.isArray(w.joins) ? w.joins.includes(join) : w.joins === join)) continue;
      w.cb(join, ...rest);
    }
  };
  const CF: any = {
    JoinChangeEvent: 'join', FeedbackMatchedEvent: 'fb', ConnectionStatusChangeEvent: 'conn', ListWillStartScrollingEvent: 'scroll', AllItems: 'ALL', BINARY: 'BINARY',
    setJoin(j: string, v: any, send = true) {
      joins[j] = v;
      sets.push({ join: j, value: v, quiet: send === false });
      if (send !== false) fire('join', j, v);
    },
    watch(event: string, a: any, b?: any, c?: any) {
      if (event === 'fb') { watchers.push({ event, system: a, feedback: b, cb: c }); return; }
      const cb = typeof a === 'function' ? a : b;
      watchers.push({ event, joins: typeof a === 'function' ? undefined : a, cb });
    },
    send: (system: string, data: string) => sent.push({ system, data }),
    request(url: string, method: string, headers: Record<string, string>, body: any, cb?: any) {
      if (typeof body === 'function') { cb = body; body = ''; }
      requests.push({ url, method, headers, body, cb });
    },
    listRemove(l: string) { lists[l] = []; },
    listAdd(l: string, items: any[]) { (lists[l] ??= []).push(...items); },
    listUpdate(l: string, items: any[]) {
      for (const { index, ...rest } of items) {
        for (const [i, row] of (lists[l] ?? []).entries()) if (index === 'ALL' || index === i) Object.assign(row, rest);
      }
    },
    log: (m: string) => logged.push(m),
  };
  const IvaUpnp = load(CF, clock);
  /** what came in on the SSDP system */
  const ssdp = (text: string, system = 'upnp_ssdp') => {
    for (const w of watchers) if (w.event === 'fb' && w.system === system && w.feedback === 'ssdp') w.cb('ssdp', text);
  };
  /** the requests not answered yet: answered from the table (a URL's text, an action's) */
  const answer = () => {
    let n = 0;
    // (those asked while answering wait for the next call)
    for (const r of requests.splice(0)) {
      const action = (r.headers.SOAPACTION ?? '').replace(/"/g, '').split('#')[1] ?? '';
      const key = action && answers[action] !== undefined ? action : r.url;
      const a = answers[key];
      n++;
      if (a === undefined) { r.cb(404, {}, 'not here'); continue; }
      if (typeof a === 'string') { r.cb(200, {}, a); continue; }
      const args: Record<string, string> = {};
      for (const m of r.body.matchAll(/<(\w+)>([^<]*)<\/\1>/g)) args[m[1]] = m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      const out = a(args, r.body);
      if (typeof out === 'string') r.cb(200, {}, out);
      else r.cb(out[0], {}, out[1]);
    }
    return n;
  };
  /** the user: a finger on a row, let go (a tap) */
  const tap = (list: string, index: number) => { IvaUpnp.rowDown(list); IvaUpnp.tap(list, index); };
  const user = (j: string, v: any) => { joins[j] = v; fire('join', j, v); };
  return { CF, IvaUpnp, joins, sets, lists, sent, requests, answers, logged, tick, ssdp, answer, tap, user, fire, now: () => now };
}

const OPTIONS = {
  system: 'upnp_ssdp', feedback: 'ssdp', host: '239.255.255.250', port: 1900, mx: 2, devices: [] as string[], searchEvery: 300, status: 's1',
  rows: { server: 'row_server', renderer: 'row_renderer', container: 'row_folder', item: 'row_track' }, icons: { container: 'folder.png', audio: 'musicTrack.png', video: 'videoItem.png' },
  servers: { list: 'l1', selected: 's2' }, renderers: { list: 'l2', selected: 's3' },
  browse: { list: 'l3', path: 's4', up: 'd1', refresh: 'd2' },
  transport: { play: 'd3', pause: 'd4', stop: 'd5', next: 'd6', previous: 'd7', state: 's5', title: 's6', artist: 's7', album: 's8', art: 's9', position: 'a1', elapsed: 's10', duration: 's11' },
  volume: { level: 'a2', mute: 'd8' },
};

/** a panel started, both devices found (the server by an M-SEARCH reply, the renderer by a NOTIFY), their descriptions fetched */
function discovered() {
  const p = panel();
  p.answers[SERVER_LOCATION] = SERVER_DESCRIPTION;
  p.answers[RENDERER_LOCATION] = RENDERER_DESCRIPTION;
  p.IvaUpnp.start({ ...OPTIONS });
  p.IvaUpnp.listen('upnp_notify', 'ssdp');
  p.tick(300);
  p.ssdp(ssdpReply(SERVER_LOCATION, 'urn:schemas-upnp-org:device:MediaServer:1', SERVER_UDN));
  p.ssdp(ssdpNotify(RENDERER_LOCATION, 'urn:schemas-upnp-org:device:MediaRenderer:1', RENDERER_UDN, 'ssdp:alive'), 'upnp_notify');
  assert.equal(p.answer(), 2, 'a description fetched for each');
  return p;
}

// ── XML ──────────────────────────────────────────────────────────

test('XML by hand: elements, attributes, text, entities, CDATA, comments, namespaces by local name; the same tree as DOMParser gives', () => {
  const hand = parsers(false), dom = parsers(true);
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<!-- a comment -->
<a:root xmlns:a="urn:x" xmlns="urn:y" version='2'>
  <b id="1" a:kind="k &amp; q">Tom &amp; Jerry &lt;3 &#65;&#x42;</b>
  <c><![CDATA[<raw> & stuff]]></c>
  <d/><e empty=""/>
  <f>mixed <g>inner</g> text</f>
</a:root>`;
  const doc = hand.xml.parseByHand(xml);
  const root = doc.children[0];
  assert.equal(root.name, 'root');
  assert.equal(root.attrs.version, '2');
  assert.equal(root.attrs['xmlns:a'], 'urn:x');
  assert.equal(hand.xml.text(root, 'b'), 'Tom & Jerry <3 AB');
  assert.deepEqual(hand.xml.child(root, 'b').attrs, { id: '1', kind: 'k & q' });
  assert.equal(hand.xml.text(root, 'c'), '<raw> & stuff');
  assert.equal(root.children.map((c: any) => c.name).join(','), 'b,c,d,e,f');
  assert.equal(hand.xml.child(root, 'f').text, 'mixed  text');
  assert.equal(hand.xml.find(root, 'g').text, 'inner');
  // the DOMParser path (the panel's WebView): the same tree
  assert.deepEqual(dom.xml.parse(xml), doc);
  // the hand parser is what runs without one
  assert.deepEqual(hand.xml.parse(xml), doc);
});

test('XML by hand is tolerant: unclosed tags closed by their parent, stray end tags ignored, unquoted attributes, junk before the root', () => {
  const u = parsers();
  const doc = u.xml.parseByHand('junk <root><a><b>x</a><c>y</c></wrong></root>trailing');
  const root = doc.children[0];
  assert.equal(root.name, 'root');
  assert.equal(root.children.map((c: any) => c.name).join(','), 'a,c');
  assert.equal(u.xml.find(root, 'b').text, 'x');
  assert.equal(u.xml.text(root, 'c'), 'y');
  assert.equal(u.xml.parseByHand('<r x=1 y=two/>').children[0].attrs.x, '1');
  assert.deepEqual(u.xml.parseByHand('').children, []);
  assert.equal(u.xml.unescape('a &amp;amp; b &unknown; &#x3C;'), 'a &amp; b &unknown; <');
  assert.equal(u.xml.escape('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
});

test('a device description: name, model, UDN, icons, services with URLs resolved against the location (no URLBase) or the URLBase; an embedded device\'s services count', () => {
  for (const dom of [false, true]) {
    const u = parsers(dom);
    const s = u.describe(SERVER_DESCRIPTION, SERVER_LOCATION);
    assert.equal(s.friendlyName, 'Living room & study: media');
    assert.equal(s.modelName, 'Windows Media Connect compatible (MiniDLNA)');
    assert.equal(s.manufacturer, 'Justin Maggard');
    assert.equal(s.udn, SERVER_UDN);
    assert.equal(s.type, 'urn:schemas-upnp-org:device:MediaServer:1');
    assert.equal(s.icon, 'http://10.0.0.5:8200/icons/lrg.png', 'the biggest png');
    assert.equal(s.icons.length, 3);
    assert.deepEqual(s.services.map((x: any) => x.type.split(':')[3]), ['ContentDirectory', 'ConnectionManager', 'X_MS_MediaReceiverRegistrar']);
    const cd = u.serviceOf(s, 'urn:schemas-upnp-org:service:ContentDirectory');
    assert.deepEqual([cd.control, cd.events, cd.scpd], ['http://10.0.0.5:8200/ctl/ContentDir', 'http://10.0.0.5:8200/evt/ContentDir', 'http://10.0.0.5:8200/ContentDir.xml']);
    assert.equal(u.serviceOf(s, 'urn:schemas-upnp-org:service:AVTransport'), null);

    const r = u.describe(RENDERER_DESCRIPTION, RENDERER_LOCATION);
    assert.equal(r.friendlyName, 'Kitchen <speaker>');
    assert.equal(r.udn, RENDERER_UDN);
    assert.equal(r.base, 'http://10.0.0.7:49494/');
    assert.equal(r.icon, 'http://10.0.0.7:49494/grender-64x64.png', 'relative to the URLBase');
    assert.equal(u.serviceOf(r, 'urn:schemas-upnp-org:service:AVTransport').control, 'http://10.0.0.7:49494/upnp/control/rendertransport1');
    assert.equal(u.serviceOf(r, 'urn:schemas-upnp-org:service:RenderingControl').control, 'http://10.0.0.7:49494/upnp/control/rendercontrol1', 'the embedded device\'s');
    assert.equal(r.embedded.length, 1);
    assert.equal(r.embedded[0].friendlyName, 'Kitchen (control)');
  }
});

test('URLs resolved: absolute kept, /path on the origin, relative in the folder, .. up', () => {
  const u = parsers();
  assert.equal(u.resolveUrl('http://h:1/a/b/desc.xml', 'http://x/y'), 'http://x/y');
  assert.equal(u.resolveUrl('http://h:1/a/b/desc.xml', '/ctl'), 'http://h:1/ctl');
  assert.equal(u.resolveUrl('http://h:1/a/b/desc.xml', 'ctl'), 'http://h:1/a/b/ctl');
  assert.equal(u.resolveUrl('http://h:1/a/b/desc.xml', '../c/d'), 'http://h:1/a/c/d');
  assert.equal(u.resolveUrl('http://h:1', 'x'), 'http://h:1/x');
  assert.equal(u.resolveUrl('http://h:1/a/', ''), 'http://h:1/a/');
  assert.equal(u.resolveUrl('nonsense', 'x'), 'x');
});

// ── DIDL-Lite ────────────────────────────────────────────────────

test('DIDL-Lite: containers and items with id, parent, title, class, artist, album, art, the http-get res and its duration; metadata written back round-trips', () => {
  for (const dom of [false, true]) {
    const u = parsers(dom);
    const root = u.didl.parse(ROOT_DIDL);
    assert.deepEqual(root.map((x: any) => [x.kind, x.id, x.parentId, x.title, x.childCount, x.searchable]),
      [['container', '1', '0', 'Music', 7, true], ['container', '2', '0', 'Video', 3, true], ['container', '3', '0', 'Pictures', 2, true]]);
    const music = u.didl.parse(MUSIC_DIDL);
    assert.equal(music.length, 3);
    const [a, b, c] = music;
    assert.deepEqual([a.id, a.parentId, a.kind, a.title, a.class, a.artist, a.album, a.albumArtURI, a.url, a.protocolInfo, a.duration, a.size, a.date, a.genre],
      ['1$7$1', '1$7', 'item', 'Blue in Green', 'object.item.audioItem.musicTrack', 'Miles Davis', 'Kind of Blue', 'http://10.0.0.5:8200/AlbumArt/11-1.jpg',
        'http://10.0.0.5:8200/MediaItems/1.mp3', 'http-get:*:audio/mpeg:DLNA.ORG_PN=MP3;DLNA.ORG_OP=01;DLNA.ORG_CI=0', '0:05:37.000', 8237116, '1959-01-01', 'Jazz']);
    assert.equal(b.title, 'So What & more');
    assert.equal(c.url, 'http://10.0.0.5:8200/MediaItems/3.mp3', 'the http-get res');
    assert.equal(u.didl.kind(a), 'audio');
    assert.equal(u.didl.kind(root[0]), 'container');
    assert.equal(u.didl.kind({ kind: 'item', class: 'object.item.videoItem.movie' }), 'video');
    assert.equal(u.didl.kind({ kind: 'item', class: 'object.item.imageItem.photo' }), 'image');
    assert.equal(u.didl.kind({ kind: 'item', class: 'object.item' }), 'other');
    // the metadata SetAVTransportURI gets: DIDL-Lite again, the same item back out of it
    const meta = u.didl.metadata(b);
    assert.match(meta, /^<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0\/DIDL-Lite\/"/);
    assert.ok(meta.includes('<dc:title>So What &amp; more</dc:title>'));
    const back = u.didl.parse(meta)[0];
    for (const k of ['id', 'parentId', 'kind', 'title', 'class', 'artist', 'album', 'url', 'protocolInfo', 'duration']) assert.equal(back[k], b[k], k);
  }
});

// ── SSDP and the device table ────────────────────────────────────

test('SSDP: an M-SEARCH as the spec writes it; replies and NOTIFYs parsed (several run together), max-age read, the UDN from the USN', () => {
  const u = parsers();
  assert.equal(u.ssdp.search('ssdp:all'), 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ssdp:all\r\n\r\n');
  assert.equal(u.ssdp.search('upnp:rootdevice', '127.0.0.1', 1901, 3), 'M-SEARCH * HTTP/1.1\r\nHOST: 127.0.0.1:1901\r\nMAN: "ssdp:discover"\r\nMX: 3\r\nST: upnp:rootdevice\r\n\r\n');
  const text = ssdpReply(SERVER_LOCATION, 'urn:schemas-upnp-org:device:MediaServer:1', SERVER_UDN, 120)
    + ssdpNotify(RENDERER_LOCATION, 'upnp:rootdevice', RENDERER_UDN, 'ssdp:byebye')
    + 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n'
    + 'garbage\r\n\r\n';
  const m = u.ssdp.parse(text);
  assert.deepEqual(m.map((x: any) => x.kind), ['reply', 'notify', 'search']);
  assert.deepEqual([m[0].status, m[0].location, m[0].st, m[0].udn, m[0].maxAge, m[0].server],
    [200, SERVER_LOCATION, 'urn:schemas-upnp-org:device:MediaServer:1', SERVER_UDN, 120, 'Linux/5.15 DLNADOC/1.50 UPnP/1.0 MiniDLNA/1.3.0']);
  assert.deepEqual([m[1].nts, m[1].st, m[1].udn, m[1].location], ['ssdp:byebye', 'upnp:rootdevice', RENDERER_UDN, RENDERER_LOCATION]);
  assert.equal(m[2].headers.st, 'ssdp:all');
  // lines with LF only, headers in any case
  assert.equal(u.ssdp.parse('HTTP/1.1 200 OK\nLocation: http://x/d.xml\nst: a\nusn: uuid:1::a\n\n')[0].location, 'http://x/d.xml');
  assert.equal(u.ssdp.parse('HTTP/1.1 200 OK\r\nST: a\r\n\r\n')[0].maxAge, 1800, 'no cache-control: the usual 1800 s');
});

test('the device table: a device per UDN, alive again pushes its expiry on, the sweep takes the expired, a byebye of the root (not of a service) takes it out', () => {
  const u = parsers();
  let now = 1000;
  const t = new u.DeviceTable(() => now);
  const reply = (st: string, maxAge = 100) => u.ssdp.parse(ssdpReply(SERVER_LOCATION, st, SERVER_UDN, maxAge))[0];
  let r = t.seen(reply('urn:schemas-upnp-org:device:MediaServer:1'));
  assert.equal(r.added, true);
  assert.equal(r.device.expires, 1000 + 100 * 1000);
  now = 50_000;
  r = t.seen(reply('urn:schemas-upnp-org:service:ContentDirectory:1', 200));
  assert.equal(r.added, false, 'the same device');
  assert.equal(r.device.expires, 50_000 + 200 * 1000);
  assert.deepEqual(Object.keys(r.device.types), ['urn:schemas-upnp-org:device:MediaServer:1', 'urn:schemas-upnp-org:service:ContentDirectory:1']);
  assert.equal(t.list().length, 1);
  const other = u.ssdp.parse(ssdpReply(RENDERER_LOCATION, 'upnp:rootdevice', RENDERER_UDN, 10))[0];
  t.seen(other);
  assert.equal(t.list().length, 2);
  now = 61_000;
  assert.deepEqual(t.sweep().map((d: any) => d.udn), [RENDERER_UDN], 'the renderer\'s 10 s are up');
  assert.equal(t.get(SERVER_UDN).udn, SERVER_UDN);
  // a service's byebye: the device stays; the root's: gone
  assert.equal(t.seen(u.ssdp.parse(ssdpNotify(SERVER_LOCATION, 'urn:schemas-upnp-org:service:ConnectionManager:1', SERVER_UDN, 'ssdp:byebye'))[0]), null);
  assert.equal(t.list().length, 1);
  const gone = t.seen(u.ssdp.parse(ssdpNotify(SERVER_LOCATION, 'upnp:rootdevice', SERVER_UDN, 'ssdp:byebye'))[0]);
  assert.equal(gone.gone.udn, SERVER_UDN);
  assert.equal(t.list().length, 0);
  assert.equal(t.seen(u.ssdp.parse('HTTP/1.1 200 OK\r\nST: a\r\n\r\n')[0]), null, 'no USN: nothing');
  assert.equal(t.seen({ udn: 'uuid:9', st: 'x', nts: '', location: '', usn: 'uuid:9' }), null, 'no location: nothing');
});

// ── SOAP ─────────────────────────────────────────────────────────

test('SOAP: an envelope with the action\'s arguments escaped; a response\'s values; a UPnPError; not XML', () => {
  const u = parsers();
  const env = u.soap.build(CD, 'Browse', { ObjectID: '1$7', BrowseFlag: 'BrowseDirectChildren', Filter: '*', StartingIndex: 0, RequestedCount: 50, SortCriteria: '<&"' });
  assert.equal(env, '<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
    + `<s:Body><u:Browse xmlns:u="${CD}"><ObjectID>1$7</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>50</RequestedCount><SortCriteria>&lt;&amp;&quot;</SortCriteria></u:Browse></s:Body></s:Envelope>`);
  const r = u.soap.parse(browseResponse(MUSIC_DIDL, 3, 3));
  assert.equal(r.action, 'Browse');
  assert.deepEqual([r.values.NumberReturned, r.values.TotalMatches, r.values.UpdateID], ['3', '3', '11']);
  assert.equal(u.didl.parse(r.values.Result).length, 3, 'the Result is DIDL-Lite once unescaped');
  assert.deepEqual(u.soap.parse(errorResponse(701, 'No such object')), { error: { code: 701, description: 'No such object' } });
  assert.deepEqual(u.soap.parse(actionResponse('AVTransport', 'GetTransportInfo', { CurrentTransportState: 'PLAYING', CurrentTransportStatus: 'OK', CurrentSpeed: 1 })),
    { action: 'GetTransportInfo', values: { CurrentTransportState: 'PLAYING', CurrentTransportStatus: 'OK', CurrentSpeed: '1' } });
  assert.deepEqual(u.soap.parse('<html>502 Bad Gateway</html>'), { error: { code: 0, description: 'not a SOAP response' } });
  assert.deepEqual(u.soap.parse('<s:Envelope xmlns:s="x"><s:Body><s:Fault><faultstring>Boom</faultstring></s:Fault></s:Body></s:Envelope>'), { error: { code: 0, description: 'Boom' } });
});

test('times: H:MM:SS(.fff) in seconds, back as H:MM:SS for Seek, shown as m:ss', () => {
  const u = parsers();
  assert.deepEqual(['0:05:37.000', '1:02:03', '12:34', 'NOT_IMPLEMENTED', ''].map(u.seconds), [337, 3723, 754, -1, -1]);
  assert.equal(u.hms(3723), '1:02:03');
  assert.deepEqual([u.shown(0), u.shown(65), u.shown(3723), u.shown(-1)], ['0:00', '1:05', '1:02:03', '']);
});

// ── the driver on a fake panel ───────────────────────────────────

test('start: M-SEARCH for MediaServer:1 and MediaRenderer:1 goes out on the SSDP system (a moment in, and again), and when the socket comes up; the fixed devices fetched', () => {
  const p = panel();
  p.answers['http://10.0.0.9:8080/desc.xml'] = SERVER_DESCRIPTION.replace(SERVER_UDN, 'uuid:fixed-1').replace('Living room &amp; study: media', 'Fixed one');
  p.IvaUpnp.start({ ...OPTIONS, devices: ['http://10.0.0.9:8080/desc.xml'] });
  assert.equal(p.joins.s1, 'Searching...');
  assert.equal(p.sent.length, 0, 'not before the socket has a chance to be up');
  assert.equal(p.requests[0]?.url, 'http://10.0.0.9:8080/desc.xml', 'a fixed device: its description asked for at once');
  p.answer();
  assert.deepEqual(p.lists.l1.map((r: any) => r.s1), ['Fixed one']);
  p.tick(300);
  assert.deepEqual(p.sent.map((s) => s.system), ['upnp_ssdp', 'upnp_ssdp']);
  assert.equal(p.sent[0].data, 'M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:MediaServer:1\r\n\r\n');
  assert.match(p.sent[1].data, /ST: urn:schemas-upnp-org:device:MediaRenderer:1/);
  p.tick(1200);
  assert.equal(p.sent.length, 4, 'a second time (UDP)');
  // the system up (iva's runtime says so): a search then too (not within 200 ms of the last)
  p.fire('conn', 'upnp_ssdp', true, '239.255.255.250:1900');
  assert.equal(p.sent.length, 4);
  p.tick(1000);
  p.fire('conn', 'upnp_ssdp', true, '239.255.255.250:1900');
  assert.equal(p.sent.length, 6);
  // then every searchEvery seconds
  p.tick(300_000);
  assert.equal(p.sent.length, 8);
  assert.equal(p.requests.length, 0, 'the fixed device described once (its URLs don\'t change)');
  p.IvaUpnp.stop();
});

test('a reply and a NOTIFY: the descriptions fetched once, servers and renderers listed with name / model / icon rows, the status says how many', () => {
  const p = discovered();
  assert.deepEqual(p.lists.l1, [{ subpage: 'row_server', s1: 'Living room & study: media', s2: 'Windows Media Connect compatible (MiniDLNA)', s3: 'http://10.0.0.5:8200/icons/lrg.png', d1: 0 }]);
  assert.deepEqual(p.lists.l2, [{ subpage: 'row_renderer', s1: 'Kitchen <speaker>', s2: 'gmediarender', s3: 'http://10.0.0.7:49494/grender-64x64.png', d1: 0 }]);
  assert.equal(p.joins.s1, '1 server, 1 renderer');
  // the same device again (its alive, another of its services): nothing fetched again
  p.ssdp(ssdpReply(SERVER_LOCATION, 'urn:schemas-upnp-org:service:ContentDirectory:1', SERVER_UDN));
  p.ssdp(ssdpNotify(SERVER_LOCATION, 'upnp:rootdevice', SERVER_UDN, 'ssdp:alive'), 'upnp_notify');
  assert.equal(p.requests.length, 0);
  // a search's own packets and other devices' (a router) don't count
  p.ssdp('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n');
  p.ssdp(ssdpReply('http://10.0.0.1:1900/igd.xml', 'urn:schemas-upnp-org:device:InternetGatewayDevice:1', 'uuid:router'));
  assert.equal(p.requests.length, 0);
  // a description that fails: logged, nothing listed
  p.ssdp(ssdpReply('http://10.0.0.8:1234/x.xml', 'urn:schemas-upnp-org:device:MediaServer:1', 'uuid:broken'));
  p.answer();
  assert.equal(p.lists.l1.length, 1);
  assert.ok(p.logged.some((l) => /description http:\/\/10\.0\.0\.8:1234\/x\.xml: HTTP 404/.test(l)), p.logged.join('\n'));
  p.IvaUpnp.stop();
});

test('a byebye, or a max-age up: the device goes from its list (its selection with it); a device that is both server and renderer is in both lists', () => {
  const p = discovered();
  p.ssdp(ssdpNotify(SERVER_LOCATION, 'upnp:rootdevice', SERVER_UDN, 'ssdp:byebye'), 'upnp_notify');
  assert.deepEqual(p.lists.l1, []);
  assert.equal(p.joins.s1, 'Living room & study: media went away');
  // the renderer's 1800 s run out: the sweep (every 10 s) takes it
  p.tick(1800_000 + 10_000);
  assert.deepEqual(p.lists.l2, []);
  // both roles in one device (a TV): both lists
  const both = RENDERER_DESCRIPTION.replace('</serviceList>\n    <deviceList>', `<service><serviceType>${CD}</serviceType><serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId><controlURL>/cd</controlURL><eventSubURL>/cde</eventSubURL><SCPDURL>/cd.xml</SCPDURL></service></serviceList>\n    <deviceList>`);
  p.answers['http://10.0.0.11:80/tv.xml'] = both.replace(RENDERER_UDN, 'uuid:tv').replace('Kitchen <speaker>', 'TV');
  p.ssdp(ssdpReply('http://10.0.0.11:80/tv.xml', 'urn:schemas-upnp-org:device:MediaRenderer:1', 'uuid:tv'));
  p.answer();
  assert.deepEqual([p.lists.l1.map((r: any) => r.s1), p.lists.l2.map((r: any) => r.s1)], [['TV'], ['TV']]);
  p.IvaUpnp.stop();
});

test('a tap on a server browses its root: Browse as SOAP (SOAPACTION, the arguments), folders and tracks as rows, paged till all are in; the path; a folder tapped is browsed; up; refresh', () => {
  const p = discovered();
  const browses: Record<string, string>[] = [];
  p.answers.Browse = (args) => {
    browses.push(args);
    if (args.ObjectID === '0') return browseResponse(ROOT_DIDL, 3, 3);
    if (args.ObjectID === '1' && args.StartingIndex === '0') return browseResponse(MUSIC_DIDL.replace(/<item id="1\$7\$3"[\s\S]*?<\/item>\n/, ''), 2, 3);
    if (args.ObjectID === '1' && args.StartingIndex === '2') return browseResponse(MUSIC_DIDL.replace(/<item id="1\$7\$[12]"[\s\S]*?<\/item>\n/g, ''), 1, 3);
    return [500, errorResponse(701, 'No such object')];
  };
  // pressed and scrolled: no tap
  p.IvaUpnp.rowDown('l1');
  p.fire('scroll', 'l1');
  p.IvaUpnp.tap('l1', 0);
  assert.equal(p.requests.length, 0);
  p.tap('l1', 0);
  assert.equal(p.joins.s2, 'Living room & study: media', 'the selected server');
  assert.equal(p.lists.l1[0].d1, 1, 'its row marked');
  assert.equal(p.joins.s4, 'Living room & study: media', 'the path: at the root');
  assert.equal(p.joins.s1, 'Browsing...');
  const r = p.requests[0];
  assert.equal(r.url, 'http://10.0.0.5:8200/ctl/ContentDir');
  assert.equal(r.method, 'POST');
  assert.equal(r.headers.SOAPACTION, `"${CD}#Browse"`);
  assert.match(r.headers['Content-Type'], /^text\/xml/);
  assert.ok(r.body.includes(`<u:Browse xmlns:u="${CD}"><ObjectID>0</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria></u:Browse>`), r.body);
  p.answer();
  assert.deepEqual(p.lists.l3, [
    { subpage: 'row_folder', s1: 'Music', s2: '7 items', s3: 'folder.png', d1: 0 },
    { subpage: 'row_folder', s1: 'Video', s2: '3 items', s3: 'folder.png', d1: 0 },
    { subpage: 'row_folder', s1: 'Pictures', s2: '2 items', s3: 'folder.png', d1: 0 },
  ]);
  assert.equal(p.joins.s1, '3 items');
  // into Music: two pages (the server gives 2 of 3, then the last)
  p.tap('l3', 0);
  assert.equal(p.joins.s4, 'Living room & study: media / Music');
  assert.equal(p.answer(), 1);
  assert.equal(p.lists.l3.length, 2);
  assert.equal(p.requests.length, 1, 'the rest asked for');
  assert.ok(p.requests[0].body.includes('<StartingIndex>2</StartingIndex>'));
  assert.equal(p.answer(), 1);
  assert.equal(browses[browses.length - 1].StartingIndex, '2');
  assert.deepEqual(p.lists.l3.map((x: any) => [x.subpage, x.s1, x.s2, x.s3]), [
    ['row_track', 'Blue in Green', 'Miles Davis - Kind of Blue', 'http://10.0.0.5:8200/AlbumArt/11-1.jpg'],
    ['row_track', 'So What & more', 'Miles Davis - Kind of Blue', 'musicTrack.png'],
    ['row_track', 'Flamenco Sketches', 'Miles Davis - Kind of Blue', 'musicTrack.png'],
  ]);
  assert.equal(p.joins.s1, '3 items');
  // refresh: the folder again; up: the root
  p.user('d2', 1);
  assert.equal(browses[browses.length - 1].ObjectID, '1');
  p.answer();
  p.answer();
  p.user('d1', 1);
  p.answer();
  assert.equal(browses[browses.length - 1].ObjectID, '0');
  assert.equal(p.joins.s4, 'Living room & study: media');
  assert.equal(p.lists.l3.length, 3);
  // an error: in the status
  p.user('d1', 1); // at the root already: the root again
  p.answers.Browse = () => [500, errorResponse(701, 'No such object')];
  p.tap('l3', 1);
  p.answer();
  assert.equal(p.joins.s1, 'Browse failed: 701 No such object');
  p.IvaUpnp.stop();
});

test('a renderer tapped is polled: GetTransportInfo, GetPositionInfo (state, title / artist / album / art, elapsed, duration, position), GetVolume and GetMute every other time; its protocol info asked once', () => {
  const p = discovered();
  const calls: string[] = [];
  const renderer = { state: 'STOPPED', rel: '0:00:00', volume: 30, mute: 0, uri: '', meta: '' };
  const soap = (action: string, values: Record<string, string | number>) => actionResponse(action.split('#')[0], action.split('#')[1], values);
  const on = (name: string, service: string, values: () => Record<string, string | number>) => {
    p.answers[name] = () => { calls.push(name); return soap(`${service}#${name}`, values()); };
  };
  on('GetProtocolInfo', 'ConnectionManager', () => ({ Source: '', Sink: 'http-get:*:audio/mpeg:*' }));
  on('GetTransportInfo', 'AVTransport', () => ({ CurrentTransportState: renderer.state, CurrentTransportStatus: 'OK', CurrentSpeed: 1 }));
  on('GetPositionInfo', 'AVTransport', () => ({ Track: 1, TrackDuration: '0:05:37', TrackMetaData: renderer.meta, TrackURI: renderer.uri, RelTime: renderer.rel, AbsTime: renderer.rel, RelCount: 0, AbsCount: 0 }));
  on('GetVolume', 'RenderingControl', () => ({ CurrentVolume: renderer.volume }));
  on('GetMute', 'RenderingControl', () => ({ CurrentMute: renderer.mute }));
  assert.equal(p.joins.s5, 'No renderer');
  p.tap('l2', 0);
  assert.equal(p.joins.s3, 'Kitchen <speaker>');
  p.answer();
  assert.deepEqual(calls, ['GetProtocolInfo', 'GetTransportInfo', 'GetPositionInfo', 'GetVolume', 'GetMute']);
  assert.equal(p.IvaUpnp.state.protocolInfo, 'http-get:*:audio/mpeg:*');
  assert.deepEqual([p.joins.s5, p.joins.s10, p.joins.s11, p.joins.a1, p.joins.a2, p.joins.d8], ['Stopped', '0:00', '5:37', 0, Math.round(0.3 * 65535), 0]);
  assert.ok(p.sets.filter((s) => s.join === 'a2' || s.join === 'a1').every((s) => s.quiet), 'the sliders set without a JoinChangeEvent (no SetVolume / Seek back)');
  // a second later: playing something (from another control point, say): what plays from its metadata
  renderer.state = 'PLAYING';
  renderer.rel = '0:01:00';
  renderer.uri = 'http://10.0.0.5:8200/MediaItems/1.mp3';
  renderer.meta = MUSIC_DIDL;
  renderer.mute = 1;
  calls.length = 0;
  p.tick(1000);
  p.answer();
  assert.deepEqual(calls, ['GetTransportInfo', 'GetPositionInfo'], 'the volume every other poll');
  assert.deepEqual([p.joins.s5, p.joins.s6, p.joins.s7, p.joins.s8, p.joins.s9, p.joins.s10, p.joins.a1],
    ['Playing', 'Blue in Green', 'Miles Davis', 'Kind of Blue', 'http://10.0.0.5:8200/AlbumArt/11-1.jpg', '1:00', Math.round(60 / 337 * 65535)]);
  p.tick(1000);
  p.answer();
  assert.deepEqual(calls.slice(2), ['GetTransportInfo', 'GetPositionInfo', 'GetVolume', 'GetMute']);
  assert.equal(p.joins.d8, 1);
  // unreachable: said so
  p.answers.GetTransportInfo = () => [0, 'Failed to connect'];
  p.tick(1000);
  p.answer();
  assert.equal(p.joins.s5, 'Unreachable');
  // the renderer gone (byebye): polling stops, the transport cleared
  p.ssdp(ssdpNotify(RENDERER_LOCATION, 'urn:schemas-upnp-org:device:MediaRenderer:1', RENDERER_UDN, 'ssdp:byebye'));
  calls.length = 0;
  p.tick(3000);
  assert.deepEqual(calls, []);
  assert.deepEqual([p.joins.s5, p.joins.s6, p.joins.s3, p.lists.l2], ['No renderer', '', '', []]);
  p.IvaUpnp.stop();
});

test('a track tapped: SetAVTransportURI with its DIDL metadata, Play, the next track queued with SetNextAVTransportURI; the buttons\' joins; a seek from the position slider; the next queued on when the renderer moves on', () => {
  const p = discovered();
  const calls: { action: string; args: Record<string, string> }[] = [];
  const renderer = { state: 'STOPPED', uri: '' };
  for (const [name, service] of [['SetAVTransportURI', 'AVTransport'], ['SetNextAVTransportURI', 'AVTransport'], ['Play', 'AVTransport'], ['Pause', 'AVTransport'], ['Stop', 'AVTransport'], ['Next', 'AVTransport'], ['Previous', 'AVTransport'], ['Seek', 'AVTransport'], ['GetProtocolInfo', 'ConnectionManager']]) {
    p.answers[name] = (args) => {
      calls.push({ action: name, args });
      if (name === 'SetAVTransportURI') renderer.uri = args.CurrentURI;
      if (name === 'Play') renderer.state = 'PLAYING';
      if (name === 'Stop') renderer.state = 'STOPPED';
      return actionResponse(service, name, {});
    };
  }
  p.answers.GetTransportInfo = () => actionResponse('AVTransport', 'GetTransportInfo', { CurrentTransportState: renderer.state, CurrentTransportStatus: 'OK', CurrentSpeed: 1 });
  p.answers.GetPositionInfo = () => actionResponse('AVTransport', 'GetPositionInfo', { Track: 1, TrackDuration: '0:05:37', TrackMetaData: '', TrackURI: renderer.uri, RelTime: '0:00:10', AbsTime: '0:00:10', RelCount: 0, AbsCount: 0 });
  p.answers.GetVolume = () => actionResponse('RenderingControl', 'GetVolume', { CurrentVolume: 30 });
  p.answers.GetMute = () => actionResponse('RenderingControl', 'GetMute', { CurrentMute: 0 });
  p.answers.Browse = (args) => browseResponse(args.ObjectID === '0' ? ROOT_DIDL : MUSIC_DIDL, 3, 3);
  p.tap('l1', 0);
  p.answer();
  p.tap('l3', 0);
  p.answer();
  // no renderer yet: said so
  p.tap('l3', 1);
  assert.equal(p.joins.s1, 'Pick a renderer first');
  assert.equal(p.requests.length, 0);
  p.tap('l2', 0);
  p.answer();
  calls.length = 0;
  p.tap('l3', 1);
  assert.equal(p.joins.s1, 'Loading So What & more');
  assert.equal(p.lists.l3[1].d1, 1, 'the row marked');
  p.answer(); // SetAVTransportURI
  p.answer(); // Play
  p.answer(); // SetNextAVTransportURI, the poll
  assert.deepEqual(calls.map((c) => c.action), ['SetAVTransportURI', 'Play', 'SetNextAVTransportURI']);
  assert.equal(calls[0].args.CurrentURI, 'http://10.0.0.5:8200/MediaItems/2.mp3');
  assert.ok(calls[0].args.CurrentURIMetaData.includes('<dc:title>So What &amp; more</dc:title>'), calls[0].args.CurrentURIMetaData);
  assert.ok(calls[0].args.CurrentURIMetaData.includes('<res protocolInfo="http-get:*:audio/mpeg:*" duration="0:09:22.000">http://10.0.0.5:8200/MediaItems/2.mp3</res>'));
  assert.deepEqual(calls[1].args, { InstanceID: '0', Speed: '1' });
  assert.equal(calls[2].args.NextURI, 'http://10.0.0.5:8200/MediaItems/3.mp3');
  assert.ok(calls[2].args.NextURIMetaData.includes('Flamenco Sketches'));
  assert.deepEqual([p.joins.s6, p.joins.s7, p.joins.s8], ['So What & more', 'Miles Davis', 'Kind of Blue'], 'what plays, shown at once');
  // the buttons
  calls.length = 0;
  for (const [j, action] of [['d4', 'Pause'], ['d5', 'Stop'], ['d6', 'Next'], ['d7', 'Previous'], ['d3', 'Play']]) {
    p.user(j, 1);
    p.user(j, 0);
    p.answer();
    assert.equal(calls[calls.length - 1].action, action, j);
  }
  assert.equal(calls.length, 5, 'a press, not the release');
  // the slider let go at a third: Seek REL_TIME once it rests
  calls.length = 0;
  p.user('a1', 20000);
  p.user('a1', 21845);
  p.tick(300);
  p.answer();
  assert.deepEqual(calls.map((c) => c.action), ['Seek']);
  assert.deepEqual(calls[0].args, { InstanceID: '0', Unit: 'REL_TIME', Target: '0:01:52' });
  // the renderer goes on to the queued track by itself: the one after it queued (none left here)
  calls.length = 0;
  renderer.uri = 'http://10.0.0.5:8200/MediaItems/3.mp3';
  p.tick(2000);
  p.answer();
  assert.equal(p.joins.s6, 'Flamenco Sketches');
  assert.equal(p.lists.l3[2].d1, 1);
  assert.equal(p.lists.l3[1].d1, 0);
  assert.ok(!calls.some((c) => c.action === 'SetNextAVTransportURI'), 'nothing after the last track');
  // a failure: in the status
  p.answers.Play = () => [500, errorResponse(701, 'Transition not available')];
  p.user('d3', 1);
  p.answer();
  assert.equal(p.joins.s1, 'Play failed: 701 Transition not available');
  p.IvaUpnp.stop();
});

test('volume: the slider sets SetVolume (once it rests, 0..100), the mute toggle SetMute; what the renderer answers goes to the joins quietly', () => {
  const p = discovered();
  const calls: { action: string; args: Record<string, string> }[] = [];
  const renderer = { volume: 30, mute: 0 };
  p.answers.GetProtocolInfo = () => actionResponse('ConnectionManager', 'GetProtocolInfo', { Source: '', Sink: '' });
  p.answers.GetTransportInfo = () => actionResponse('AVTransport', 'GetTransportInfo', { CurrentTransportState: 'STOPPED', CurrentTransportStatus: 'OK', CurrentSpeed: 1 });
  p.answers.GetPositionInfo = () => actionResponse('AVTransport', 'GetPositionInfo', { Track: 0, TrackDuration: '0:00:00', TrackMetaData: '', TrackURI: '', RelTime: '0:00:00', AbsTime: '0:00:00', RelCount: 0, AbsCount: 0 });
  p.answers.GetVolume = () => actionResponse('RenderingControl', 'GetVolume', { CurrentVolume: renderer.volume });
  p.answers.GetMute = () => actionResponse('RenderingControl', 'GetMute', { CurrentMute: renderer.mute });
  p.answers.SetVolume = (args) => { calls.push({ action: 'SetVolume', args }); renderer.volume = Number(args.DesiredVolume); return actionResponse('RenderingControl', 'SetVolume', {}); };
  p.answers.SetMute = (args) => { calls.push({ action: 'SetMute', args }); renderer.mute = Number(args.DesiredMute); return actionResponse('RenderingControl', 'SetMute', {}); };
  p.tap('l2', 0);
  p.answer();
  assert.equal(p.joins.a2, Math.round(0.3 * 65535));
  p.user('a2', 40000);
  p.user('a2', 45000);
  p.user('a2', 49151);
  p.tick(150);
  p.answer();
  assert.deepEqual([...calls], [{ action: 'SetVolume', args: { InstanceID: '0', Channel: 'Master', DesiredVolume: '75' } }]);
  p.user('d8', 1);
  p.answer();
  assert.deepEqual(calls[1], { action: 'SetMute', args: { InstanceID: '0', Channel: 'Master', DesiredMute: '1' } });
  p.user('d8', 0);
  p.answer();
  assert.equal(calls[2].args.DesiredMute, '0');
  // the renderer's own change (its remote): the slider follows, quietly - and no SetVolume back
  renderer.volume = 10;
  calls.length = 0;
  p.tick(1000);
  p.answer();
  p.tick(1000);
  p.answer();
  p.tick(150);
  p.answer();
  assert.equal(p.joins.a2, Math.round(0.1 * 65535));
  assert.deepEqual(calls, []);
  p.IvaUpnp.stop();
});

test('Search on a server that has one: the results into the browse list', () => {
  const p = discovered();
  const searches: Record<string, string>[] = [];
  p.answers.Browse = () => browseResponse(ROOT_DIDL, 3, 3);
  p.answers.Search = (args) => { searches.push(args); return browseResponse(MUSIC_DIDL, 3, 3); };
  p.tap('l1', 0);
  p.answer();
  p.IvaUpnp.find('dc:title contains "blue"');
  assert.equal(p.joins.s4, 'Search: dc:title contains "blue"');
  p.answer();
  assert.deepEqual(searches[0], { ContainerID: '0', SearchCriteria: 'dc:title contains "blue"', Filter: '*', StartingIndex: '0', RequestedCount: '100', SortCriteria: '' });
  assert.equal(p.lists.l3.length, 3);
  assert.equal(p.joins.s1, '3 found');
  p.IvaUpnp.stop();
});

// ── the component, compiled ──────────────────────────────────────

const wrap = (body: string, head = '') => `import { Upnp } from 'iva/drivers/upnp';
${head}
export default (
  <Project name="T" width={400} height={300}>
    <Page name="Main">${body}</Page>
  </Project>
);`;
async function build(jsx: string) {
  const dir = tmpDir('iva-upnp-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  return compile(path.join(dir, 'app.jsx'));
}

test('<Upnp>: a UDP system for SSDP on its own port with a catch-all feedback, one on 1900 for NOTIFYs, the script once, the start line with the joins as Joins.* references', async () => {
  const r = await build(wrap(`
    <List w={200} h={300} join={l('servers')} item={<Subpage name="row" w={200} h={40}><Text w={200} h={40} join={1} /></Subpage>} />
    <Upnp devices={['http://10.0.0.5:8200/rootDesc.xml']} servers={{ list: l('servers'), selected: s('server'), row: 'row' }} renderers={{ list: l('renderers') }}
          browse={{ list: 'browse', path: s('path'), up: d('up'), refresh: d('refresh'), rows: { container: 'folder', item: 'track' }, icons: { container: 'folder.png' }, pageSize: 50 }}
          transport={{ play: d('play'), pause: d('pause'), stop: d('stop'), next: d('next'), previous: d('previous'), state: s('state'), title: s('title'), artist: s('artist'), album: s('album'), art: s('art'), position: a('position'), elapsed: s('elapsed'), duration: s('duration') }}
          volume={{ level: a('volume'), mute: d('mute') }} status={s('upnpStatus')} search={d('search')} searchEvery={60} pollEvery={2000} />
    <Upnp servers={{ list: l('servers'), selected: s('server'), row: 'row' }} renderers={{ list: l('renderers') }} />`));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.scripts.map((s) => s.name), ['iva-joins.js', 'iva-upnp.js', 'iva-start.js']);
  for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  assert.equal(r.scripts[1].code, UPNP_RUNTIME);
  assert.match(r.xml, /<system name="upnp_ssdp" ip="239\.255\.255\.250" port="1900" origin="4023" protocol="udp" alwayson="1" offlinequeue="1" accept="1" acceptBroadcasts="1" [^>]*>\s*<fb name="ssdp" regex="\(\.\*\)" \/>\s*<\/system>/);
  assert.match(r.xml, /<system name="upnp_notify" ip="239\.255\.255\.250" port="1900" origin="1900" protocol="udp" [^>]*>\s*<fb name="ssdp" regex="\(\.\*\)" \/>\s*<\/system>/);
  assert.equal((r.xml.match(/<system name="upnp_ssdp"/g) ?? []).length, 1, 'the same system from two <Upnp>s: once');
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  const line = /IvaUpnp\.start\((\{.*\})\); IvaUpnp\.listen\("upnp_notify", "ssdp"\);/.exec(start)!;
  assert.ok(line, start);
  const Joins = { d: {}, a: {}, s: {}, l: {} } as Record<string, Record<string, string>>;
  for (const [type, names] of [['d', r.joins.digital], ['a', r.joins.analog], ['s', r.joins.serial], ['l', r.joins.list]] as const) {
    for (const [name, n] of Object.entries(names)) Joins[type][name] = `${type}${n}`;
  }
  const o = new Function('Joins', `return ${line[1]};`)(Joins);
  assert.deepEqual(o, {
    system: 'upnp_ssdp', feedback: 'ssdp', host: '239.255.255.250', port: 1900, mx: 2, devices: ['http://10.0.0.5:8200/rootDesc.xml'], searchEvery: 60, pageSize: 50, pollEvery: 2000,
    search: `d${r.joins.digital.search}`, status: `s${r.joins.serial.upnpStatus}`, rows: { server: 'row', container: 'folder', item: 'track' }, icons: { container: 'folder.png' },
    servers: { list: `l${r.joins.list.servers}`, selected: `s${r.joins.serial.server}` }, renderers: { list: `l${r.joins.list.renderers}` },
    browse: { list: `l${r.joins.list.browse}`, path: `s${r.joins.serial.path}`, up: `d${r.joins.digital.up}`, refresh: `d${r.joins.digital.refresh}` },
    transport: { play: `d${r.joins.digital.play}`, pause: `d${r.joins.digital.pause}`, stop: `d${r.joins.digital.stop}`, next: `d${r.joins.digital.next}`, previous: `d${r.joins.digital.previous}`,
      state: `s${r.joins.serial.state}`, title: `s${r.joins.serial.title}`, artist: `s${r.joins.serial.artist}`, album: `s${r.joins.serial.album}`, art: `s${r.joins.serial.art}`,
      position: `a${r.joins.analog.position}`, elapsed: `s${r.joins.serial.elapsed}`, duration: `s${r.joins.serial.duration}` },
    volume: { level: `a${r.joins.analog.volume}`, mute: `d${r.joins.digital.mute}` },
  });
  // joins no element has still get numbers (the start line uses them)
  assert.ok(r.joins.digital.play && r.joins.list.renderers && r.joins.serial.state);
  // the second <Upnp> (its own line, no devices) is another setup line
  assert.equal((start.match(/IvaUpnp\.start\(/g) ?? []).length, 2);
});

test('<Upnp ssdp>: another address and port (a test\'s fake on 127.0.0.1), any local port, no NOTIFY listener; a bad device URL or name refused', async () => {
  const r = await build(wrap(`<Upnp name="cp" ssdp={{ host: '127.0.0.1', port: 1901, localPort: -1, notify: false, mx: 1 }} servers={{ list: 7 }} />`));
  assert.match(r.xml, /<system name="cp_ssdp" ip="127\.0\.0\.1" port="1901" origin="-1" protocol="udp"/);
  assert.doesNotMatch(r.xml, /cp_notify/);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.ok(start.includes('IvaUpnp.start({ system: "cp_ssdp", feedback: "ssdp", host: "127.0.0.1", port: 1901, mx: 1, devices: [], searchEvery: 300, rows: {}, icons: {}, servers: { list: "l7" } });'), start);
  assert.ok(!start.includes('IvaUpnp.listen'));
  await assert.rejects(build(wrap(`<Upnp devices={['10.0.0.5:8200/rootDesc.xml']} />`)), /devices: "10\.0\.0\.5:8200\/rootDesc\.xml" isn't a description URL/);
  await assert.rejects(build(wrap(`<Upnp name="a b" />`)), /name "a b"/);
  await assert.rejects(build(`import { Upnp } from 'iva/drivers/nothing';\nexport default <Project name="T" width={400} height={300}><Page name="Main" /></Project>;`),
    /no module "iva\/drivers\/nothing" \(iva has: iva, iva\/ui, iva\/drivers\/matter, iva\/drivers\/mqtt, iva\/drivers\/upnp, iva\/jsx-runtime\)/);
});

test('examples/upnp builds for the tablet and the phone: the driver, the lists with their rows, the now playing card, no warnings', async () => {
  const entry = path.resolve(import.meta.dirname, '../examples/upnp/app.jsx');
  for (const size of [undefined, '1400x1400@3x']) {
    const r = await compile(entry, size ? { size } : {});
    assert.deepEqual(r.warnings, [], size);
    assert.deepEqual(r.scripts.map((s) => s.name).sort(), ['iva-joins.js', 'iva-start.js', 'iva-ui.js', 'iva-upnp.js']);
    for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
    assert.match(r.xml, /<system name="upnp_ssdp" ip="239\.255\.255\.250" port="1900" origin="4023" protocol="udp"/);
    for (const list of ['servers', 'renderers', 'browse']) assert.ok(r.joins.list[list], list);
    for (const row of ['upnp_row_device', 'upnp_row_folder', 'upnp_row_track']) assert.match(r.xml, new RegExp(`<subpage name="${row}" w="\\d+" h="\\d+"`), row);
    const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
    assert.match(start, /IvaUpnp\.start\(\{ system: "upnp_ssdp", feedback: "ssdp", host: "239\.255\.255\.250", port: 1900, mx: 2, devices: \[\]/);
    assert.ok(start.includes(`rows: {"server":"upnp_row_device","renderer":"upnp_row_device","container":"upnp_row_folder","item":"upnp_row_track"}`), start);
    // the row buttons report taps to the driver
    assert.match(r.xml, /js="IvaUpnp\.rowDown\(list\)"/);
    assert.match(r.xml, /js="IvaUpnp\.tap\(list, listIndex\)"/);
    // the icons from the old project ship
    for (const icon of ['folder.png', 'musicTrack.png', 'videoItem.png']) assert.ok(r.assets.some((a) => a.name.endsWith(icon)), icon);
  }
});

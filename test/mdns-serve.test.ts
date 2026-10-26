import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TYPE, decode, txtData, txtStrings, type DnsRecord, type Message } from '../src/runtime/cf/mdns/dns.ts';
import { Mdns, type FoundService } from '../src/runtime/cf/mdns/mdns.ts';
import { IVA_TYPE, servedInfo, servedTxt } from '../src/runtime/cf/mdns/served.ts';
import { advertise, hostLabel } from '../src/server/mdns.ts';
import { startDeviceServer } from '../src/server/device.ts';
import { browse, type Served } from '../panel/discover.ts';
import { VERSION } from '../src/create.ts';
import { tmpDir } from './tmp.ts';

// ── what iva serve says of itself ─────────────────────────────────

test("iva serve's TXT record: txtvers first, what the panel shows and loads; read back as it was", () => {
  const info = { path: '/', version: '0.1.1', project: 'neomorph', kind: 'project' as const, sizes: ['1400x1400@3x', '1920x1080'], host: 'studio' };
  const strings = txtStrings(servedTxt(info));
  assert.deepEqual(strings, ['txtvers=1', 'path=/', 'iva=0.1.1', 'name=neomorph', 'kind=project', 'sizes=1400x1400@3x,1920x1080', 'host=studio']);
  assert.deepEqual(servedInfo(txtData(strings)), info);
  // a .gui: no sizes said; a name too long for a TXT string: cut at a character, its string 255 bytes at most
  const long = txtStrings(servedTxt({ ...info, kind: 'gui', sizes: [], project: 'é'.repeat(300) }));
  assert.ok(!long.some((s) => s.startsWith('sizes=')));
  const name = long.find((s) => s.startsWith('name='))!;
  assert.ok(new TextEncoder().encode(name).length <= 255 && !name.includes('�'), `${new TextEncoder().encode(name).length} bytes`);
  // another's (or none): the path '/', the rest empty
  assert.deepEqual(servedInfo({}), { path: '/', version: '', project: '', kind: 'project', sizes: [], host: '' });
  assert.equal(hostLabel('Studio.Local'), 'studio');
  assert.equal(hostLabel('my_pc (2)'), 'my-pc-2');
});

// ── a network of two subnets: a LAN and a ZeroTier network ────────

const MASK = '255.255.255.0';
const link = (addr: string) => addr.split('.').slice(0, 3).join('.');

/**
 * UDP on pretend networks (each /24 a link): a multicast to 224.0.0.251:5353
 * goes out of the sender's multicast interface (else its bound address,
 * else its device's first) and reaches every socket on port 5353 of each
 * device on that link (the sender's own too: loopback), whatever it joined -
 * as Linux hands it to every socket there; a unicast reaches the socket of
 * the device with that address on that port.
 */
class FakeNet {
  sockets = new Set<FakeUdp>();
  next = 40000;
  /** devices whose 5353 something else holds (not shared) */
  taken = new Set<string>();
  sent: { from: string; to: string; m: Message }[] = [];
  deliver(from: FakeUdp, src: string, bytes: Uint8Array, port: number, address: string) {
    this.sent.push({ from: `${src}:${from.port}`, to: `${address}:${port}`, m: decode(bytes) });
    for (const s of this.sockets) {
      const hit = address === '224.0.0.251'
        ? s.port === port && s.device.some((a) => link(a) === link(src))
        : s.port === port && s.device.includes(address) && (!s.bound || s.bound === address);
      if (hit) queueMicrotask(() => s.emit('message', bytes, { address: src, port: from.port }));
    }
  }
}
class FakeUdp extends EventEmitter {
  port = 0;
  bound = '';
  multicastIf = '';
  closed = false;
  constructor(private net: FakeNet, public device: string[]) {
    super();
  }
  bind(port: number, address?: string | (() => void), cb?: () => void) {
    const done = typeof address === 'function' ? address : cb;
    if (typeof address === 'string') this.bound = address;
    if (port === 5353 && this.device.some((a) => this.net.taken.has(a))) {
      queueMicrotask(() => this.emit('error', Object.assign(new Error('Address already in use'), { code: 'EADDRINUSE' })));
      return this;
    }
    this.port = port || this.net.next++;
    this.net.sockets.add(this);
    queueMicrotask(() => done?.());
    return this;
  }
  addMembership() {}
  setMulticastInterface(a: string) {
    this.multicastIf = a;
  }
  setMulticastTTL() {}
  setMulticastLoopback() {}
  send(b: Uint8Array, off: number, len: number, port: number, address: string) {
    const src = address === '224.0.0.251'
      ? this.multicastIf || this.bound || this.device[0]
      : this.bound || this.device.find((a) => link(a) === link(address)) || this.device[0];
    this.net.deliver(this, src, b.subarray(off, off + len), port, address);
  }
  close(cb?: () => void) {
    this.closed = true;
    this.net.sockets.delete(this);
    queueMicrotask(() => cb?.());
    return this;
  }
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
const pass = async (ms: number) => {
  for (let t = 0; t < ms; t += 50) {
    mock.timers.tick(50);
    await settle();
  }
};
/** an advertisement closed, time passing meanwhile (its goodbyes, its sockets let go of) */
const closed = async (a: { close(): Promise<void> }) => {
  const done = a.close();
  await pass(600);
  await done;
};

/** this machine: on a LAN and a ZeroTier network */
const SERVER = ['192.168.1.5', '10.153.12.190'];
const NETWORKS = SERVER.map((address) => ({ address, netmask: MASK }));
const TXT = servedTxt({ path: '/', version: '0.1.1', project: 'neomorph', kind: 'project', sizes: ['1400x1400@3x'], host: 'studio' });
/** what a project of one size is advertised as: the GUI at / */
const one = (name: string) => [{ key: '/', name, txt: TXT }];

/** a lookup of _iva._tcp from another device, as the panel's settings do it: asking only, from a port of its own on that address */
function asker(net: FakeNet, address: string) {
  const calls: { added: FoundService[]; removed: string[] }[] = [];
  const e = new Mdns({
    network: () => ({ ipv4address: address, ipv4netmask: MASK }),
    deviceName: () => '', deviceId: () => '',
    pinned: true, askOnly: true,
    createSocket: () => new FakeUdp(net, [address]) as any,
  });
  void e.lookup(IVA_TYPE, '', (added, removed) => calls.push({ added, removed: removed.map((g) => g.name) }));
  return { e, calls };
}

test('iva serve advertised: announced on each network with that network\'s address; found from either, its TXT what it serves', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const logs: string[] = [];
    const ad = advertise({ services: one('neomorph'), port: 8020, networks: NETWORKS, host: 'Studio', createSocket: () => new FakeUdp(net, SERVER) as any, log: (m) => logs.push(m) });
    await pass(1500);
    const a = await ad;
    assert.equal(a.nameOf('/'), 'neomorph');
    assert.ok(logs.includes('mDNS: "neomorph" (_iva._tcp) on 192.168.1.5:8020, 10.153.12.190:8020'), logs.join('\n'));
    // each network's announcement: its own address only (RFC 6762 §14), the host name iva serve's own
    const announced = net.sent.filter((x) => x.to === '224.0.0.251:5353' && x.m.response && x.m.answers.some((r) => r.type === TYPE.PTR));
    for (const ip of SERVER) {
      const there = announced.filter((x) => x.from.startsWith(`${ip}:`));
      assert.ok(there.length >= 1, `announced on ${ip}`);
      const as = there[0].m.answers.filter((r) => r.type === TYPE.A).map((r) => r.data);
      assert.deepEqual(as, [ip]);
      const srv = there[0].m.answers.find((r) => r.type === TYPE.SRV)!;
      assert.deepEqual(srv.data, { priority: 0, weight: 0, port: 8020, target: 'studio-iva-8020.local' });
      assert.deepEqual(there[0].m.answers.find((r) => r.type === TYPE.PTR)!.data, 'neomorph._iva._tcp.local');
    }
    // a phone on the ZeroTier network finds it at its ZeroTier address, one on the LAN at its LAN address
    const phone = asker(net, '10.153.12.182');
    const tablet = asker(net, '192.168.1.40');
    await pass(1500);
    assert.deepEqual(phone.calls.flatMap((c) => c.added.map((s) => [s.name, s.hostname, s.port, s.addresses])), [['neomorph', 'studio-iva-8020.local', 8020, ['10.153.12.190']]]);
    assert.deepEqual(servedInfo(phone.calls[0].added[0].data), servedInfo(txtData(txtStrings(TXT))));
    assert.deepEqual(tablet.calls.flatMap((c) => c.added.map((s) => s.addresses)), [['192.168.1.5']]);
    // the answer to a one-shot query: by unicast to the port it came from, its records 10 s at most (RFC 6762 §6.7)
    const toPhone = net.sent.filter((x) => x.to.startsWith('10.153.12.182:') && x.m.response);
    assert.ok(toPhone.length >= 1);
    assert.ok(toPhone.every((x) => x.from === '10.153.12.190:5353'), JSON.stringify(toPhone.map((x) => x.from)));
    assert.ok(toPhone.every((x) => [...x.m.answers, ...x.m.additionals].every((r) => r.ttl <= 10)));
    // none from the LAN's side to the phone (the LAN's engine leaves another subnet's query alone)
    assert.ok(!net.sent.some((x) => x.to.startsWith('10.153.12.182:') && x.from.startsWith('192.168.1.5:')));
    // still there a minute on: asked every few seconds, answered, never gone in between
    await pass(60000);
    assert.equal(phone.calls.length, 1, JSON.stringify(phone.calls.slice(1)));
    phone.e.dispose();
    tablet.e.dispose();
    await closed(a);
  } finally {
    mock.timers.reset();
  }
});

test('iva serve stopping: a goodbye (TTL 0) on each network, its sockets closed; a CF lookup on 5353 sees it gone at once', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const made: FakeUdp[] = [];
    const ad = advertise({ services: one('neomorph'), port: 8020, networks: NETWORKS, host: 'studio', createSocket: () => {
      const s = new FakeUdp(net, SERVER);
      made.push(s);
      return s as any;
    } });
    await pass(1500);
    const a = await ad;
    // a GUI's CF.startLookup on a panel on the LAN (shared 5353, multicast both ways)
    const cf = new Mdns({ network: () => ({ ipv4address: '192.168.1.40', ipv4netmask: MASK }), deviceName: () => 'Hall', deviceId: () => 'aa11', createSocket: () => new FakeUdp(net, ['192.168.1.40']) as any });
    const seen: { added: string[]; removed: string[] }[] = [];
    void cf.lookup(IVA_TYPE, '', (added, removed) => seen.push({ added: added.map((s) => s.name), removed: removed.map((g) => g.name) }));
    await pass(1500);
    assert.deepEqual(seen, [{ added: ['neomorph'], removed: [] }]);
    const from = net.sent.length;
    await closed(a);
    const byes = net.sent.slice(from).filter((x) => x.m.response && x.to === '224.0.0.251:5353');
    for (const ip of SERVER) {
      const bye = byes.find((x) => x.from.startsWith(`${ip}:`));
      assert.ok(bye, `a goodbye on ${ip}`);
      const records: DnsRecord[] = bye!.m.answers;
      assert.deepEqual(records.map((r) => r.type).sort(), [TYPE.A, TYPE.PTR, TYPE.TXT, TYPE.SRV].sort());
      assert.ok(records.every((r) => r.ttl === 0));
    }
    assert.deepEqual(seen.at(-1), { added: [], removed: ['neomorph'] });
    assert.ok(made.length === 2 && made.every((s) => s.closed));
    cf.dispose();
  } finally {
    mock.timers.reset();
  }
});

test('iva serve: a name another has on the network is "Name (2)" on every network; no port 5353 to be had: said why, serving goes on', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    // another machine on the ZeroTier network serving a project of the same name
    const other = advertise({ services: one('neomorph'), port: 8019, networks: [{ address: '10.153.12.50', netmask: MASK }], host: 'laptop', createSocket: () => new FakeUdp(net, ['10.153.12.50']) as any });
    await pass(1500);
    await other;
    const logs: string[] = [];
    const ad = advertise({ services: one('neomorph'), port: 8020, networks: NETWORKS, host: 'studio', createSocket: () => new FakeUdp(net, SERVER) as any, log: (m) => logs.push(m) });
    await pass(4000);
    const a = await ad;
    assert.equal(a.nameOf('/'), 'neomorph (2)');
    assert.ok(logs.some((l) => /"neomorph" is taken on the network: "neomorph \(2\)"/.test(l)), logs.join('\n'));
    const phone = asker(net, '10.153.12.182');
    const tablet = asker(net, '192.168.1.40');
    await pass(1500);
    assert.deepEqual(phone.calls.flatMap((c) => c.added.map((s) => s.name)).sort(), ['neomorph', 'neomorph (2)']);
    assert.deepEqual(tablet.calls.flatMap((c) => c.added.map((s) => s.name)), ['neomorph (2)']);
    phone.e.dispose();
    tablet.e.dispose();
    await closed(a);
    await closed(await other);

    const busy = new FakeNet();
    for (const ip of SERVER) busy.taken.add(ip);
    const said: string[] = [];
    const none = advertise({ services: one('neomorph'), port: 8020, networks: NETWORKS, host: 'studio', createSocket: () => new FakeUdp(busy, SERVER) as any, log: (m) => said.push(m) });
    await pass(500);
    await closed(await none);
    assert.ok(said.some((l) => /not on 192\.168\.1\.5: .*5353 is taken/.test(l)), said.join('\n'));
  } finally {
    mock.timers.reset();
  }
});

// ── the panel's settings: Found on the network ──────────────────

test("the panel's list: one entry for an iva serve found on two of the device's networks (the main one's address first); gone once it stops answering", async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const ad = advertise({ services: one('neomorph'), port: 8020, networks: NETWORKS, host: 'studio', createSocket: () => new FakeUdp(net, SERVER) as any });
    await pass(1500);
    const a = await ad;
    // a desktop panel on the LAN and the ZeroTier network (Wi-Fi first)
    const panel = ['192.168.1.40', '10.153.12.182'];
    const lists: Served[][] = [];
    const made: FakeUdp[] = [];
    const b = browse({
      networks: panel.map((address) => ({ address, netmask: MASK })),
      createSocket: () => {
        const s = new FakeUdp(net, panel);
        made.push(s);
        return s as any;
      },
      onChange: (l) => lists.push(l),
    });
    await pass(3000);
    const now = b.list();
    assert.equal(now.length, 1);
    assert.deepEqual({ ...now[0] }, {
      path: '/', version: '0.1.1', project: 'neomorph', kind: 'project', sizes: ['1400x1400@3x'], host: 'studio',
      key: 'studio-iva-8020.local:8020/', name: 'neomorph', hostname: 'studio-iva-8020.local', port: 8020,
      addresses: ['192.168.1.5', '10.153.12.190'], urls: ['http://192.168.1.5:8020/', 'http://10.153.12.190:8020/'],
    });
    // each network asked from a port of its own on its address, multicast out of it
    assert.deepEqual(made.map((s) => [s.bound, s.multicastIf]), panel.map((p) => [p, p]));
    // iva serve gone without a goodbye (the machine off): off the list within the answers' 10 s
    const lastSeen = lists.length;
    for (const s of [...net.sockets]) if (s.device === SERVER || s.device.includes('192.168.1.5')) s.close();
    await pass(12000);
    assert.deepEqual(lists.at(-1), []);
    assert.ok(lists.length > lastSeen);
    b.stop();
    await pass(500);
    assert.ok(made.every((s) => s.closed));
    await closed(a);
  } finally {
    mock.timers.reset();
  }
});

test("a project in several sizes: an instance each, on one socket a network; the panel's list has each its own (its path, its size) - a size let go goes, the rest stay", async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    const net = new FakeNet();
    const made: FakeUdp[] = [];
    const sized = (at: string, size: string) => ({
      key: at, name: `neomorph ${size}`, txt: servedTxt({ path: at, version: '0.1.3', project: 'neomorph', kind: 'project', sizes: [size], host: 'studio' }),
    });
    const ad = advertise({
      services: [sized('/', '1280x800'), sized('/1080w1920h/', '1080x1920@2.5x')], port: 8020, networks: NETWORKS, host: 'studio',
      createSocket: () => {
        const s = new FakeUdp(net, SERVER);
        made.push(s);
        return s as any;
      },
    });
    await pass(1500);
    const a = await ad;
    assert.equal(made.length, SERVER.length);
    assert.equal(a.nameOf('/1080w1920h/'), 'neomorph 1080x1920@2.5x');
    const b = browse({ networks: [{ address: '192.168.1.40', netmask: MASK }], createSocket: () => new FakeUdp(net, ['192.168.1.40']) as any, onChange: () => {} });
    await pass(3000);
    assert.deepEqual(b.list().map((s) => [s.name, s.key, s.urls, s.sizes]), [
      ['neomorph 1080x1920@2.5x', 'studio-iva-8020.local:8020/1080w1920h/', ['http://192.168.1.5:8020/1080w1920h/'], ['1080x1920@2.5x']],
      ['neomorph 1280x800', 'studio-iva-8020.local:8020/', ['http://192.168.1.5:8020/'], ['1280x800']],
    ]);
    // the phone's size no longer in <Project sizes>: no longer answered for (off the list within the answers' 10 s), the other stays
    await a.set([sized('/', '1280x800')]);
    assert.equal(a.nameOf('/1080w1920h/'), null);
    await pass(12000);
    assert.deepEqual(b.list().map((s) => s.name), ['neomorph 1280x800']);
    b.stop();
    await closed(a);
  } finally {
    mock.timers.reset();
  }
});

// ── iva serve itself ─────────────────────────────────────────────

const ECHO = path.resolve(import.meta.dirname, '../fixtures/local/echo-system/echo.gui');
/** an IPv4 address of this machine's that isn't loopback (iva serve advertises on those) */
const lanIp = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === 'IPv4' && !a.internal)?.address;

test('iva serve: advertised while it runs (a .gui: its name, kind=gui, iva\'s version), a goodbye when it stops; --no-mdns: not at all', { skip: !lanIp && 'no network address here' }, async () => {
  const dir = tmpDir('iva-serve-mdns-');
  fs.copyFileSync(ECHO, path.join(dir, 'Echo.gui'));
  const net = new FakeNet();
  const made: FakeUdp[] = [];
  const mdnsSocket = () => {
    const s = new FakeUdp(net, [lanIp!]);
    made.push(s);
    return s as any;
  };
  const s = await startDeviceServer({ target: path.join(dir, 'Echo.gui'), port: 0, host: lanIp!, live: false, log: () => {}, mdnsSocket });
  try {
    assert.equal(s.advertisedAs, 'Echo');
    const ann = net.sent.find((x) => x.m.response && x.m.answers.some((r) => r.type === TYPE.PTR && r.name === '_iva._tcp.local'))!;
    assert.ok(ann, 'announced');
    const srv = ann.m.answers.find((r) => r.type === TYPE.SRV)!.data as { port: number; target: string };
    assert.equal(srv.port, s.port);
    assert.equal(srv.target, `${hostLabel(os.hostname())}-iva-${s.port}.local`);
    const info = servedInfo(txtData(ann.m.answers.find((r) => r.type === TYPE.TXT)!.data as string[]));
    assert.deepEqual(info, { path: '/', version: VERSION, project: 'Echo', kind: 'gui', sizes: [], host: os.hostname() });
    assert.deepEqual(ann.m.answers.filter((r) => r.type === TYPE.A).map((r) => r.data), [lanIp]);
  } finally {
    await s.close();
  }
  assert.ok(net.sent.some((x) => x.m.response && x.m.answers.length && x.m.answers.every((r) => r.ttl === 0)), 'a goodbye');
  assert.ok(made.length === 1 && made[0].closed);

  const off = await startDeviceServer({ target: path.join(dir, 'Echo.gui'), port: 0, host: lanIp!, live: false, log: () => {}, mdnsSocket, mdns: false });
  try {
    assert.equal(off.advertisedAs, null);
    assert.equal(made.length, 1);
  } finally {
    await off.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import path from 'node:path';
import { Bytes, ChannelType, Crypto, DnsRecordType, Environment, Network, StorageService } from '@matter/general';
import { CommissionableMdnsScanner, MdnsService, getOperationalDeviceQname } from '@matter/protocol';
import { NodeId } from '@matter/types';
// (the Node platform: a matter.js device in this process, for the end-to-end test)
import { Endpoint, ServerNode, VendorId } from '@matter/main';
import { DimmableLightDevice } from '@matter/main/devices/dimmable-light';
import { compile } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';
import type { CF, FoundService, LookupCallback } from '../lib/drivers/matter/runtime/cf.ts';
import { fromBinary, toBinary } from '../lib/drivers/matter/runtime/cf.ts';
import { SlotPool } from '../lib/drivers/matter/runtime/slots.ts';
import { CfNetwork, CfUdpSocket, macOf } from '../lib/drivers/matter/runtime/network.ts';
import { CfMdnsService, CfMdnsSocket, recordsOf, typeOf } from '../lib/drivers/matter/runtime/mdns.ts';
import { CfTokenStorageDriver, TokenStore } from '../lib/drivers/matter/runtime/storage.ts';
import { installPlatform } from '../lib/drivers/matter/runtime/environment.ts';
import { MatterDriver, parseAddress } from '../lib/drivers/matter/runtime/controller.ts';

/**
 * Just enough of iViewer's CF for the driver: what it sends on which system
 * (a byte a char), the systems retargeted, lookups started, tokens set;
 * frames and found services fed in from the test. With `udp`, the systems
 * are real sockets (a retargeted one bound on 127.0.0.1 at its localPort,
 * sending to its address and port; what comes back is its frame), as a
 * panel's are - for a matter.js device in this process.
 */
function panel(options: { udp?: boolean } = {}) {
  const sent: { system: string; bytes: number[] }[] = [];
  const props: { system: string; props: Record<string, unknown> }[] = [];
  const lookups: { type: string; name: string; cb: LookupCallback }[] = [];
  const stopped: string[] = [];
  const tokens: Record<string, string> = {};
  const joins: Record<string, string> = {};
  const log: string[] = [];
  const watchers: { event: string; args: unknown[]; cb: (...a: any[]) => void }[] = [];
  const sockets = new Map<string, dgram.Socket>();
  /** retargeted systems answer "connected" at once unless the test holds them (a phone binds slowly) */
  let holdConnections = false;
  const CF: CF = {
    FeedbackMatchedEvent: 'fb', JoinChangeEvent: 'join', ConnectionStatusChangeEvent: 'conn', GlobalTokensJoin: 'e0',
    ipv4address: options.udp ? '127.0.0.1' : '192.168.2.20', ipv4netmask: '255.255.255.0', MACaddress: '', runtime: 'iva',
    systems: Object.fromEntries(Array.from({ length: 3 }, (_, i) => [`matter${i}`, { address: '127.0.0.2', port: 5540, enabled: true }])),
    send(system, data) {
      sent.push({ system, bytes: [...fromBinary(data)] });
      const sys = CF.systems[system];
      sockets.get(system)?.send(fromBinary(data), sys.port, sys.address);
    },
    watch(event, ...args) {
      const cb = args.pop() as (...a: any[]) => void;
      watchers.push({ event, args, cb });
    },
    setSystemProperties(system, p) {
      props.push({ system, props: p });
      Object.assign(CF.systems[system], p);
      if (!options.udp) {
        if (!holdConnections) connect(system);
        return;
      }
      // the way the driver retargets: off (the socket closed), the address, on (bound again at its localPort)
      if (p.enabled === false) {
        sockets.get(system)?.close();
        sockets.delete(system);
      } else if (p.enabled === true) {
        const sock = dgram.createSocket('udp4');
        sock.on('message', (msg) => frame(system, [...msg]));
        sock.bind(CF.systems[system].localPort ?? 0, '127.0.0.1', () => connect(system));
        sockets.set(system, sock);
      }
    },
    startLookup(type, name, cb) { lookups.push({ type, name, cb }); },
    stopLookup(type) { stopped.push(type); },
    setToken(_join, name, value) { tokens[name] = value; },
    getJoin(join, cb) { cb(join, joins[join] ?? '', { ...tokens }); },
    setJoin(join, value) { joins[join] = String(value); },
    log(m) { log.push(m); },
  };
  /** the system's socket bound again: its ConnectionStatusChangeEvent */
  const connect = (system: string) => {
    for (const w of watchers) if (w.event === 'conn' && w.args[0] === system) w.cb(system, true, '');
  };
  /** a frame on a system, as its catch-all feedback matched it */
  const frame = (system: string, bytes: number[]) => {
    for (const w of watchers) if (w.event === 'fb' && w.args[0] === system && w.args[1] === 'frame') w.cb('frame', toBinary(Uint8Array.from(bytes)));
  };
  /** a service found by a lookup of the type */
  const found = (type: string, s: FoundService) => {
    for (const l of lookups) if (l.type === type) l.cb([s], [], undefined);
  };
  /** a join changed on the panel (a button, a slider): its JoinChangeEvent */
  const change = (join: string, value: string) => {
    joins[join] = value;
    for (const w of watchers) if (w.event === 'join' && w.args[0] === join) w.cb(join, value);
  };
  const close = () => {
    for (const s of sockets.values()) s.close();
    sockets.clear();
  };
  return { CF, sent, props, lookups, stopped, tokens, joins, log, frame, found, change, connect, close, hold: (h: boolean) => { holdConnections = h; } };
}

/** until `check` holds (polled), else the panel's log in the error */
async function until(check: () => boolean, what: string, log: string[], ms = 15000): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`${what}: not within ${ms} ms\n  ${log.slice(-15).join('\n  ')}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

test('a byte a char: CF.send\'s strings from bytes and back', () => {
  const all = Uint8Array.from({ length: 256 }, (_, i) => i);
  assert.equal(toBinary(all).length, 256);
  assert.deepEqual([...fromBinary(toBinary(all))], [...all]);
  assert.deepEqual([...fromBinary('€')], [0xac]);
});

test('the slot pool: a peer gets a free system, retargeted to it; its frames are the peer\'s; the longest unused slot goes to the next peer', () => {
  const p = panel();
  const pool = new SlotPool(p.CF, ['matter0', 'matter1', 'matter2'], [5550, 5551, 5552]);
  const got: [string, number, number[]][] = [];
  pool.onFrame((slot, bytes) => got.push([slot.host!, slot.port!, [...bytes]]));
  // a frame before any peer: nobody's
  p.frame('matter0', [1]);
  assert.deepEqual(got, []);
  pool.send('192.168.2.40', 5540, Uint8Array.from([1, 2, 255]));
  // off, retargeted (its own localPort again: iViewer keeps the old address without a restart), on
  assert.deepEqual(p.props, [
    { system: 'matter0', props: { enabled: false } },
    { system: 'matter0', props: { address: '192.168.2.40', port: 5540, localPort: 5550 } },
    { system: 'matter0', props: { enabled: true } },
  ]);
  assert.deepEqual(p.sent, [{ system: 'matter0', bytes: [1, 2, 255] }]);
  // the same peer again: the same slot, nothing retargeted
  pool.send('192.168.2.40', 5540, Uint8Array.from([3]));
  assert.equal(p.props.length, 3);
  assert.equal(p.sent[1].system, 'matter0');
  p.frame('matter0', [0, 128, 255]);
  assert.deepEqual(got, [['192.168.2.40', 5540, [0, 128, 255]]]);
  // two more peers fill the pool; a fourth takes the slot longest unused (the first one, idle since its frame)
  pool.send('192.168.2.41', 5540, Uint8Array.from([4]));
  pool.send('192.168.2.42', 5540, Uint8Array.from([5]));
  pool.send('192.168.2.42', 5540, Uint8Array.from([6]));
  pool.send('192.168.2.41', 5540, Uint8Array.from([7]));
  pool.send('192.168.2.43', 5540, Uint8Array.from([8]));
  assert.deepEqual(p.props.at(-2), { system: 'matter0', props: { address: '192.168.2.43', port: 5540, localPort: 5550 } });
  assert.equal(pool.slotOf('192.168.2.40', 5540), undefined);
  assert.equal(pool.slotOf('192.168.2.43', 5540)?.name, 'matter0');
});

test('a retargeted slot binds its socket again: what\'s sent meanwhile waits for its connection event, then goes in order', () => {
  const p = panel();
  const pool = new SlotPool(p.CF, ['matter0', 'matter1'], [5550, 5551]);
  p.hold(true);
  pool.send('192.168.2.40', 5540, Uint8Array.from([1]));
  pool.send('192.168.2.40', 5540, Uint8Array.from([2]));
  assert.deepEqual(p.sent, [], 'held till the system says it is connected');
  assert.equal(p.props.length, 3);
  p.connect('matter0');
  assert.deepEqual(p.sent, [{ system: 'matter0', bytes: [1] }, { system: 'matter0', bytes: [2] }]);
  pool.send('192.168.2.40', 5540, Uint8Array.from([3]));
  assert.equal(p.sent.length, 3, 'bound: sent at once');
  // another peer, its slot never says so: sent after READY_MS anyway
  pool.send('192.168.2.41', 5540, Uint8Array.from([4]));
  assert.equal(p.sent.length, 3);
});

test('the Network: a udp4 and a udp6 socket over the pool, each its family; IPv6 refused unless on; the device\'s address and a MAC', async () => {
  const p = panel();
  const pool = new SlotPool(p.CF, ['matter0', 'matter1', 'matter2'], [5550, 5551, 5552]);
  const net = new CfNetwork(p.CF, pool, false);
  assert.deepEqual(net.getNetInterfaces().map((i) => i.name), ['cf']);
  const details = net.getIpMac('cf')!;
  assert.deepEqual(details.ipV4, ['192.168.2.20']);
  assert.match(details.mac, /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/);
  assert.equal(macOf({ ...p.CF, MACaddress: 'AA:BB:CC:DD:EE:01' }), 'aa:bb:cc:dd:ee:01');
  // Android's placeholder (iViewer shows it) is no MAC
  assert.notEqual(macOf({ ...p.CF, MACaddress: '02:00:00:00:00:00' }), '02:00:00:00:00:00');
  const v6 = (await net.createUdpSocket({ type: 'udp6', listeningPort: 5550 })) as CfUdpSocket;
  const v4 = (await net.createUdpSocket({ type: 'udp4', listeningPort: 5550 })) as CfUdpSocket;
  assert.equal(v4.port, 5550);
  assert.ok(v4.supports(ChannelType.UDP, '10.0.0.1') && !v4.supports(ChannelType.UDP, 'fe80::1'));
  assert.ok(!v6.supports(ChannelType.UDP, 'fe80::1'), 'IPv6 off: the udp6 socket routes nothing');
  assert.ok(!v4.supports(ChannelType.TCP, '10.0.0.1'));
  const data4: string[] = [];
  const data6: string[] = [];
  const l4 = v4.onData((intf, host, port, bytes) => data4.push(`${intf} ${host}:${port} ${[...(bytes as Uint8Array)].join(',')}`));
  v6.onData((_i, host) => data6.push(host));
  await v4.send('192.168.2.40', 5540, Uint8Array.from([9, 8]));
  assert.deepEqual(p.sent, [{ system: 'matter0', bytes: [9, 8] }]);
  p.frame('matter0', [7]);
  assert.deepEqual(data4, ['cf 192.168.2.40:5540 7']);
  assert.deepEqual(data6, []);
  await assert.rejects(v6.send('fe80::1', 5540, Uint8Array.from([1])), /IPv6 is off/);
  await l4.close();
  p.frame('matter0', [6]);
  assert.equal(data4.length, 1);
  // with IPv6 on: the udp6 socket takes IPv6 peers (a slot targeted at the address)
  const net6 = new CfNetwork(p.CF, pool, true);
  const s6 = await net6.createUdpSocket({ type: 'udp6' });
  assert.ok(s6.supports(ChannelType.UDP, 'fe80::1'));
  await s6.send('fe80::1', 5540, Uint8Array.from([1]));
  assert.equal(p.props.at(-2)!.props.address, 'fe80::1');
});

test('DNS-SD from lookups: a found device as the records a responder sends (PTR with the subtypes, SRV, TXT, A); IPv6 only when on', () => {
  assert.equal(typeOf('_matterc._udp.local'), '_matterc._udp.');
  assert.equal(typeOf('_L3840._sub._matterc._udp.local'), '_matterc._udp.');
  assert.equal(typeOf('ABCD-1234._matter._tcp.local'), '_matter._tcp.');
  assert.equal(typeOf('host.local'), undefined);
  const r = recordsOf({ kind: 'commissionable', name: 'A1B2C3D4E5F60718', hostname: 'lamp.local', addresses: ['192.168.2.40', 'fe80::1'], port: 5540, data: { D: '3840', CM: '1', VP: '65521+32769', DN: 'Lamp', DT: '257' } }, false);
  const ptrs = r.answers.filter((x) => x.recordType === DnsRecordType.PTR).map((x) => x.name);
  assert.deepEqual(ptrs, ['_matterc._udp.local', '_L3840._sub._matterc._udp.local', '_S15._sub._matterc._udp.local', '_V65521._sub._matterc._udp.local', '_CM._sub._matterc._udp.local', '_T257._sub._matterc._udp.local']);
  const srv = r.answers.find((x) => x.recordType === DnsRecordType.SRV)!;
  assert.deepEqual(srv.value, { priority: 0, weight: 0, port: 5540, target: 'lamp.local' });
  assert.equal(srv.name, 'A1B2C3D4E5F60718._matterc._udp.local');
  const txt = r.answers.find((x) => x.recordType === DnsRecordType.TXT)!;
  assert.deepEqual((txt.value as Uint8Array[]).map((b) => new TextDecoder().decode(b)), ['D=3840', 'CM=1', 'VP=65521+32769', 'DN=Lamp', 'DT=257']);
  assert.deepEqual(r.additional.map((x) => [x.recordType, x.name, x.value]), [[DnsRecordType.A, 'lamp.local', '192.168.2.40']]);
  const r6 = recordsOf({ kind: 'operational', name: 'F1-01', hostname: 'lamp.local', addresses: ['fe80::1%wlan0'], port: 5540, data: {} }, true);
  assert.deepEqual(r6.additional.map((x) => [x.recordType, x.value]), [[DnsRecordType.AAAA, 'fe80::1']]);
  assert.equal(r6.answers.filter((x) => x.recordType === DnsRecordType.PTR).length, 1);
});

test('the DNS-SD source in matter.js\'s own scanner: a query starts the lookup, a found device is a commissionable device with its address, discriminator and name', async () => {
  const p = panel();
  const pool = new SlotPool(p.CF, ['matter0'], [5550]);
  const net = new CfNetwork(p.CF, pool, false);
  const env = new Environment('matter-test');
  installPlatform(env);
  env.set(Network, net);
  const socket = new CfMdnsSocket(p.CF, net, { ipv6: false });
  const service = new CfMdnsService(env, socket);
  assert.equal(env.get(MdnsService), service as unknown as MdnsService);
  const scanner = new CommissionableMdnsScanner(service.names);
  // the scanner asks: the lookup starts (once), nothing found yet
  const search = scanner.findCommissionableDevicesContinuously({ longDiscriminator: 3840 }, () => {});
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(p.lookups.map((l) => l.type), ['_matterc._udp.']);
  // iViewer finds the lamp (its TXT as the device publishes it; hostname with a dot at the end; an empty key as iViewer gives one)
  p.found('_matterc._udp.', { name: 'A1B2C3D4E5F60718', type: '_matterc._udp.', hostname: 'lamp-7a3f.local.', addresses: ['192.168.2.40'], port: 5540, data: { D: '3840', CM: '1', VP: '65521+32769', DN: 'Lamp', PI: null } });
  await new Promise((r) => setTimeout(r, 30));
  const devices = scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 3840 });
  assert.equal(devices.length, 1, 'found through DnssdNames');
  assert.equal(devices[0].D, 3840);
  assert.equal(devices[0].CM, 1);
  assert.equal(devices[0].DN, 'Lamp');
  assert.deepEqual(devices[0].addresses.map((a) => ('ip' in a ? `${a.ip}:${a.port}` : a.type)), ['192.168.2.40:5540']);
  assert.deepEqual(scanner.getDiscoveredCommissionableDevices({ longDiscriminator: 1 }), []);
  // what's found, for the table: the hostname's dot gone, an empty value kept as a flag
  assert.deepEqual(socket.all().map((f) => [f.kind, f.name, f.hostname, f.data]), [['commissionable', 'A1B2C3D4E5F60718', 'lamp-7a3f.local', { D: '3840', CM: '1', VP: '65521+32769', DN: 'Lamp', PI: '' }]]);
  scanner.cancelCommissionableDeviceDiscovery({ longDiscriminator: 3840 });
  await search;
  await scanner.close();
  await service.close();
  assert.deepEqual(p.stopped, ['_matterc._udp.']);
});

test('storage on persisted tokens: written as base64 chunks, read back by a new store; too much for the tokens is an error', async () => {
  const p = panel();
  const store = new TokenStore(p.CF, { prefix: 'matter_store_', chunks: 4, size: 64 });
  CfTokenStorageDriver.store = store;
  const driver = await CfTokenStorageDriver.create({ namespace: 'iva' } as any);
  assert.ok(driver.initialized);
  driver.set(['fabric'], 'label', 'iva');
  driver.set(['nodes', '1'], { name: 'Lamp', on: true, id: 7 });
  assert.equal(driver.get(['fabric'], 'label'), 'iva');
  assert.deepEqual(driver.keys(['nodes', '1']).sort(), ['id', 'name', 'on']);
  assert.deepEqual(driver.contexts(['nodes']), ['1']);
  assert.deepEqual(p.tokens, {}, 'not written yet');
  driver.commit();
  assert.deepEqual(Object.keys(p.tokens), ['[matter_store_0]', '[matter_store_1]', '[matter_store_2]', '[matter_store_3]']);
  assert.ok(p.tokens['[matter_store_0]'].length === 64 && p.tokens['[matter_store_1]'].length > 0, 'chunked');
  assert.match(p.tokens['[matter_store_0]'], /^[A-Za-z0-9+/=]+$/, 'base64: nothing a token substitution would touch');
  // a new store (a restart) reads it back from the tokens
  const again = new TokenStore(p.CF, { prefix: 'matter_store_', chunks: 4, size: 64 });
  CfTokenStorageDriver.store = again;
  const driver2 = await CfTokenStorageDriver.create({ namespace: 'iva' } as any);
  assert.equal(driver2.get(['fabric'], 'label'), 'iva');
  assert.deepEqual(driver2.values(['nodes', '1']), { name: 'Lamp', on: true, id: 7 });
  driver2.delete(['fabric'], 'label');
  driver2.commit();
  const third = new TokenStore(p.CF, { prefix: 'matter_store_', chunks: 4, size: 64 });
  await third.load();
  assert.equal(third.all.iva.fabric?.label, undefined);
  // more than the tokens hold
  driver2.set(['big'], 'x', 'y'.repeat(400));
  assert.throws(() => again.save(), /don't fit 4 tokens of 64/);
  await driver.close();
  await driver2.close();
});

test('<Matter>: the pool of UDP systems with the catch-all feedback, the tokens, the bundled script once, the start line with the joins', async () => {
  const dir = tmpDir('iva-matter-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `
import { Matter } from 'iva/drivers/matter';
const driver = (
  <Matter slots={3} port={6000} store={{ chunks: 2, size: 1000 }} devices={{
    lamp: { address: '192.168.2.40', node: '0x1', cluster: 'OnOff', join: d('lamp') },
    level: { node: 2, endpoint: 3, cluster: 'LevelControl', join: a('level') },
    colour: { node: '2', cluster: 'ColorControl', hue: a('hue'), saturation: a('sat') },
  }} commission={{ code: s('setupCode'), go: d('commission'), status: s('matterStatus') }} found={s('matterFound')} />
);
export default (
  <Project name="T" width={1024} height={768}>
    <Page name="A"><Text w={10} h={10} join={s('matterStatus')} />{driver}</Page>
    <Page name="B">{driver}</Page>
  </Project>
);`);
  const r = await compile(path.join(dir, 'app.jsx'));
  assert.deepEqual(r.warnings, []);
  const systems = [...r.xml.matchAll(/<system name="(matter\d)" ip="([^"]*)" port="(\d+)" origin="(\d+)" protocol="udp" alwayson="1" offlinequeue="1" accept="1"[^>]*textEncoding="([^"]*)"[^>]*>\s*<fb name="frame" regex="([^"]*)"/g)].map((m) => m.slice(1));
  assert.deepEqual(systems, [
    ['matter0', '127.0.0.2', '5540', '6000', 'iso-8859-1', '(?s)(.+)'],
    ['matter1', '127.0.0.2', '5540', '6001', 'iso-8859-1', '(?s)(.+)'],
    ['matter2', '127.0.0.2', '5540', '6002', 'iso-8859-1', '(?s)(.+)'],
  ]);
  assert.deepEqual([...r.xml.matchAll(/<token name="([^"]+)" value="" persist="1" \/>/g)].map((m) => m[1]), ['[matter_store_0]', '[matter_store_1]']);
  assert.deepEqual(r.scripts.map((s) => s.name), ['iva-joins.js', 'iva-matter.js', 'iva-start.js']);
  const bundle = r.scripts.find((s) => s.name === 'iva-matter.js')!.code!;
  assert.ok(bundle.length > 1_000_000 && bundle.length < 4_000_000, `${bundle.length} bytes`);
  assert.ok(bundle.includes('IvaMatter') && bundle.includes('adminFabricLabel'), 'the driver and matter.js in one script');
  assert.doesNotThrow(() => new Function(bundle));
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaMatter\.start\(/g)!.length, 1, 'started once');
  assert.match(start, /IvaMatter\.start\(\{ slots: 3, port: 6000, label: "iva", ipv6: false, store: \{ prefix: "matter_store_", chunks: 2, size: 1000 \}, devices: \{ "lamp": \{ address: "192\.168\.2\.40", node: "0x1", cluster: "OnOff", join: Joins\.d\["lamp"\] \}, "level": \{ node: "2", endpoint: 3, cluster: "LevelControl", join: Joins\.a\["level"\] \}, "colour": \{ node: "2", cluster: "ColorControl", hue: Joins\.a\["hue"\], saturation: Joins\.a\["sat"\] \} \}, commission: \{ code: Joins\.s\["setupCode"\], go: Joins\.d\["commission"\], status: Joins\.s\["matterStatus"\] \}, found: Joins\.s\["matterFound"\] \}\);/);
  // the joins the driver uses exist for scripts (held by hidden elements where no element has them)
  assert.deepEqual(Object.keys(r.joins.digital).sort(), ['commission', 'lamp']);
  assert.deepEqual(Object.keys(r.joins.analog).sort(), ['hue', 'level', 'sat']);
  assert.deepEqual(Object.keys(r.joins.serial).sort(), ['matterFound', 'matterStatus', 'setupCode']);
});

test('the matter example builds, at both sizes, with the driver\'s script once; the environment comes up (Web Crypto, the token storage)', async () => {
  const entry = path.resolve(import.meta.dirname, '../examples/matter/app.jsx');
  for (const size of [undefined, '1400x1400@3x']) {
    const r = await compile(entry, size ? { size } : {});
    assert.deepEqual(r.warnings, [], size);
    assert.equal(r.scripts.filter((s) => s.name === 'iva-matter.js').length, 1);
    assert.equal((r.xml.match(/<system name="matter\d"/g) ?? []).length, 10);
    assert.ok(r.xml.includes('<system name="ProbeEcho"'));
    for (const sc of r.scripts) if (sc.code) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  }
  const { createEnvironment } = await import('../lib/drivers/matter/runtime/environment.ts');
  const p = panel();
  const me = createEnvironment(p.CF, { slots: ['matter0'], localPorts: [5550], ipv6: false, store: { prefix: 'matter_store_', chunks: 2, size: 1000 } }, new Environment('matter-env-test'));
  assert.equal(me.env.get(StorageService).defaultDriver, 'cf-tokens');
  assert.ok(me.env.has(Network));
  // (Node's default environment brings its own crypto; a panel gets StandardCrypto over Web Crypto)
  assert.ok(['JS', 'Node.js'].includes(me.env.get(Crypto).implementationName), me.env.get(Crypto).implementationName);
  assert.equal(Bytes.of(me.env.get(Crypto).randomBytes(4)).length, 4);
});

test('an address as typed on the Commission page: host, host:port, [v6]:port, v6; empty: none', () => {
  assert.deepEqual(parseAddress(' 192.168.2.40 '), { type: 'udp', ip: '192.168.2.40', port: 5540 });
  assert.deepEqual(parseAddress('192.168.2.40:5541'), { type: 'udp', ip: '192.168.2.40', port: 5541 });
  assert.deepEqual(parseAddress('[fe80::1%wlan0]:5542'), { type: 'udp', ip: 'fe80::1%wlan0', port: 5542 });
  assert.deepEqual(parseAddress('fe80::1'), { type: 'udp', ip: 'fe80::1', port: 5540 });
  assert.equal(parseAddress('  '), undefined);
});

const LIGHT_PORT = 55540;

/**
 * The whole way, as on a phone: a matter.js dimmable light in this process
 * (on 127.0.0.1), the fake panel's systems real UDP sockets, Bonjour's
 * findings fed in. The driver commissions the light from its setup code
 * (PASE, the certificates, CASE, commissioning complete), binds the
 * devices of app.jsx to it (a join's change is a command, the light's own
 * change sets the join through the subscription), and a second driver
 * (a reload) comes back from the tokens with the node and controls it.
 */
test('end to end: a matter.js light commissioned over the fake panel\'s UDP systems, controlled both ways, back from the tokens after a reload', async () => {
  Environment.default.vars.set('storage.path', tmpDir('iva-matter-light-'));
  const light = await ServerNode.create({
    id: 'iva-test-light',
    network: { port: LIGHT_PORT, listeningAddressIpv4: '127.0.0.1' },
    commissioning: { passcode: 20202021, discriminator: 3840 },
    productDescription: { name: 'iva test light', deviceType: DimmableLightDevice.deviceType },
    basicInformation: {
      vendorName: 'iva', vendorId: VendorId(0xfff1), nodeLabel: 'iva test light', productName: 'Test light', productLabel: 'Test light',
      productId: 0x8000, serialNumber: 'iva-test-light-1', uniqueId: 'iva-test-light-1',
    },
  });
  const bulb = new Endpoint(DimmableLightDevice, { id: 'bulb' });
  await light.add(bulb);
  await light.start();
  const p = panel({ udp: true });
  const options = {
    slots: 3, port: 56550, store: { prefix: 'matter_store_', chunks: 4, size: 32768 },
    devices: { lamp: { node: '1', cluster: 'OnOff' as const, join: 'd1' }, level: { node: '1', cluster: 'LevelControl' as const, join: 'a1' } },
    commission: { code: 's1', go: 'd9', status: 's2', address: 's3' }, found: 's4',
  };
  let driver = new MatterDriver(p.CF, options, new Environment('cf-e2e'));
  try {
    await driver.start();
    assert.match(p.joins.s2, /Controller up: 0 node/);
    assert.ok(p.log.some((l) => /lamp: node 1 is not commissioned/.test(l)), p.log.join('\n'));
    // Bonjour finds the light, commissionable (as the panel would tell the driver); and, once it's node 1 of our
    // fabric, operational under that name - told now, asked for by matter.js after PASE
    p.found('_matterc._udp.', { name: 'LIGHT01', hostname: 'light.local', addresses: ['127.0.0.1'], port: LIGHT_PORT, data: { D: '3840', CM: '1', VP: '65521+32768', DN: 'iva test light' } });
    const operational = getOperationalDeviceQname(driver.controller!.fabric.globalId, NodeId(BigInt(1))).replace(/\._matter\._tcp\.local$/i, '');
    p.found('_matter._tcp.', { name: operational, hostname: 'light.local', addresses: ['127.0.0.1'], port: LIGHT_PORT, data: {} });
    assert.match(p.joins.s4, /"kind":"commissionable"/);
    // the Commission page: the code, Go
    p.change('s1', '34970112332');
    p.change('d9', '1');
    await until(() => /^Commissioned: node 1/.test(p.joins.s2) || /failed/.test(p.joins.s2), 'commissioned', p.log, 30000);
    assert.equal(p.joins.s2, 'Commissioned: node 1 - connecting lamp, level');
    assert.ok(light.state.commissioning.commissioned, 'the light says so too');
    assert.deepEqual(driver.controller!.getCommissionedNodes().map(String), ['1']);
    await until(() => p.log.some((l) => /level: LevelControl bound/.test(l)) && p.log.some((l) => /lamp: OnOff bound/.test(l)), 'bound', p.log);
    assert.match(p.joins.s4, /"kind":"node of ours"/);
    // a join's change is a command to the light
    p.change('d1', '1');
    await until(() => bulb.state.onOff.onOff === true, 'the lamp on', p.log);
    p.change('a1', String(Math.round((127 / 254) * 65535)));
    await until(() => bulb.state.levelControl.currentLevel === 127, 'the level at 127', p.log);
    // the light's own change sets the join (the subscription)
    await bulb.set({ onOff: { onOff: false } });
    await until(() => p.joins.d1 === '0', 'the lamp join off', p.log);
    // a reload: the driver again from the same tokens - the node is back, connected, controlled
    await driver.stop();
    assert.ok(p.tokens['[matter_store_0]'].length > 1000, 'the store in the tokens');
    driver = new MatterDriver(p.CF, options, new Environment('cf-e2e-again'));
    await driver.start();
    assert.match(p.joins.s2, /Controller up: 1 node\(s\) commissioned \(1\)/);
    await until(() => p.log.filter((l) => /lamp: OnOff bound/.test(l)).length === 2, 'bound again', p.log);
    p.change('d1', '1');
    await until(() => bulb.state.onOff.onOff === true, 'the lamp on again', p.log);
  } finally {
    await driver.stop();
    p.close();
    await light.close();
  }
});

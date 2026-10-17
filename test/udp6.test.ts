/**
 * A UDP system with an IPv6 address (::1, ff02::fb): a v6 socket, bound on
 * every v6 interface, no broadcast flag; a retarget from v4 to v6 opens one.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { ControlSystem } from '../src/runtime/cf/systemManager.ts';
import { net } from '../src/runtime/stdlib/net/index.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

// the CF object reads window as it is made (as the systems test gives one)
(globalThis as any).window ??= { devicePixelRatio: 1 };

class FakeUdp extends EventEmitter {
  port = -1;
  addr = '';
  sent: [number, string][] = [];
  broadcast = false;
  memberships: string[] = [];
  constructor(public type: string) {
    super();
  }
  bind(port: number, addr: string, cb: () => void) {
    this.port = port;
    this.addr = addr;
    queueMicrotask(cb);
    return this;
  }
  send(_b: Uint8Array, _o: number, _l: number, port: number, host: string) {
    this.sent.push([port, host]);
  }
  close() {
    return this;
  }
  addMembership(a: string) {
    this.memberships.push(a);
  }
  dropMembership() {}
  setBroadcast(on: boolean) {
    this.broadcast = on;
  }
}

const udps: FakeUdp[] = [];
net.setProvider({
  name: 'fake6',
  Socket: class {},
  Server: class {},
  createTcpSocket: () => { throw new Error('no tcp here'); },
  createUdpSocket: (opts: any) => {
    const u = new FakeUdp(typeof opts === 'string' ? opts : opts?.type ?? 'udp4');
    udps.push(u);
    return u as any;
  },
  createTcpServer: () => { throw new Error('no tcp here'); },
} as any);

function gui(system: Record<string, string>) {
  joinStore.clear();
  udps.length = 0;
  const cf = new CFAPI();
  (cf as any).renderer = { project: { commands: {}, systems: [], macros: [] } };
  const sys = new ControlSystem(cf, { type: 'system', attributes: { name: 'Dev', port: '5545', protocol: 'udp', ...system }, children: [] } as any);
  cf.controlSystems = { [sys.name]: sys };
  return { cf, sys };
}

const flush = () => new Promise((r) => setImmediate(r));

test('an IPv6 address: a udp6 socket bound on ::, sent to the address, no broadcast flag', async () => {
  const { sys } = gui({ ip: '::1', acceptBroadcasts: '1' });
  sys.start();
  await flush();
  assert.equal(udps.length, 1);
  assert.equal(udps[0].type, 'udp6');
  assert.equal(udps[0].addr, '::');
  assert.equal(udps[0].port, 5545, 'origin 0: the remote port, as for v4');
  assert.equal(udps[0].broadcast, false, 'IPv6 has no broadcast');
  sys.send('hi');
  assert.deepEqual(udps[0].sent, [[5545, '::1']]);
  sys.stop();
});

test('an IPv6 multicast address (ff02::fb, mDNS) is joined; an IPv4 one still is', async () => {
  const v6 = gui({ ip: 'ff02::fb', port: '5353' });
  v6.sys.start();
  await flush();
  assert.deepEqual(udps[0].memberships, ['ff02::fb']);
  v6.sys.stop();
  const v4 = gui({ ip: '239.255.255.250', port: '1900' });
  v4.sys.start();
  await flush();
  assert.equal(udps[0].type, 'udp4');
  assert.equal(udps[0].addr, '0.0.0.0');
  assert.deepEqual(udps[0].memberships, ['239.255.255.250']);
  v4.sys.stop();
});

test('CF.setSystemProperties to an IPv6 address: the v4 socket is replaced by a v6 one', async () => {
  const { cf, sys } = gui({ ip: '10.0.0.9' });
  sys.start();
  await flush();
  assert.equal(udps[0].type, 'udp4');
  cf.setSystemProperties('Dev', { address: 'fe80::1', port: 5540 });
  await flush();
  assert.equal(udps.length, 2);
  assert.equal(udps[1].type, 'udp6');
  assert.equal(udps[1].addr, '::');
  sys.send('x');
  assert.deepEqual(udps[1].sent, [[5540, 'fe80::1']]);
  sys.stop();
});

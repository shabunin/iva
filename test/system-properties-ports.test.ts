import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { ControlSystem } from '../src/runtime/cf/systemManager.ts';
import { net } from '../src/runtime/stdlib/net/index.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

(globalThis as any).window ??= { devicePixelRatio: 1 };

const text = (b: Uint8Array) => String.fromCharCode(...b);

/** a connection as the panel's host gives one: a string where the port goes is a path, which it refuses */
class FakeSocket extends EventEmitter {
  destroyed = false;
  to?: [number, string];
  connect(port: unknown, host: string) {
    if (typeof port === 'string') throw new Error('IPC / Unix Domain Sockets are not supported on Tauri');
    this.to = [port as number, host];
    return this;
  }
  setKeepAlive() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  write() {
    return true;
  }
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      this.emit('close', false);
    }
    return this;
  }
}
class FakeUdp extends EventEmitter {
  port?: unknown;
  sent: [string, unknown, string][] = [];
  bind(port: unknown, _addr: string, cb: () => void) {
    this.port = port;
    queueMicrotask(cb);
    return this;
  }
  send(b: Uint8Array, _o: number, _l: number, port: unknown, host: string) {
    this.sent.push([text(b), port, host]);
  }
  close() {
    return this;
  }
  setBroadcast() {}
}

const opened: FakeSocket[] = [];
const udps: FakeUdp[] = [];
net.setProvider({
  name: 'fake',
  Socket: class extends FakeSocket {
    constructor() {
      super();
      opened.push(this);
    }
  },
  Server: EventEmitter,
  createTcpSocket: () => new FakeSocket() as any,
  createUdpSocket: () => {
    const u = new FakeUdp();
    udps.push(u);
    return u as any;
  },
  createTcpServer: () => new EventEmitter() as any,
} as any);

function gui(system: Record<string, string>) {
  joinStore.clear();
  const cf = new CFAPI();
  (cf as any).renderer = { project: { commands: {}, systems: [], macros: [] } };
  const sys = new ControlSystem(cf, { type: 'system', attributes: { name: 'Dev', ip: '10.0.0.9', port: '4000', ...system }, children: [] } as any);
  cf.controlSystems = { [sys.name]: sys };
  return { cf, sys };
}

const flush = () => new Promise((r) => setImmediate(r));

test("CF.setSystemProperties: a TCP system's port given as a string (a text field's, a serial join's value) is its number - connected there, as often as it's changed", () => {
  opened.length = 0;
  const { cf, sys } = gui({ alwayson: '1' });
  sys.start();
  assert.deepEqual(opened.at(-1)!.to, [4000, '10.0.0.9']);
  cf.setSystemProperties('Dev', { address: '10.0.0.7', port: '23' });
  assert.equal(sys.port, 23);
  assert.deepEqual(opened.at(-1)!.to, [23, '10.0.0.7']);
  // not wedged: changed again, connected again
  cf.setSystemProperties('Dev', { port: ' 24 ' });
  assert.deepEqual(opened.at(-1)!.to, [24, '10.0.0.7']);
  sys.stop();
});

test("CF.setSystemProperties: a UDP system's ports given as strings are numbers - bound on its own, sent to the remote", async () => {
  udps.length = 0;
  const { cf, sys } = gui({ protocol: 'udp', port: '19999', origin: '0' });
  sys.start();
  await flush();
  cf.setSystemProperties('Dev', { port: '5005', localPort: '5006' });
  await flush();
  const u = udps.at(-1)!;
  assert.equal(u.port, 5006);
  sys.send('hi');
  assert.deepEqual(u.sent, [['hi', 5005, '10.0.0.9']]);
  // -1: any port of its own
  cf.setSystemProperties('Dev', { localPort: '-1' });
  await flush();
  assert.equal(udps.at(-1)!.port, 0);
  sys.stop();
});

test('CF.setSystemProperties: what is not a port (text, a fraction, out of range, empty) leaves the port as it was - and the connection, not restarted for it', () => {
  opened.length = 0;
  const { cf, sys } = gui({ alwayson: '1', origin: '7000' });
  sys.start();
  const warn = console.warn;
  const warned: string[] = [];
  console.warn = (...a: unknown[]) => void warned.push(a.join(' '));
  try {
    for (const bad of ['abc', '23.5', 70000, -1, '', null]) cf.setSystemProperties('Dev', { port: bad });
    cf.setSystemProperties('Dev', { localPort: -2 });
  } finally {
    console.warn = warn;
  }
  assert.equal(sys.port, 4000);
  assert.equal(sys.localPort, 7000);
  assert.deepEqual(opened.at(-1)!.to, [4000, '10.0.0.9']);
  assert.equal(opened.length, 1, 'reconnected for a port it was not given');
  assert.equal(warned.filter((w) => w.includes('is not a port')).length, 7);
  sys.stop();
});

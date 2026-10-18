import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { ControlSystem } from '../src/runtime/cf/systemManager.ts';
import { net } from '../src/runtime/stdlib/net/index.ts';
import { setHost } from '../src/runtime/stdlib/host.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

// The systems' sockets through what a panel on the wall lives through: sleep and wake, a server switched
// off and on, a link that keeps dropping, another network, a reload - never two sockets for one system,
// never one left behind, every state the one the GUI believes.

(globalThis as any).window ??= { devicePixelRatio: 1 };

/** the host's TCP ports held by servers not closed yet: a listen on one fails, as the kernel's would */
const held = new Set<number>();

class FakeSocket extends EventEmitter {
  destroyed = false;
  to?: [number, string];
  kept: [boolean, number][] = [];
  noDelay = false;
  connect(port: number, host: string) {
    this.to = [port, host];
    return this;
  }
  write() {
    return true;
  }
  end() {
    return this.destroy();
  }
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      this.emit('close', false);
    }
    return this;
  }
  up() {
    this.emit('connect');
  }
  setKeepAlive(on: boolean, ms: number) {
    this.kept.push([on, ms]);
    return this;
  }
  setNoDelay(on: boolean) {
    this.noDelay = on;
    return this;
  }
}
class FakeServer extends EventEmitter {
  port?: number;
  gone = false;
  /** how the host answers close(cb): the port let go and the callback at once, unless a test holds it */
  closes: (cb?: () => void) => void = (cb) => {
    this.letGo();
    cb?.();
  };
  listen(port: number) {
    this.port = port;
    if (held.has(port)) {
      queueMicrotask(() => this.emit('error', Object.assign(new Error('Address already in use (os error 98)'), { code: 'EADDRINUSE', syscall: 'listen' })));
    } else held.add(port);
    return this;
  }
  letGo() {
    if (this.port !== undefined && !this.gone) {
      this.gone = true;
      held.delete(this.port);
    }
  }
  close(cb?: () => void) {
    this.closes(cb);
    return this;
  }
}
class FakeUdp extends EventEmitter {
  port?: number;
  closed = false;
  bind(port: number, _addr: string, cb: () => void) {
    this.port = port;
    queueMicrotask(cb);
    return this;
  }
  send() {}
  close() {
    this.closed = true;
    return this;
  }
  addMembership() {}
  dropMembership() {}
  setBroadcast() {}
}

const opened: FakeSocket[] = [];
const servers: FakeServer[] = [];
const udps: FakeUdp[] = [];
net.setProvider({
  name: 'fake',
  Socket: class extends FakeSocket {
    constructor() {
      super();
      opened.push(this);
    }
  },
  Server: FakeServer,
  createTcpSocket: () => new FakeSocket() as any,
  createUdpSocket: () => {
    const u = new FakeUdp();
    udps.push(u);
    return u as any;
  },
  createTcpServer: () => {
    const s = new FakeServer();
    servers.push(s);
    return s as any;
  },
});
const reset = () => {
  opened.length = 0;
  servers.length = 0;
  udps.length = 0;
  held.clear();
};
const flush = () => new Promise((r) => setImmediate(r));

/** a GUI with a web server (TCP server on 8900), an Always On client (AVR) and a multicast UDP system */
function gui() {
  joinStore.clear();
  const cf = new CFAPI();
  (cf as any).renderer = { project: { commands: {}, systems: [], macros: [] } };
  const mk = (attributes: Record<string, string>) => new ControlSystem(cf, { type: 'system', attributes, children: [] } as any);
  const web = mk({ name: 'Web', ip: '0.0.0.0', port: '8900', origin: '8900', accept: '1', alwayson: '1' });
  const avr = mk({ name: 'AVR', ip: '10.0.0.9', port: '23', alwayson: '1', connectionStatus: '10', disconnectionStatus: '11' });
  const ssdp = mk({ name: 'SSDP', ip: '239.255.255.250', port: '1900', origin: '1900', protocol: 'udp' });
  cf.controlSystems = { Web: web, AVR: avr, SSDP: ssdp };
  // the client's connection events (a UDP system says up and down too, as it binds and closes)
  const events: string[] = [];
  cf.watch(cf.ConnectionStatusChangeEvent, 'AVR', (name: string, up: boolean) => events.push(`${name} ${up ? 'up' : 'down'}`));
  return { cf, web, avr, ssdp, events, d: (j: string) => joinStore.get(j, 'd') };
}

test('asleep (Disconnect on Sleep): the server, the connection and the UDP socket close and the joins go down; awake: the client connects and UDP binds again at once, the server listens again once the host let its old port go', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    reset();
    const { cf, events, d } = gui();
    cf.startSystems();
    await flush();
    opened[0].up();
    assert.deepEqual([servers.length, opened.length, udps.length], [1, 1, 1]);
    assert.equal(d('10'), true);
    // the host takes a moment to let the server's port go
    let letGo: (() => void) | undefined;
    servers[0].closes = (cb) => {
      letGo = () => {
        servers[0].letGo();
        cb?.();
      };
    };
    cf.suspend();
    assert.ok(opened[0].destroyed && udps[0].closed, 'closed');
    assert.equal(d('11'), true);
    assert.equal(d('10'), false);
    assert.deepEqual(events, ['AVR up', 'AVR down']);
    cf.setAsleep(false);
    mock.timers.tick(250);
    await flush();
    assert.deepEqual([opened.length, udps.length, servers.length], [2, 2, 1], 'the server waits for its port');
    letGo!();
    await flush();
    assert.equal(servers.length, 2);
    assert.equal(servers[1].port, 8900);
    assert.ok(held.has(8900));
    opened[1].up();
    assert.deepEqual(events, ['AVR up', 'AVR down', 'AVR up']);
    await cf.stopSystems();
  } finally {
    mock.timers.reset();
  }
});

test('a system a script enables while the GUI sleeps opens nothing: it starts on the wake, once', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    reset();
    const { cf } = gui();
    cf.suspend();
    cf.setSystemProperties('AVR', { enabled: true });
    cf.setSystemProperties('Web', { enabled: false });
    cf.setSystemProperties('Web', { enabled: true });
    await flush();
    assert.deepEqual([opened.length, servers.length], [0, 0]);
    cf.setAsleep(false);
    mock.timers.tick(250);
    await flush();
    assert.deepEqual([opened.length, servers.length, udps.length], [1, 1, 1]);
    await cf.stopSystems();
  } finally {
    mock.timers.reset();
  }
});

test('a server switched off and on at once listens again once the host let its port go - after a second should the host say nothing; switched off again meanwhile, nothing opens', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    reset();
    const { cf, web } = gui();
    web.start();
    let letGo: (() => void) | undefined;
    servers[0].closes = (cb) => {
      letGo = () => {
        servers[0].letGo();
        cb?.();
      };
    };
    cf.setSystemProperties('Web', { enabled: false });
    cf.setSystemProperties('Web', { enabled: true });
    await flush();
    assert.equal(servers.length, 1, 'waits for the port');
    letGo!();
    await flush();
    assert.equal(servers.length, 2);
    // the host says nothing: a second, then listened on anyway
    servers[1].closes = () => servers[1].letGo();
    cf.setSystemProperties('Web', { enabled: false });
    cf.setSystemProperties('Web', { enabled: true });
    mock.timers.tick(999);
    await flush();
    assert.equal(servers.length, 2);
    mock.timers.tick(1);
    await flush();
    assert.equal(servers.length, 3);
    // off again while it waits: nothing opens
    servers[2].closes = () => {};
    cf.setSystemProperties('Web', { enabled: false });
    cf.setSystemProperties('Web', { enabled: true });
    cf.setSystemProperties('Web', { enabled: false });
    mock.timers.tick(1000);
    await flush();
    assert.equal(servers.length, 3);
  } finally {
    mock.timers.reset();
  }
});

test('a client dropped again and again connects again after 3 s, then half as long again each time, 30 s at most; a connection that held 5 s starts the waits over', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  mock.method(Math, 'random', () => 0.5);
  try {
    reset();
    const { cf, avr } = gui();
    avr.start();
    const waits: number[] = [];
    const drop = () => {
      const n = opened.length;
      opened[n - 1].destroy();
      let w = 0;
      while (opened.length === n) {
        mock.timers.tick(100);
        w += 100;
        if (w > 60000) throw new Error('no reconnect');
      }
      waits.push(w);
    };
    opened[0].up();
    mock.timers.tick(100);
    for (let i = 0; i < 7; i++) drop();
    assert.deepEqual(waits, [3000, 4500, 6800, 10200, 15200, 22800, 30000]);
    opened[opened.length - 1].up();
    mock.timers.tick(5000);
    drop();
    assert.equal(waits[7], 3000);
    await cf.stopSystems();
  } finally {
    mock.timers.reset();
    mock.restoreAll();
  }
});

test('every connection asks the host for keepalive (10 s) and no delay', () => {
  reset();
  const { avr } = gui();
  avr.start();
  opened[0].up();
  assert.deepEqual(opened[0].kept, [[true, 10000]]);
  assert.equal(opened[0].noDelay, true);
  avr.stop();
});

test('the network changed while awake (another address): the client connects anew at once, a retry still waiting goes now, UDP binds again, the server stays; scripts hear NetworkStatusChangeEvent; asleep, nothing is looked at', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let ip = '10.0.0.5';
  const device = async () => ({ platform: 'Test', version: '1', model: 'm', name: 'n', uuid: 'u', ipv4address: ip, ipv4netmask: '255.255.255.0', ipv6address: '', ipv6netmask: '', MACaddress: '', networkType: 'WiFi', networkSSID: 'x' });
  setHost({ device } as any);
  try {
    reset();
    const { cf, events } = gui();
    const heard: string[] = [];
    cf.watch(cf.NetworkStatusChangeEvent, (s: { ipv4address: string }) => heard.push(s.ipv4address));
    await cf.loadDevice();
    cf.startSystems();
    await flush();
    opened[0].up();
    assert.equal(await cf.checkNetwork(), false, 'the same network');
    assert.deepEqual([opened.length, servers.length, udps.length], [1, 1, 1]);
    ip = '192.168.1.7';
    assert.equal(await cf.checkNetwork(), true);
    await flush();
    assert.ok(opened[0].destroyed);
    assert.ok(udps[0].closed);
    assert.deepEqual([opened.length, servers.length, udps.length], [2, 1, 2]);
    assert.deepEqual(heard, ['192.168.1.7']);
    assert.deepEqual(events, ['AVR up', 'AVR down']);
    // a client waiting to try again: now
    opened[1].destroy();
    ip = '10.0.0.6';
    assert.equal(await cf.checkNetwork(), true);
    assert.equal(opened.length, 3);
    cf.suspend();
    ip = '10.0.0.7';
    assert.equal(await cf.checkNetwork(), false, 'asleep');
    await cf.stopSystems();
  } finally {
    mock.timers.reset();
    setHost(null);
  }
});

test("a reload: the next GUI's server finds its port held while the old one still closes and listens on it 3 s later; after `await CF.stopSystems()` it listens at once", async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    reset();
    const a = gui();
    a.web.start();
    let letGo: (() => void) | undefined;
    servers[0].closes = (cb) => {
      letGo = () => {
        servers[0].letGo();
        cb?.();
      };
    };
    const stopping = a.cf.stopSystems();
    const b = gui();
    b.web.start();
    await flush();
    assert.equal(servers.length, 2);
    assert.equal(servers[1].port, 8900);
    letGo!();
    await stopping;
    mock.timers.tick(3000);
    await flush();
    assert.equal(servers.length, 3, 'listened on again once free');
    assert.ok(held.has(8900));
    await b.cf.stopSystems();
    // waited for: at once
    reset();
    const c = gui();
    c.web.start();
    servers[0].closes = (cb) => {
      setTimeout(() => {
        servers[0].letGo();
        cb?.();
      }, 200);
    };
    const done = c.cf.stopSystems();
    mock.timers.tick(200);
    await done;
    const e = gui();
    e.web.start();
    await flush();
    assert.equal(servers.length, 2);
    assert.equal(servers[1].port, 8900);
    await e.cf.stopSystems();
  } finally {
    mock.timers.reset();
  }
});

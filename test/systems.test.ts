import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { ControlSystem } from '../src/runtime/cf/systemManager.ts';
import { TextIn, encodeText } from '../src/runtime/cf/textCodec.ts';
import { net } from '../src/runtime/stdlib/net/index.ts';
import { setHost, getHost } from '../src/runtime/stdlib/host.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

(globalThis as any).window ??= { devicePixelRatio: 1 };

const text = (b: Uint8Array) => String.fromCharCode(...b);

/** a connection as the host gives one: what's written, what it was opened to */
class FakeSocket extends EventEmitter {
  destroyed = false;
  written: string[] = [];
  to?: [number, string];
  remoteAddress = '10.0.0.9';
  remotePort = 50000;
  connect(port: number, host: string) {
    this.to = [port, host];
    return this;
  }
  write(b: Uint8Array) {
    this.written.push(text(b));
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
  /** the far end: up, saying something */
  up() {
    this.emit('connect');
  }
  says(s: string) {
    this.emit('data', Uint8Array.from(s, (c) => c.charCodeAt(0)));
  }
}
class FakeServer extends EventEmitter {
  port?: number;
  listen(port: number) {
    this.port = port;
    return this;
  }
  close() {
    return this;
  }
}
class FakeUdp extends EventEmitter {
  port?: number;
  sent: [string, number, string][] = [];
  broadcast = false;
  bind(port: number, _addr: string, cb: () => void) {
    this.port = port;
    queueMicrotask(cb);
    return this;
  }
  send(b: Uint8Array, _o: number, _l: number, port: number, host: string) {
    this.sent.push([text(b), port, host]);
  }
  close() {
    return this;
  }
  addMembership() {}
  dropMembership() {}
  setBroadcast(on: boolean) {
    this.broadcast = on;
  }
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

/** a GUI's CF object with these commands (name -> [system, value, attributes]) and the system */
function gui(system: Record<string, string>, commands: Record<string, [string, string, Record<string, string>?]> = {}) {
  joinStore.clear();
  const cf = new CFAPI();
  const cmds = Object.fromEntries(Object.entries(commands).map(([name, [sys, value, attrs]]) =>
    [name, { type: 'cmd', text: value, js: attrs?.js, attributes: { name, system: sys, ...attrs }, children: [] }]));
  (cf as any).renderer = { project: { commands: cmds, systems: [], macros: [] } };
  const sys = new ControlSystem(cf, { type: 'system', attributes: { name: 'Dev', ip: '10.0.0.9', port: '4000', ...system }, children: [] } as any);
  cf.controlSystems = { [sys.name]: sys };
  const events: string[] = [];
  cf.watch(cf.ConnectionStatusChangeEvent, (name: string, up: boolean) => events.push(`${name} ${up ? 'up' : 'down'}`));
  return { cf, sys, events, d: (j: string) => joinStore.get(j, 'd') };
}

const flush = () => new Promise((r) => setImmediate(r));

test('Always On: connected from the start; the Disconnected join high till then; the Startup Command first on each connect, then what was queued', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    opened.length = 0;
    const { cf, sys, events, d } = gui({ alwayson: '1', connectionStatus: '10', disconnectionStatus: '11', offlinequeue: '1', startupCmd: 'Login' },
      { Login: ['Dev', 'LOGIN\\x0D'], Power: ['Dev', 'PWR1\\x0D'] });
    sys.start();
    assert.equal(opened.length, 1);
    assert.deepEqual(opened[0].to, [4000, '10.0.0.9']);
    assert.equal(d('11'), true);
    assert.equal(d('10'), false);
    cf.runCommand('', 'Power');
    assert.deepEqual(opened[0].written, [], 'queued while it connects');
    opened[0].up();
    assert.deepEqual(opened[0].written, ['LOGIN\r', 'PWR1\r']);
    assert.equal(d('10'), true);
    assert.equal(d('11'), false);
    // dropped: again in 3 s, the startup command again
    opened[0].destroy();
    assert.equal(d('11'), true);
    mock.timers.tick(3000);
    assert.equal(opened.length, 2);
    opened[1].up();
    assert.deepEqual(opened[1].written, ['LOGIN\r']);
    assert.deepEqual(events, ['Dev up', 'Dev down', 'Dev up']);
    sys.stop();
  } finally {
    mock.timers.reset();
  }
});

test('Transitory: connected to send, closed once idle for the Idle Timeout; Queue When Offline off drops nothing it connects for', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    opened.length = 0;
    const { cf, sys } = gui({ alwayson: '0', idleTimeout: '2000', offlinequeue: '0' }, { Play: ['Dev', 'PLAY'] });
    sys.start();
    assert.equal(opened.length, 0, 'not connected at the start');
    cf.runCommand('', 'Play');
    assert.equal(opened.length, 1);
    opened[0].up();
    assert.deepEqual(opened[0].written, ['PLAY']);
    mock.timers.tick(1500);
    opened[0].says('OK');
    mock.timers.tick(1500);
    assert.equal(opened[0].destroyed, false, 'traffic: the idle clock started over');
    mock.timers.tick(600);
    assert.equal(opened[0].destroyed, true);
    mock.timers.tick(10000);
    assert.equal(opened.length, 1, 'not connected again by itself');
    cf.runCommand('', 'Play');
    assert.equal(opened.length, 2);
    sys.stop();
  } finally {
    mock.timers.reset();
  }
});

test('Dialog: a packet at a time, the next once the answer (a message) is in or the Answer Timeout is up', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    opened.length = 0;
    const { cf, sys } = gui({ alwayson: '2', dialogTimeout: '1000', idleTimeout: '5000', eom: '\\x0D' },
      { A: ['Dev', 'A?'], B: ['Dev', 'B?'], C: ['Dev', 'C?'] });
    sys.start();
    cf.runCommand('', 'A');
    cf.runCommand('', 'B');
    cf.runCommand('', 'C');
    opened[0].up();
    assert.deepEqual(opened[0].written, ['A?']);
    opened[0].says('A=1');
    assert.deepEqual(opened[0].written, ['A?'], 'not a whole message yet');
    opened[0].says('\r');
    assert.deepEqual(opened[0].written, ['A?', 'B?']);
    mock.timers.tick(1000);
    assert.deepEqual(opened[0].written, ['A?', 'B?', 'C?'], 'no answer: on after the timeout');
    sys.stop();
  } finally {
    mock.timers.reset();
  }
});

test('Heartbeat: Initiate sends Tx every 3 s and closes after 15 s without Rx; Reply answers Rx with Tx', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    opened.length = 0;
    const { sys } = gui({ alwayson: '1', heartbeatMode: '1', heartbeatTx: 'PING\\x0D', heartbeatRx: 'PONG' });
    sys.start();
    opened[0].up();
    mock.timers.tick(3000);
    assert.deepEqual(opened[0].written, ['PING\r']);
    opened[0].says('PONG\r');
    mock.timers.tick(15000);
    assert.equal(opened[0].destroyed, false, 'heard at 3 s');
    mock.timers.tick(3000);
    assert.equal(opened[0].destroyed, true);
    sys.stop();

    opened.length = 0;
    const reply = gui({ alwayson: '1', heartbeatMode: '0', heartbeatTx: 'ALIVE', heartbeatRx: 'HELLO?' });
    reply.sys.start();
    opened[0].up();
    mock.timers.tick(10000);
    assert.deepEqual(opened[0].written, []);
    opened[0].says('xxHELLO?');
    assert.deepEqual(opened[0].written, ['ALIVE']);
    reply.sys.stop();
  } finally {
    mock.timers.reset();
  }
});

test('Text Encoding: a server\'s windows-1251 read as such, commands sent in it; none set: UTF-8 text is read as UTF-8, binary stays a char a byte', () => {
  const cp1251 = new TextIn('windows-1251');
  assert.equal(cp1251.decode(Uint8Array.from([0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2])), 'Привет');
  assert.equal(text(encodeText('Привет', 'windows-1251')), String.fromCharCode(0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2));
  assert.equal(text(encodeText('Hi', 'utf-16le')), 'H\0i\0');

  const auto = new TextIn('');
  const utf8 = new TextEncoder().encode('Громкость 50');
  // a character cut between two packets waits for its end
  assert.equal(auto.decode(utf8.subarray(0, 3)), 'Г');
  assert.equal(auto.decode(utf8.subarray(3)), 'ромкость 50');
  assert.equal(auto.decode(Uint8Array.from([0xaa, 0x01, 0xff, 0xc3])), '\xaa\x01\xff\xc3');
  // out: chars a byte each, unless a char is past a byte
  assert.equal(text(encodeText('\xaa\x01\xff')), '\xaa\x01\xff');
  assert.equal(text(encodeText('Да')), text(new TextEncoder().encode('Да')));
});

test('feedback on a connection in the system\'s encoding', () => {
  opened.length = 0;
  const { sys } = gui({ alwayson: '1', textEncoding: 'windows-1251', eom: '\\x0D' });
  (sys as any).feedbackRules = [{ type: 'fb', attributes: { name: 'title', regex: 'TITLE=(.*)' }, children: [{ type: 'group', attributes: { index: '1', datatype: 's', target: 's5' }, children: [] }] }];
  sys.start();
  opened[0].up();
  opened[0].says('TITLE=' + String.fromCharCode(0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2) + '\r');
  assert.equal(joinStore.get('5', 's'), 'Привет');
  sys.stop();
});

test('Enable SSL: the connection is TLS (a self-signed certificate does)', () => {
  const was = getHost();
  const tlsOpened: any[] = [];
  setHost({ ...(was ?? { name: 'test', net: {} as any }), tls: { connect: (o: any) => (tlsOpened.push(o), new FakeSocket() as any) } } as any);
  try {
    const { sys } = gui({ alwayson: '1', ssl: '1', port: '4443' });
    sys.start();
    assert.equal(tlsOpened.length, 1);
    assert.equal(tlsOpened[0].host, '10.0.0.9');
    assert.equal(tlsOpened[0].port, 4443);
    assert.equal(tlsOpened[0].rejectUnauthorized, false);
    sys.stop();
  } finally {
    setHost(was);
  }
});

test('Javascript Send Handler: what commands send goes to it (system, data); CF.send goes straight out', () => {
  opened.length = 0;
  const seen: string[] = [];
  (globalThis as any).wrapped = (system: string, data: string) => seen.push(`${system}:${data}`);
  const { cf, sys } = gui({ alwayson: '1', js: 'wrapped(system, data);' }, { Vol: ['Dev', 'VOL[sliderval]'] });
  sys.start();
  opened[0].up();
  cf.runCommand('', 'Vol', '42');
  assert.deepEqual(seen, ['Dev:VOL42']);
  assert.deepEqual(opened[0].written, []);
  cf.send('Dev', '\xf5\xf5VOL42\xf4\xf4');
  assert.deepEqual(opened[0].written, ['\xf5\xf5VOL42\xf4\xf4']);
  sys.stop();
});

test("a command's own JS: system and data (the value it made) are there; Javascript sends command value: not sent", () => {
  opened.length = 0;
  const seen: string[] = [];
  (globalThis as any).onScroll = (system: string, data: string) => seen.push(`${system}:${data}`);
  const { cf, sys } = gui({ alwayson: '1' }, { Scrolled: ['Dev', '{"top":[top]}', { js: 'onScroll(system, data);', jsSendsCommand: 'True' }] });
  sys.start();
  opened[0].up();
  cf.runCommand('', 'Scrolled', undefined, { top: 3 });
  assert.deepEqual(seen, ['Dev:{"top":3}']);
  assert.deepEqual(opened[0].written, []);
  sys.stop();
});

test('HTTP: a command is a GET of its path on the system; the answer goes to the feedback', async () => {
  const was = getHost();
  const urls: string[] = [];
  setHost({
    ...(was ?? { name: 'test', net: {} as any }),
    http: {
      get(o: any, cb: (res: any) => void) {
        urls.push(o.url);
        const res = new EventEmitter() as any;
        res.statusCode = 200;
        res.headers = {};
        setImmediate(() => {
          cb(res);
          res.emit('data', new TextEncoder().encode('state=playing'));
          res.emit('end');
        });
        return new EventEmitter();
      },
    },
  } as any);
  try {
    const { cf, sys, d } = gui({ protocol: 'http', port: '8080', connectionStatus: '20' }, { Play: ['Dev', '/transport?action=play'] });
    (sys as any).feedbackRules = [{ type: 'fb', attributes: { name: 'state', regex: 'state=(\\w+)' }, children: [{ type: 'group', attributes: { index: '1', datatype: 's', target: 's6' }, children: [] }] }];
    sys.start();
    cf.runCommand('', 'Play');
    await flush();
    await flush();
    assert.deepEqual(urls, ['http://10.0.0.9:8080/transport?action=play']);
    assert.equal(joinStore.get('6', 's'), 'playing');
    assert.equal(d('20'), true);
    assert.equal(sys.httpUrl('/x'), 'http://10.0.0.9:8080/x');
    const https = new ControlSystem(cf, { type: 'system', attributes: { name: 'S', protocol: 'https', ip: 'nas.local', port: '443' }, children: [] } as any);
    assert.equal(https.httpUrl('/api'), 'https://nas.local/api');
  } finally {
    setHost(was);
  }
});

test('TCP server: Max Connections turns the one too many away', () => {
  servers.length = 0;
  const { sys } = gui({ accept: '1', origin: '5000', maxconnections: '1' });
  sys.start();
  assert.equal(servers[0].port, 5000);
  const a = new FakeSocket();
  const b = new FakeSocket();
  servers[0].emit('connection', a);
  servers[0].emit('connection', b);
  assert.equal(a.destroyed, false);
  assert.equal(b.destroyed, true);
  sys.stop();
});

test('UDP: origin 0 is the remote port (GUI Designer), -1 any; Accept Broadcast Messages on', async () => {
  udps.length = 0;
  const { sys } = gui({ protocol: 'udp', port: '19999', origin: '0', acceptBroadcasts: '1' });
  sys.start();
  await flush();
  assert.equal(udps[0].port, 19999);
  assert.equal(udps[0].broadcast, true);
  sys.send('hi');
  assert.deepEqual(udps[0].sent, [['hi', 19999, '10.0.0.9']]);
  sys.stop();
  const any = gui({ protocol: 'udp', port: '19999', origin: '-1' });
  any.sys.start();
  assert.equal(udps[1].port, 0);
  any.sys.stop();
});

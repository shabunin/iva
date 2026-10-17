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

test('Text Encoding ISO-8859-1: a byte a char in and out, even bytes that would read as UTF-8 (a binary protocol: iva/drivers/mqtt)', () => {
  const latin = new TextIn('ISO-8859-1');
  const utf8 = new TextEncoder().encode('héllo');
  assert.equal(latin.decode(utf8), 'h\xc3\xa9llo');
  assert.equal(latin.decode(Uint8Array.from([0x30, 0x0a, 0x80, 0x9f, 0xff])), '\x30\x0a\x80\x9f\xff');
  assert.equal(text(encodeText('\x80\x9f\xff', 'iso-8859-1')), '\x80\x9f\xff');
  assert.equal(text(encodeText('a€', 'latin1')), 'a?');
  // none set: the same bytes are the UTF-8 they look like
  assert.equal(new TextIn('').decode(utf8), 'héllo');
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

test('TCP server: its port taken (another app\'s server) - listened on again every 3 s till it\'s free; not once stopped', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    servers.length = 0;
    const { sys } = gui({ accept: '1', origin: '8900' });
    const taken = () => Object.assign(new Error('Address already in use (os error 98)'), { code: 'EADDRINUSE', syscall: 'listen' });
    sys.start();
    servers[0].emit('error', taken());
    mock.timers.tick(2999);
    assert.equal(servers.length, 1);
    mock.timers.tick(1);
    assert.equal(servers.length, 2, 'tried again');
    assert.equal(servers[1].port, 8900);
    servers[1].emit('error', taken());
    mock.timers.tick(3000);
    // free now: listening, a connection served
    servers[2].emit('connection', new FakeSocket());
    assert.deepEqual(sys.connections, ['10.0.0.9:50000']);
    sys.stop();
    // taken, then stopped: left alone
    sys.enabled = true;
    sys.start();
    servers[3].emit('error', taken());
    sys.stop();
    mock.timers.tick(10000);
    assert.equal(servers.length, 4);
  } finally {
    mock.timers.reset();
  }
});

test('TCP server: one let go (stopped, started again) - a connection it still hands over is turned away', () => {
  servers.length = 0;
  const { sys } = gui({ accept: '1', origin: '5000' });
  sys.start();
  sys.stop();
  sys.enabled = true;
  sys.start();
  const late = new FakeSocket();
  servers[0].emit('connection', late);
  assert.equal(late.destroyed, true);
  assert.deepEqual(sys.connections, []);
  const now = new FakeSocket();
  servers[1].emit('connection', now);
  assert.equal(now.destroyed, false);
  assert.deepEqual(sys.connections, ['10.0.0.9:50000']);
  sys.stop();
});

test('ConnectionStatusChangeEvent: a watcher of a system (or systems) hears only theirs', () => {
  servers.length = 0;
  const { cf, sys, events } = gui({ accept: '1', origin: '5000' });
  const other = new ControlSystem(cf, { type: 'system', attributes: { name: 'Other', ip: '0.0.0.0', port: '5001', accept: '1', origin: '5001' }, children: [] } as any);
  cf.controlSystems.Other = other;
  const heard: string[] = [];
  cf.watch(cf.ConnectionStatusChangeEvent, 'Dev', (name: string, up: boolean) => heard.push(`Dev's: ${name} ${up}`));
  cf.watch(cf.ConnectionStatusChangeEvent, ['Other'], (name: string, up: boolean) => heard.push(`Other's: ${name} ${up}`));
  sys.start();
  other.start();
  servers[0].emit('connection', new FakeSocket());
  servers[1].emit('connection', new FakeSocket());
  assert.deepEqual(heard, ["Dev's: Dev true", "Other's: Other true"]);
  // one watching every system hears both
  assert.deepEqual(events, ['Dev up', 'Other up']);
  sys.stop();
  other.stop();
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

test("CF.setProperties: a parameter passed as null or undefined (a callback handed on with none) is refused, as iViewer does - logged, nothing changed", () => {
  const cf = new CFAPI();
  const logged: string[] = [];
  cf.log = (m: string) => void logged.push(m);
  const none: (() => void) | undefined = undefined;
  const menu = () => cf.propertiesStore.menu;
  cf.setProperties({ join: 'menu', x: -40 }, 0, 0, 'ANIMATION_CURVE_EASE_OUT', none);
  assert.deepEqual(logged, ['setProperties(): Invalid parameter 5: null is not allowed']);
  assert.equal(menu(), undefined);
  cf.setProperties({ join: 'menu', x: -40 }, null as any, 0.2);
  assert.equal(logged[1], 'setProperties(): Invalid parameter 2: null is not allowed');
  // left out: fine
  cf.setProperties({ join: 'menu', x: -40 });
  let done = 0;
  cf.setProperties({ join: 'menu', opacity: 0.5 }, 0, 0, 'ANIMATION_CURVE_LINEAR', () => done++);
  assert.equal(logged.length, 2);
  assert.equal(menu().x, -40);
  assert.equal(menu().opacity, 0.5);
});

test("CF.setJoin on a digital join: a string made a number first, as iViewer does - '0' off, '1' on, 'test' off (a web app's panel.set(name, 0) comes as '0')", () => {
  joinStore.clear();
  const cf = new CFAPI();
  const d = () => joinStore.get('7', 'd');
  const seen: unknown[] = [];
  for (const v of [1, '0', '1', 'test', '10', false, true, 0, ' 1', '0.0']) {
    cf.setJoin('d7', v as any);
    seen.push(d());
  }
  assert.deepEqual(seen, [true, false, true, false, true, false, true, false, true, false]);
});

test("a command's target / value and a feedback's onmatch: a serial join gets the text as written ('007', ''), a digital or analog one a number", () => {
  const { cf, sys } = gui({}, {
    Zeros: ['Dev', '', { target: 's5', value: '007' }],
    Blank: ['Dev', '', { target: 's5', value: '' }],
    Level: ['Dev', '', { target: 'a5', value: '007' }],
    On: ['Dev', '', { target: 'd5', value: '1' }],
  });
  cf.runCommand('', 'Zeros');
  assert.equal(joinStore.get('5', 's'), '007');
  cf.runCommand('', 'Blank');
  assert.equal(joinStore.get('5', 's'), '');
  cf.runCommand('', 'Level');
  assert.equal(joinStore.get('5', 'a'), 7);
  cf.runCommand('', 'On');
  assert.equal(joinStore.get('5', 'd'), true);
  (sys as any).feedbackRules = [{ type: 'fb', attributes: { name: 'code', regex: 'CODE=(.*)' }, children: [
    { type: 'onmatch', attributes: { target: 's6', value: '$1$' }, children: [] },
    { type: 'onmatch', attributes: { target: 'a6', value: '$1$' }, children: [] },
    { type: 'onmatch', attributes: { target: 's7', value: 'v$1$' }, children: [] },
  ] }];
  (sys as any)._matchFeedbacks('CODE=007');
  assert.equal(joinStore.get('6', 's'), '007');
  assert.equal(joinStore.get('6', 'a'), 7);
  assert.equal(joinStore.get('7', 's'), 'v007');
  (sys as any)._matchFeedbacks('CODE=');
  assert.equal(joinStore.get('6', 's'), '');
  assert.equal(joinStore.get('6', 'a'), 0);
});

test("feedback tokens: a <group settoken> keeps its value as a token named by the group on its target join (e0: a global one); an <onmatch token> sets that token, not the join", () => {
  const { cf, sys } = gui({});
  (sys as any).feedbackRules = [{ type: 'fb', attributes: { name: 'zone', regex: 'Z(\\d)=(\\w+) (\\d+)' }, children: [
    { type: 'group', attributes: { index: '1', name: 'zone', datatype: 's', target: 's1', settoken: '1' }, children: [] },
    { type: 'group', attributes: { index: '3', name: '[level]', datatype: 'a', target: 'e0', settoken: '1', transform: 'value * 2' }, children: [] },
    { type: 'group', attributes: { index: '2', name: 'state', datatype: 's', target: 's2' }, children: [] },
    { type: 'onmatch', attributes: { target: 'e0', token: '[mute]', value: '$2$' }, children: [] },
    { type: 'onmatch', attributes: { target: 's3', token: 'where', value: 'zone $zone$' }, children: [] },
    { type: 'onmatch', attributes: { target: 's3', value: '$state$' }, children: [] },
  ] }];
  (sys as any)._matchFeedbacks('Z2=ON 21');
  assert.equal(joinStore.get('1', 's'), '2', 'the group sets its join');
  assert.equal(cf.tokensStore.s1.zone, '2', 'and keeps the value as a token on it');
  assert.equal(cf.tokensStore.e0['[level]'], '42', 'transformed, as the join would get it; e0: global');
  assert.equal(cf.tokensStore.s2, undefined, 'no settoken: no token');
  assert.equal(cf.tokensStore.e0['[mute]'], 'ON');
  assert.equal(cf.tokensStore.s3.where, 'zone 2');
  assert.equal(joinStore.get('3', 's'), 'ON', 'an onmatch without a token sets the join');
  assert.equal(joinStore.has('e0', 'd'), false, 'e0 is no join');
});

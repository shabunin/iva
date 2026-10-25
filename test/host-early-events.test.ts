import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { once, EventEmitter } from 'node:events';
import { WebSocketServer } from 'ws';
import { HostSession } from '../src/server/host/session.ts';
import { TauriTcpSocket } from '../src/runtime/host/net/socket.ts';
import { TauriTcpServer } from '../src/runtime/host/net/server.ts';
import { TauriTlsSocket } from '../src/runtime/host/tls/socket.ts';
import { EarlyEvents } from '../src/runtime/host/net/early.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const within = <T>(p: Promise<T>, what: string, ms = 3000) =>
  Promise.race([p, sleep(ms).then(() => Promise.reject(new Error(`${what}: never came`)))]);
const bytes = (s: string) => Array.from(Buffer.from(s));

/** what the host told the page, as it goes */
const wire = new EventEmitter();
/** while set, a listen's answer waits for it */
let listenAnswer: Promise<void> | null = null;

/**
 * iva dev's host behind /__iva/host, its answers to a connect or a listen
 * late - after the events of the connection they're for - as the panel's
 * can be: its read loop starts before its answer goes, and the page hears
 * of each by a different way (a listen's: as long as listenAnswer holds it).
 * TLS: a device faked, it speaks first.
 */
async function backend() {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/__iva/host' });
  wss.on('connection', (ws) => {
    const emit = (name: string, payload: unknown) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'event', name, payload }));
      wire.emit(name, payload);
    };
    const session = new HostSession(emit);
    const fakes: Record<string, () => unknown> = {
      tls_connect: () => {
        emit('plugin:net:tls', { id: 'tls-1', event: 'data', data: bytes('220 ready\r\n'), error: null, remote_address: null, remote_port: null });
        return { id: 'tls-1', remote_address: '10.0.0.5', remote_port: 6000, local_address: '10.0.0.2', local_port: 50000, family: 'IPv4', authorized: false, alpn_protocol: null };
      },
      tls_destroy: () => null,
    };
    ws.on('message', async (raw) => {
      const msg = JSON.parse(String(raw));
      try {
        const value = fakes[msg.cmd] ? fakes[msg.cmd]() : await session.invoke(msg.cmd, msg.args ?? {});
        if (msg.cmd === 'tcp_listen' && listenAnswer) await listenAnswer;
        else if (['tcp_connect', 'tcp_listen', 'tls_connect'].includes(msg.cmd)) await sleep(200);
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, value: value ?? null }));
      } catch (e: any) {
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: false, error: String(e?.message ?? e) }));
      }
    });
    ws.on('close', () => session.dispose());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  (globalThis as any).location = { protocol: 'http:', host: `127.0.0.1:${(server.address() as net.AddressInfo).port}` };
  return () => {
    for (const c of wss.clients) c.terminate();
    wss.close();
    server.close();
  };
}

let stopBackend = () => {};
before(async () => {
  stopBackend = await backend();
});
after(() => stopBackend());

test('a device that speaks first (a banner as it connects) is heard, though the host tells of it before the connect is answered - on the page\'s first socket and the next', async () => {
  const peer = net.createServer((c) => c.end('PJLINK 0\r'));
  peer.listen(0, '127.0.0.1');
  await once(peer, 'listening');
  try {
    for (let i = 0; i < 2; i++) {
      const sock = new TauriTcpSocket();
      const seen: string[] = [];
      sock.on('connect', () => seen.push('connect'));
      sock.on('data', (d: unknown) => seen.push(`data ${String(d)}`));
      const closed = new Promise((r) => sock.on('close', r));
      sock.connect((peer.address() as net.AddressInfo).port, '127.0.0.1');
      await within(closed, `socket ${i + 1}'s close`);
      assert.deepEqual(seen, ['connect', 'data PJLINK 0\r']);
    }
  } finally {
    peer.close();
  }
});

test("a server's client quick to connect and send is taken with its first bytes, though the host tells of it before the listen is answered", async () => {
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as net.AddressInfo).port;
  probe.close();
  await once(probe, 'close');

  const srv = new TauriTcpServer();
  const seen: string[] = [];
  srv.on('listening', () => seen.push('listening'));
  const got = new Promise<string>((resolve) =>
    srv.on('connection', (sock: TauriTcpSocket) => {
      seen.push('connection');
      let s = '';
      sock.on('data', (d: unknown) => {
        s += String(d);
        if (s.endsWith('\r\n\r\n')) resolve(s);
      });
    }));
  let answer = () => {};
  listenAnswer = new Promise<void>((r) => (answer = r));
  const told = new Promise<void>((resolve) =>
    wire.on('plugin:net:tcp', (p: { event: string }) => p.event === 'data' && resolve()));
  srv.listen(port, '127.0.0.1');
  // in as soon as the port is open: before the page has the listen's answer
  let client: net.Socket | undefined;
  for (let t = 0; !client && t < 100; t++) {
    const c = net.connect(port, '127.0.0.1');
    client = await new Promise<net.Socket | undefined>((resolve) => {
      c.once('connect', () => resolve(c));
      c.once('error', () => sleep(10).then(() => resolve(undefined)));
    });
  }
  try {
    assert.ok(client, 'the server never listened');
    client.write('GET / HTTP/1.0\r\n\r\n');
    // the host told of the client and its request - the answer goes after them
    await within(told, 'the request at the host');
    assert.equal(srv.listening, false);
    answer();
    assert.equal(await within(got, "the client's request"), 'GET / HTTP/1.0\r\n\r\n');
    assert.deepEqual(seen, ['listening', 'connection']);
  } finally {
    answer();
    listenAnswer = null;
    wire.removeAllListeners();
    client?.destroy();
    srv.closeAllConnections();
    await new Promise((r) => srv.close(r));
  }
});

test('a TLS device that speaks first is heard too', async () => {
  const sock = new TauriTlsSocket();
  const heard = new Promise<string>((resolve) => sock.on('data', (d: unknown) => resolve(String(d))));
  sock.startConnect({ host: '10.0.0.5', port: 6000 });
  assert.equal(await within(heard, 'the banner'), '220 ready\r\n');
  sock.destroy();
});

test('events for ids never known are let go: a few dozen kept at most, a few seconds each', () => {
  mock.timers.enable({ apis: ['Date'] });
  try {
    const ev = (id: string) => ({ id, event: 'data', data: [1], error: null, remote_address: null, remote_port: null });
    const early = new EarlyEvents();
    for (let i = 0; i < 100; i++) early.keep(ev(`gone-${i}`));
    early.keep(ev('mine'));
    early.keep(ev('mine'));
    // the oldest went for the newer
    assert.equal(early.take('gone-0').length, 0);
    assert.equal(early.take('gone-99').length, 1);
    assert.equal(early.take('mine').length, 2);
    assert.equal(early.take('mine').length, 0);
    early.keep(ev('late'));
    mock.timers.tick(10_000);
    assert.equal(early.take('late').length, 0);
  } finally {
    mock.timers.reset();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import dgram from 'node:dgram';
import http from 'node:http';
import { once } from 'node:events';
import { HostSession } from '../src/server/host/session.ts';

/** A session plus everything it emitted, with a way to wait for one event. */
function session() {
  const events: { name: string; payload: any }[] = [];
  const waiters: (() => void)[] = [];
  const s = new HostSession((name, payload) => {
    events.push({ name, payload });
    waiters.splice(0).forEach((w) => w());
  });
  const next = async (pred: (e: { name: string; payload: any }) => boolean) => {
    for (;;) {
      const hit = events.find(pred);
      if (hit) return hit;
      await new Promise<void>((r) => waiters.push(r));
    }
  };
  return { s, events, next };
}

const text = (bytes: number[]) => Buffer.from(bytes).toString();

test('tcp: connect, write, data, close, refused', async () => {
  const server = net.createServer((c) => c.on('data', (d) => c.end('echo:' + d)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as net.AddressInfo).port;
  const { s, next } = session();

  const conn: any = await s.invoke('tcp_connect', { host: '127.0.0.1', port });
  assert.match(conn.id, /^tcp-/);
  assert.equal(conn.remote_port, port);
  await s.invoke('tcp_write', { id: conn.id, data: Array.from(Buffer.from('hi')) });
  const data = await next((e) => e.name === 'plugin:net:tcp' && e.payload.event === 'data');
  assert.equal(text(data.payload.data), 'echo:hi');
  await next((e) => e.name === 'plugin:net:tcp' && e.payload.event === 'close');

  await assert.rejects(s.invoke('tcp_connect', { host: '127.0.0.1', port: 1 }), /ECONNREFUSED/);
  s.dispose();
  server.close();
});

test('tcp server: accepts a connection and hands over a client socket', async () => {
  const { s, next } = session();
  const srv: any = await s.invoke('tcp_listen', { host: '127.0.0.1', port: 0 });
  const client = net.connect(srv.local_port, '127.0.0.1');
  const conn = await next((e) => e.name === 'plugin:net:tcpserver' && e.payload.event === 'connection');
  const clientId = text(conn.payload.data);
  client.write('ping');
  const data = await next((e) => e.name === 'plugin:net:tcp' && e.payload.id === clientId && e.payload.event === 'data');
  assert.equal(text(data.payload.data), 'ping');
  await s.invoke('tcp_write', { id: clientId, data: Array.from(Buffer.from('pong')) });
  const [reply] = await once(client, 'data');
  assert.equal(String(reply), 'pong');
  client.destroy();
  s.dispose();
});

test('udp: bind, send, message', async () => {
  const peer = dgram.createSocket('udp4');
  peer.on('message', (m, r) => peer.send('udp:' + m, r.port, r.address));
  peer.bind(0, '127.0.0.1');
  await once(peer, 'listening');
  const { s, next } = session();
  const sock: any = await s.invoke('udp_bind', { host: '127.0.0.1', port: 0 });
  await s.invoke('udp_send', { id: sock.id, data: Array.from(Buffer.from('x')), host: '127.0.0.1', port: peer.address().port });
  const msg = await next((e) => e.name === 'plugin:net:udp' && e.payload.event === 'message');
  assert.equal(text(msg.payload.data), 'udp:x');
  s.dispose();
  peer.close();
});

test('http_fetch: status, headers, body, redirect', async () => {
  const server = http.createServer((q, r) => {
    if (q.url === '/old') {
      r.writeHead(302, { location: '/new' });
      r.end();
      return;
    }
    r.setHeader('x-test', '1');
    r.end(`${q.method} ${q.url}`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const { s } = session();
  const res: any = await s.invoke('http_fetch', { url: `${base}/old`, method: 'GET', headers: {}, body: null, connectTimeout: null });
  assert.equal(res.status, 200);
  assert.equal(res.headers['x-test'], '1');
  assert.equal(Buffer.from(res.body, 'base64').toString(), 'GET /new');
  server.close();
});

test('dispose closes what the page opened (no port left bound)', async () => {
  const { s } = session();
  const srv: any = await s.invoke('tcp_listen', { host: '127.0.0.1', port: 0 });
  s.dispose();
  await new Promise((r) => setTimeout(r, 50));
  const again = net.createServer().listen(srv.local_port, '127.0.0.1');
  await once(again, 'listening');
  again.close();
});

test('unknown commands are refused by name', async () => {
  const { s } = session();
  await assert.rejects(s.invoke('nope', {}), /"nope" is not implemented/);
});

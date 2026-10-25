import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { HostSession } from '../src/server/host/session.ts';
import { TauriTlsSocket } from '../src/runtime/host/tls/socket.ts';

/** what the page asked the host for */
const asked: [string, Record<string, unknown>][] = [];

/** a host behind /__iva/host with a TLS device faked: connected at once, the rest noted */
async function backend() {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/__iva/host' });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      asked.push([msg.cmd, msg.args]);
      const value = msg.cmd === 'tls_connect'
        ? { id: 'tls-1', remote_address: '10.0.0.5', remote_port: 6000, local_address: '10.0.0.2', local_port: 50000, family: 'IPv4', authorized: false, alpn_protocol: null }
        : null;
      ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, value }));
    });
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

test("a TLS system's keepalive (a device gone found out in seconds) reaches the host, as a TCP one's does", async () => {
  const sock = new TauriTlsSocket();
  const connected = once(sock as any, 'secureConnect');
  sock.startConnect({ host: '10.0.0.5', port: 6000 });
  await connected;
  sock.setKeepAlive(true, 10000);
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(asked.find(([cmd]) => cmd === 'tls_set_keep_alive'), ['tls_set_keep_alive', { id: 'tls-1', enable: true, delay: 10000 }]);
  sock.destroy();
});

test("iva dev's host sets a TLS connection's keepalive (one it doesn't have: EBADF)", async () => {
  const session = new HostSession(() => {});
  await assert.rejects(session.invoke('tls_set_keep_alive', { id: 'tls-9', enable: true, delay: 10000 }), /EBADF/);
});

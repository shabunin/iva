import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { HostSession } from '../src/server/host/session.ts';
import { TauriTcpSocket } from '../src/runtime/host/net/socket.ts';
import { TauriTcpServer } from '../src/runtime/host/net/server.ts';
import { TauriTlsSocket } from '../src/runtime/host/tls/socket.ts';

/**
 * The page's listen for the host's events refused while this is set (as
 * Tauri's can be: its IPC not up yet) - the bridge's listeners are a Set.
 */
let refuse = false;
const add = Set.prototype.add;
Set.prototype.add = function (this: Set<unknown>, v: unknown) {
  if (refuse && typeof v === 'function' && new Error().stack?.includes('bridge/transport')) throw new Error('listen refused');
  return add.call(this, v);
} as typeof Set.prototype.add;

/** iva dev's host behind /__iva/host, a TLS device faked */
async function backend() {
  const server = http.createServer();
  const wss = new WebSocketServer({ server, path: '/__iva/host' });
  wss.on('connection', (ws) => {
    const session = new HostSession((name, payload) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'event', name, payload }));
    });
    ws.on('message', async (raw) => {
      const msg = JSON.parse(String(raw));
      try {
        const value = msg.cmd === 'tls_connect'
          ? { id: 'tls-1', remote_address: '10.0.0.5', remote_port: 6000, local_address: '10.0.0.2', local_port: 50000, family: 'IPv4', authorized: false, alpn_protocol: null }
          : msg.cmd === 'tls_destroy' ? null : await session.invoke(msg.cmd, msg.args ?? {});
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

/** 'ok', or the error it ended with */
const outcome = (e: any, ok: string) =>
  new Promise<string>((resolve) => {
    e.once(ok, () => resolve('ok'));
    e.once('error', (err: Error) => resolve(err.message));
  });

test("the page's listen for sockets' events refused once: the next connect, listen, TLS connect asks for it again - not failed for the page's life", async () => {
  const peer = net.createServer((c) => c.end());
  peer.listen(0, '127.0.0.1');
  await once(peer, 'listening');
  const port = (peer.address() as net.AddressInfo).port;
  const servers: TauriTcpServer[] = [];
  const attempt = () => {
    const sock = new TauriTcpSocket();
    const srv = new TauriTcpServer();
    servers.push(srv);
    const tls = new TauriTlsSocket();
    const all = Promise.all([outcome(sock, 'connect'), outcome(srv, 'listening'), outcome(tls, 'secureConnect')]);
    sock.connect(port, '127.0.0.1');
    srv.listen(0, '127.0.0.1');
    tls.startConnect({ host: '10.0.0.5', port: 6000 });
    return all.finally(() => {
      sock.destroy();
      tls.destroy();
    });
  };
  try {
    refuse = true;
    const first = await attempt();
    refuse = false;
    assert.ok(first.every((r) => /listen refused/.test(r)), `refused: ${first}`);
    assert.deepEqual(await attempt(), ['ok', 'ok', 'ok']);
  } finally {
    refuse = false;
    for (const srv of servers) if (srv.listening) await new Promise((r) => srv.close(r));
    peer.close();
  }
});

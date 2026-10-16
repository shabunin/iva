import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { HostSession } from '../src/server/host/session.ts';
import { TauriTcpSocket } from '../src/runtime/host/net/socket.ts';
import { TauriTcpServer } from '../src/runtime/host/net/server.ts';

/** a host session behind /__iva/host, as iva dev has it; the page's side finds it at `location` */
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
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, value: (await session.invoke(msg.cmd, msg.args ?? {})) ?? null }));
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

// one backend for the file: the page's link to it is one for the process (it doesn't reconnect)
let stopBackend = () => {};
before(async () => {
  stopBackend = await backend();
});
after(() => stopBackend());

test('a socket given up while it connects (the GUI gone to sleep) leaves no connection behind, and no connect', async () => {
  const peer = net.createServer();
  peer.listen(0, '127.0.0.1');
  await once(peer, 'listening');
  try {
    const accepted = once(peer, 'connection');
    const sock = new TauriTcpSocket();
    let connected = false;
    sock.on('connect', () => (connected = true));
    sock.on('error', () => {});
    sock.connect((peer.address() as net.AddressInfo).port, '127.0.0.1');
    sock.destroy();
    const [conn] = (await accepted) as [net.Socket];
    // closed from the panel's side as soon as it was made
    const closed = once(conn, 'close');
    conn.resume();
    await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('the connection was left open')), 3000))]);
    assert.equal(connected, false);
  } finally {
    peer.close();
  }
});

test('a server given up while it opens (the GUI asleep and awake again in a moment) lets its port go once open, never listening', async () => {
  {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = (probe.address() as net.AddressInfo).port;
    probe.close();
    await once(probe, 'close');

    const srv = new TauriTcpServer();
    let listening = false;
    srv.on('listening', () => (listening = true));
    srv.listen(port, '127.0.0.1');
    const closed = new Promise<Error | undefined>((resolve) => srv.close(resolve));
    assert.equal(await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('never closed')), 3000))]), undefined);
    // the port free: another server has it
    const again = net.createServer();
    again.listen(port, '127.0.0.1');
    await Promise.race([once(again, 'listening'), once(again, 'error').then(([e]) => Promise.reject(e))]);
    again.close();
    assert.equal(listening, false);
  }
});

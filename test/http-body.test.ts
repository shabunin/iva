import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { HostSession } from '../src/server/host/session.ts';
import { IncomingMessage, get } from '../src/runtime/host/http/index.ts';

/** iva dev's host behind /__iva/host, and a web server with a picture's bytes */
async function backend(picture: Uint8Array) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(picture);
  });
  const wss = new WebSocketServer({ server, path: '/__iva/host' });
  wss.on('connection', (ws) => {
    const session = new HostSession((name, payload) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'event', name, payload }));
    });
    ws.on('message', async (raw) => {
      const msg = JSON.parse(String(raw));
      try {
        const value = await session.invoke(msg.cmd, msg.args ?? {});
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, value: value ?? null }));
      } catch (e: any) {
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: false, error: String(e?.message ?? e) }));
      }
    });
    ws.on('close', () => session.dispose());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as net.AddressInfo).port;
  (globalThis as any).location = { protocol: 'http:', host: `127.0.0.1:${port}` };
  return {
    port,
    stop() {
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.close();
    },
  };
}

// every byte value, a camera snapshot's size
const PICTURE = Uint8Array.from({ length: 300_000 }, (_, i) => (i * 7 + (i >> 8)) & 255);
let web: Awaited<ReturnType<typeof backend>>;
before(async () => {
  web = await backend(PICTURE);
});
after(() => web.stop());

test("an HTTP answer's bytes reach the reader as they are: no number[] on the way", async () => {
  const body = new Uint8Array([0, 128, 255]);
  const msg = new IncomingMessage({ id: '', port: 0, method: '', url: '', headers: {}, body });
  const chunk = await new Promise<Uint8Array>((resolve) => msg.on('data', resolve));
  assert.equal(chunk, body);
});

test("a picture through iva dev's host comes whole, every byte value right", async () => {
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    get({ url: `http://127.0.0.1:${web.port}/snapshot.jpg` }, (res: any) => {
      const chunks: Uint8Array[] = [];
      res.on('data', (c: Uint8Array) => chunks.push(c));
      res.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    }).on('error', reject);
  });
  assert.equal(bytes.length, PICTURE.length);
  assert.ok(Buffer.from(bytes).equals(Buffer.from(PICTURE)));
});

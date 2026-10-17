/**
 * CommandFusion's JavaScript API docs, the Network page, held up to iva's
 * runtime: CF.request in each of its forms (against a server of the test's
 * own), Bonjour through the CF object.
 */
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { responseHeaders } from '../src/runtime/cf/jsapi/network.ts';
import { runGui } from './gui-runtime.ts';

(globalThis as any).window ??= { devicePixelRatio: 1 };

/** what the server got, each request */
const got: { method: string; url: string; headers: http.IncomingHttpHeaders; body: string }[] = [];
let server: http.Server;
let base = '';
before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      got.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      res.writeHead(req.url === '/missing' ? 404 : 200, { Server: 'iva-test/1.0', 'Content-Type': 'text/plain; charset=utf-8', 'X-Echo-Method': req.method! });
      res.end(req.method === 'HEAD' ? undefined : `${req.method} ${req.url} ${body}`);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const call = (...args: unknown[]) => new Promise<[number, Record<string, string>, string]>((resolve) => {
  const cf = new CFAPI();
  (cf.request as (...a: unknown[]) => void)(...args, (status: number, headers: Record<string, string>, body: string) => resolve([status, headers, body]));
});

test('CF.request(url, callback): a GET - status, headers, body', async () => {
  const [status, headers, body] = await call(`${base}/hello`);
  assert.equal(status, 200);
  assert.equal(body, 'GET /hello ');
  assert.equal(headers['Content-Type'], 'text/plain; charset=utf-8');
  const missing = await call(`${base}/missing`);
  assert.equal(missing[0], 404);
});

test('CF.request(url, headers, callback): the headers sent as given', async () => {
  got.length = 0;
  await call(`${base}/ua`, { 'User-Agent': 'my-user-agent-1.0' });
  assert.equal(got[0].headers['user-agent'], 'my-user-agent-1.0');
  assert.equal(got[0].method, 'GET');
});

test("CF.request(url, 'HEAD', null, callback): the docs' headers[\"Server\"] - a response's headers by their usual names, found in any case", async () => {
  const [status, headers, body] = await call(`${base}/`, 'HEAD', null);
  assert.equal(status, 200);
  assert.equal(headers['Server'], 'iva-test/1.0');
  assert.equal(headers['server'], 'iva-test/1.0');
  assert.equal(headers['X-Echo-Method'], 'HEAD');
  assert.ok(Object.keys(headers).includes('Server'));
  assert.equal(body, '');
});

test('CF.request(url, "POST", null, fields, callback): an object is form data - url-encoded, application/x-www-form-urlencoded', async () => {
  got.length = 0;
  const postFields = { first_name: 'John', last_name: 'Doe', city: 'New-York', email: 'john@doe.net' };
  const [status] = await call(`${base}/myform?register`, 'POST', null, postFields);
  assert.equal(status, 200);
  assert.equal(got[0].method, 'POST');
  assert.equal(got[0].url, '/myform?register');
  assert.equal(got[0].headers['content-type'], 'application/x-www-form-urlencoded');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(got[0].body)), postFields);
});

test('CF.request(url, "PUT", headers, body, callback): a string body sent as UTF-8, the headers with it', async () => {
  got.length = 0;
  const requestBody = '<tree><object1>héllo</object1><object2>wörld</object2></tree>';
  const [status, , body] = await call(`${base}/putdata`, 'PUT', { 'User-Agent': 'my-user-agent-1.0' }, requestBody);
  assert.equal(status, 200);
  assert.equal(got[0].body, requestBody);
  assert.equal(got[0].headers['user-agent'], 'my-user-agent-1.0');
  assert.equal(body, `PUT /putdata ${requestBody}`);
});

test('CF.request to nothing (a refused port): status 0', async () => {
  const [status] = await call('http://127.0.0.1:9/nothing');
  assert.equal(status, 0);
});

test('responseHeaders: repeated headers joined; JSON of it lists the usual names', () => {
  const h = responseHeaders([['set-cookie', ['a=1', 'b=2']], ['etag', '"x"'], ['content-length', '5']]);
  assert.equal(h['Set-Cookie'], 'a=1, b=2');
  assert.equal(h['ETAG'], '"x"');
  assert.deepEqual(JSON.parse(JSON.stringify(h)), { 'Set-Cookie': 'a=1, b=2', Etag: '"x"', 'Content-Length': '5' });
  assert.ok('content-length' in h);
});

test('Bonjour through the CF object: CF.startPublishing / CF.startLookup / CF.stopPublishing with the docs\' callbacks', async () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  try {
    // two CF objects on one pretend network (each its own engine, sockets from it)
    const { Mdns } = await import('../src/runtime/cf/mdns/mdns.ts');
    const { EventEmitter } = await import('node:events');
    const sockets = new Set<any>();
    class Udp extends EventEmitter {
      port = 0;
      joined = false;
      constructor(public address: string) {
        super();
      }
      bind(port: number, cb?: () => void) {
        this.port = port;
        sockets.add(this);
        queueMicrotask(() => cb?.());
        return this;
      }
      addMembership() {
        this.joined = true;
      }
      send(b: Uint8Array, off: number, len: number, port: number, address: string) {
        const bytes = b.slice(off, off + len);
        for (const s of sockets) {
          if (address === '224.0.0.251' ? s.joined && s.port === port : s.address === address && s.port === port) {
            queueMicrotask(() => s.emit('message', bytes, { address: this.address, port: this.port }));
          }
        }
      }
      close() {
        sockets.delete(this);
        return this;
      }
    }
    const cfOn = (address: string, name: string) => {
      const cf = new CFAPI();
      cf.ipv4address = address;
      cf.ipv4netmask = '255.255.255.0';
      cf.device.name = name;
      (cf as any).mdns = new Mdns({
        network: () => ({ ipv4address: cf.ipv4address, ipv4netmask: cf.ipv4netmask }),
        deviceName: () => cf.device.name,
        deviceId: () => name.replace(/\W/g, ''),
        createSocket: () => new Udp(address) as any,
      });
      return cf;
    };
    const settle = async () => {
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    const pass = async (ms: number) => {
      for (let t = 0; t < ms; t += 50) {
        mock.timers.tick(50);
        await settle();
      }
    };
    const kitchen = cfOn('10.0.0.3', 'Kitchen panel');
    const hall = cfOn('10.0.0.2', 'Hall panel');
    const results: unknown[] = [];
    kitchen.startPublishing('_touch-remote._tcp.', '', 10211, { DvNm: 'iViewer Remote', txtvers: '1' }, (...a: unknown[]) => results.push(a));
    await pass(800);
    assert.deepEqual(results, [['_touch-remote._tcp.', '', 10211, true, null]]);
    const found: unknown[] = [];
    hall.startLookup('_touch-remote._tcp.', '', (added: any[], removed: any[], error: string | null) => found.push({ added, removed, error }));
    await pass(500);
    assert.deepEqual(found, [{
      added: [{ name: 'Kitchen panel', type: '_touch-remote._tcp.', addresses: ['10.0.0.3'], hostname: 'iva-kitchenp.local', port: 10211, data: { DvNm: 'iViewer Remote', txtvers: '1' } }],
      removed: [], error: null,
    }]);
    kitchen.stopPublishing('_touch-remote._tcp.', '', 10211);
    await pass(100);
    assert.deepEqual(results[1], ['_touch-remote._tcp.', '', 10211, false, null]);
    assert.deepEqual((found[1] as any).removed, [{ name: 'Kitchen panel', type: '_touch-remote._tcp.' }]);
    hall.stopLookup('_touch-remote._tcp.', '');
    hall.stopSystems();
    kitchen.stopSystems();
  } finally {
    mock.timers.reset();
  }
});

test("CF.systems: each of the GUI's systems as the docs have it, kept up to date - setSystemProperties, connections coming and going", async () => {
  const { CF } = await runGui('<page name="P" j="0" transition="" subtype="" time="0" ease="" start="1"><portrait /><landscape /></page>', {
    systems: `<system name="Media" ip="192.168.0.7" port="12655" origin="0" protocol="tcp" alwayson="1" offlinequeue="1" accept="0" acceptBroadcasts="0" ssl="0" maxconnections="0" heartbeatRx="" heartbeatTx="" heartbeatMode="-1" eom="" connectionStatus="100" disconnectionStatus="0" startupCmd="" startupMacro="" textEncoding="" js="" />
              <system name="Web" ip="http://www.mycompany.com" port="80" origin="0" protocol="http" alwayson="1" offlinequeue="1" accept="0" acceptBroadcasts="0" ssl="0" maxconnections="0" heartbeatRx="" heartbeatTx="" heartbeatMode="-1" eom="" connectionStatus="0" disconnectionStatus="0" startupCmd="" startupMacro="" textEncoding="" js="" />`,
  });
  const media = CF.systems['Media'];
  assert.deepEqual(JSON.parse(JSON.stringify(media)),
    { type: 'tcp', enabled: true, address: '192.168.0.7', port: 12655, localPort: 0, connect: 'd100', disconnect: '', connections: [] });
  assert.equal(CF.systems['Web'].type, 'http');
  // the docs' example: a generic script checks a system is there
  assert.equal(CF.systems['XBMC'], undefined);
  CF.setSystemProperties('Media', { enabled: false, address: '192.168.0.8', port: 12656 });
  assert.deepEqual([media.enabled, media.address, media.port], [false, '192.168.0.8', 12656]);
  // a connection: there, then gone (the system's list replaced as it changes)
  const sys = CF.controlSystems['Media'];
  sys.connections = ['192.168.0.8:12656'];
  assert.deepEqual(CF.systems['Media'].connections, ['192.168.0.8:12656']);
  sys.connections = [];
  assert.deepEqual(CF.systems['Media'].connections, []);
});

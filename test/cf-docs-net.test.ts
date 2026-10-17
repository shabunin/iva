/**
 * CommandFusion's JavaScript API docs, the Network page, held up to iva's
 * runtime: CF.request in each of its forms (against a server of the test's
 * own).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { responseHeaders } from '../src/runtime/cf/jsapi/network.ts';

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

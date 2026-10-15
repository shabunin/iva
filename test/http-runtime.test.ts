import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HTTP_RUNTIME } from '../src/compiler/web.ts';

/** Just enough of iViewer's CF for iva-http.js: joins, feedback, sends, assets - and a clock to move. */
function panel(assets: Record<string, string> = {}) {
  const joins: Record<string, unknown> = {};
  const feedback: { system: string; cb: (fb: string, raw: string) => void }[] = [];
  const watchers: { join: string; cb: (j: string, v: unknown) => void }[] = [];
  const sent: [string, string][] = [];
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void; every?: number }>();
  const CF: any = {
    BINARY: 'BINARY', JoinChangeEvent: 'join', FeedbackMatchedEvent: 'fb', modules: [] as { setup(): void }[],
    watch(event: string, a: string, b: any, c?: any) {
      if (event === 'fb') feedback.push({ system: a, cb: c });
      else {
        watchers.push({ join: a, cb: b });
        if (c) b(a, joins[a] ?? (a.startsWith('s') ? '' : 0));
      }
    },
    setJoin(j: string, v: unknown) {
      joins[j] = v;
      for (const w of watchers) if (w.join === j) w.cb(j, v);
    },
    send: (system: string, data: string) => sent.push([system, data]),
    loadAsset: (name: string, _enc: string, cb: (d: string | null) => void) => cb(assets[name] ?? null),
    log() {},
  };
  const setTimeout = (fn: () => void, ms: number) => (timers.set(++seq, { at: now + ms, fn }), seq);
  const setInterval = (fn: () => void, ms: number) => (timers.set(++seq, { at: now + ms, fn, every: ms }), seq);
  const clearTimeout = (id: number) => timers.delete(id);
  /** the clock on by ms, timers firing as it goes */
  const tick = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
      if (!next) break;
      const [id, t] = next;
      now = t.at;
      if (t.every) t.at += t.every;
      else timers.delete(id);
      t.fn();
    }
    now = end;
  };
  const FakeDate = { now: () => now } as unknown as DateConstructor;
  const IvaHttp = new Function('CF', 'setTimeout', 'clearTimeout', 'setInterval', 'Date', `${HTTP_RUNTIME}\nreturn IvaHttp;`)(
    CF, setTimeout, clearTimeout, setInterval, FakeDate);
  const request = (system: string, target: string) => {
    for (const f of feedback) if (f.system === system) f.cb('request', `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1\r\nAccept: */*\r\n\r\n`);
  };
  return { CF, IvaHttp, joins, sent, request, tick };
}

/** an answer's status, headers and body (bytes as chars) */
function parse(raw: string) {
  const at = raw.indexOf('\r\n\r\n');
  const [status, ...lines] = raw.slice(0, at).split('\r\n');
  const headers = Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
  return { status, headers, body: raw.slice(at + 4) };
}
const utf8 = (bytes: string) => Buffer.from(bytes, 'latin1').toString('utf8');
/** the data in a boot page (every answer of the web server) */
const dataOf = (raw: string) => {
  const page = utf8(parse(raw).body);
  return JSON.parse(page.slice(page.lastIndexOf('id="iva-data">') + 14, page.lastIndexOf('</script>')));
};
const last = (sent: [string, string][]) => sent[sent.length - 1][1];

test('IvaHttp.serve: the request parsed, an answer that closes, its length in bytes, the request number back', () => {
  const { IvaHttp, sent, request } = panel();
  IvaHttp.serve('api', (req: any, res: any) => res.json({ path: req.path, q: req.query, name: 'café' }));
  request('api', '/rooms/1?x=1&y=a%20b&r=7');
  const a = parse(sent[0][1]);
  assert.equal(a.status, 'HTTP/1.1 200 OK');
  assert.deepEqual(JSON.parse(utf8(a.body)), { path: '/rooms/1', q: { x: '1', y: 'a b', r: '7' }, name: 'café' });
  assert.equal(Number(a.headers['content-length']), a.body.length); // bytes: é is two
  assert.equal(a.headers.connection, 'close');
  assert.equal(a.headers['x-iva-req'], '7');
  IvaHttp.serve('boom', () => { throw new Error('bad'); });
  request('boom', '/');
  assert.equal(parse(sent[1][1]).status, 'HTTP/1.1 500 Internal Server Error');
});

test('the web server: one system for every web app (/<name>/) and swatch; every answer the boot page, its data in it', () => {
  const { CF, IvaHttp, sent, request } = panel({ 'apps/iva_app_x.js': 'go("é")' });
  CF.setJoin('d5', 1);
  IvaHttp.web('IvaWeb', 8900);
  IvaHttp.app('x', { asset: 'apps/iva_app_x.js', joins: { lamp: 'd5', note: 's9' }, options: { label: 'Küche' }, handlers: {}, record: null, bg: '#123456', title: 'X' });
  assert.equal(IvaHttp.url('iva-color/FFB000'), 'http://127.0.0.1:8900/iva-color/FFB000');
  // the page: the boot page, the app's colour in its data
  request('IvaWeb', '/x/');
  const a = parse(sent[0][1]);
  assert.deepEqual([a.headers['content-type'], a.headers.connection], ['text/html; charset=utf-8', 'close']);
  assert.deepEqual(dataOf(sent[0][1]), { app: 'x', bg: '#123456' });
  const page = utf8(a.body);
  const bootJs = page.slice(page.indexOf('<script>') + 8, page.indexOf('</script>'));
  assert.doesNotThrow(() => new Function(bootJs));
  // boot: the settings and the script, ASCII (the page's bytes as they are)
  request('IvaWeb', '/x/iva/boot?r=b1');
  const b = dataOf(last(sent));
  assert.deepEqual([b.code, b.names, b.values, b.options, b.bg], ['go("é")', ['lamp', 'note'], { lamp: 1, note: '' }, { label: 'Küche' }, '#123456']);
  assert.equal(parse(last(sent)).headers['x-iva-req'], 'b1');
  assert.ok(!/[^\x00-\x7f]/.test(parse(last(sent)).body));
  // a swatch: the boot page (it shows the colour its URL names); an app it doesn't have
  request('IvaWeb', '/iva-color/FFB000');
  assert.equal(dataOf(last(sent)), null);
  request('IvaWeb', '/nope/iva/poll?r=z');
  assert.deepEqual([parse(last(sent)).status, dataOf(last(sent))], ['HTTP/1.1 404 Not Found', { error: 'no web app "nope"' }]);
});

test('the web server: polls held until a change; a new request of the app ends its poll held, not another app\'s', () => {
  const { CF, IvaHttp, joins, sent, request, tick } = panel();
  IvaHttp.web('IvaWeb', 8900);
  IvaHttp.app('x', { asset: 'a.js', joins: { lamp: 'd5' }, options: {}, handlers: {}, record: null });
  IvaHttp.app('y', { asset: 'b.js', joins: { level: 'a7' }, options: {}, handlers: {}, record: null });
  request('IvaWeb', '/x/iva/poll?v=0&r=1');
  const v = dataOf(last(sent)).v;
  const n = sent.length;
  request('IvaWeb', `/x/iva/poll?v=${v}&r=2`);
  request('IvaWeb', '/y/iva/poll?v=2&r=3');
  assert.equal(sent.length, n);
  CF.setJoin('d5', 1);
  tick(25);
  assert.deepEqual([parse(last(sent)).headers['x-iva-req'], dataOf(last(sent)).values], ['2', { lamp: 1 }]);
  // y's poll is still held: x setting a join doesn't end it
  request('IvaWeb', `/x/iva/poll?v=${dataOf(last(sent)).v}&r=4`);
  request('IvaWeb', '/x/iva/set?lamp=0&r=5');
  assert.equal(parse(last(sent)).headers['x-iva-req'], '5');
  assert.equal(joins.d5, '0');
  CF.setJoin('a7', 500);
  tick(25);
  assert.deepEqual([parse(last(sent)).headers['x-iva-req'], dataOf(last(sent)).values], ['3', { level: 500 }]);
  // x's poll r=4 was ended by its set: never answered
  tick(30000);
  assert.ok(sent.every(([, raw]) => parse(raw).headers['x-iva-req'] !== '4'));
});

test('the web server: handlers (IvaHttp.handle, a named function, async), errors, project files as base64', () => {
  const { IvaHttp, sent, request } = panel({ 'room.glb': 'GLB\u00ff' });
  (globalThis as any).ivaTestLater = (n: number, reply: (v: unknown) => void) => reply(n * 2);
  try {
    IvaHttp.web('IvaWeb', 8900);
    IvaHttp.app('x', { asset: 'a.js', joins: {}, options: {}, handlers: { later: 'ivaTestLater' }, record: null });
    IvaHttp.handle('x', 'sum', (a: number, b: number) => a + b);
    const call = (q: string) => {
      request('IvaWeb', `/x/iva/call?${q}`);
      return [parse(last(sent)).status.split(' ')[1], dataOf(last(sent))];
    };
    assert.deepEqual(call('fn=sum&args=%5B2%2C3%5D&r=1'), ['200', { value: 5 }]);
    assert.deepEqual(call('fn=later&args=%5B21%5D&r=2'), ['200', { value: 42 }]);
    assert.deepEqual(call('fn=nope&r=3'), ['404', { error: 'no handler "nope"' }]);
    assert.deepEqual(call('fn=sum&args=%5Bx&r=4')[0], '400');
    request('IvaWeb', '/x/iva/asset/room.glb?r=5');
    const file = dataOf(last(sent));
    assert.deepEqual([file.type, Buffer.from(file.b64, 'base64').toString('latin1')], ['model/gltf-binary', 'GLB\u00ff']);
    request('IvaWeb', '/x/iva/asset/nope.png?r=6');
    assert.equal(parse(last(sent)).status, 'HTTP/1.1 404 Not Found');
  } finally {
    delete (globalThis as any).ivaTestLater;
  }
});

test('the web server record: a row every so often, the last ones kept, history between two times, the newest with each poll', () => {
  const { CF, IvaHttp, sent, request, tick } = panel();
  IvaHttp.web('IvaWeb', 8900);
  CF.setJoin('a1', 100);
  IvaHttp.app('t', { asset: 'a.js', joins: { t: 'a1', label: 's1' }, options: {}, handlers: {}, record: { every: 1, keep: 3 } });
  for (let i = 1; i <= 4; i++) {
    CF.setJoin('a1', 100 + i);
    tick(1000);
  }
  request('IvaWeb', '/t/iva/call?fn=history&args=%5Bnull%2Cnull%5D&r=1');
  const h = dataOf(last(sent)).value;
  assert.deepEqual(h.names, ['t', 'label']);
  assert.deepEqual(h.rows, [[2000, 102, null], [3000, 103, null], [4000, 104, null]]);
  request('IvaWeb', '/t/iva/call?fn=history&args=%5B2500%2C3500%5D&r=2');
  assert.deepEqual(dataOf(last(sent)).value.rows, [[3000, 103, null]]);
  request('IvaWeb', '/t/iva/poll?v=0&r=3');
  assert.deepEqual(dataOf(last(sent)).sample, [4000, 104, null]);
});

test('the web server with runtime themes: the look\'s options and colour; a switch reloads the pages', () => {
  const { CF, IvaHttp, sent, request, tick } = panel({ 'a.js': '' });
  let look = 0;
  const hooks: (() => void)[] = [];
  (globalThis as any).IvaTheme = { app: () => [{ options: { c: 'dark' }, bg: '#111111' }, { options: { c: 'light' }, bg: '#eeeeee' }][look], onChange: (f: () => void) => hooks.push(f) };
  try {
    IvaHttp.web('IvaWeb', 8900);
    IvaHttp.app('x', { asset: 'a.js', joins: {}, options: { c: 'dark' }, handlers: {}, record: null, bg: '#111111' });
    for (const m of CF.modules) m.setup();
    request('IvaWeb', '/x/iva/poll?v=1&r=1');
    look = 1;
    hooks.forEach((f) => f());
    tick(25);
    assert.equal(dataOf(last(sent)).reload, 1);
    request('IvaWeb', '/x/iva/boot?r=2');
    const b = dataOf(last(sent));
    assert.deepEqual([b.options, b.bg], [{ c: 'light' }, '#eeeeee']);
  } finally {
    delete (globalThis as any).IvaTheme;
  }
});

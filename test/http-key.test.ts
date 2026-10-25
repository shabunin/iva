import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { HTTP_RUNTIME, bundleWebApp } from '../src/compiler/web.ts';
import { tmpDir } from './tmp.ts';

/**
 * The panel's web server (iva-http.js) listens on every network the panel is
 * on: asked by another device there (an address without the key), and by the
 * panel's own web views (the addresses IvaHttp.url gives). Just enough of CF
 * for it - joins, feedback, sends, assets, the log - and a clock to move; a
 * web view's page (the boot page, then iva/web) runs in a context of its own,
 * each request answered at once (a poll held: not answered).
 */
function panel(assets: Record<string, string> = {}) {
  const joins: Record<string, unknown> = {};
  const feedback: ((fb: string, raw: string) => void)[] = [];
  const watchers: { join: string; cb: (j: string, v: unknown) => void }[] = [];
  const sent: string[] = [];
  const loaded: string[] = [];
  const logged: string[] = [];
  let now = 0;
  let seq = 0;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const CF: any = {
    BINARY: 'BINARY', UTF8: 'UTF8', JoinChangeEvent: 'join', FeedbackMatchedEvent: 'fb', modules: [],
    watch(event: string, a: string, b: any, c?: any) {
      if (event === 'fb') feedback.push(c);
      else watchers.push({ join: a, cb: b });
    },
    setJoin(j: string, v: unknown) {
      joins[j] = v;
      for (const w of watchers) if (w.join === j) w.cb(j, v);
    },
    send: (_system: string, data: string) => sent.push(data),
    loadAsset: (name: string, _enc: string, cb: (d: string | null) => void) => (loaded.push(name), cb(assets[name] ?? null)),
    // the server's self-check: it answers
    request: (_url: string, cb: (status: number) => void) => cb(200),
    setSystemProperties() {},
    log: (m: string) => logged.push(m),
  };
  const setTimeout = (fn: () => void, ms: number) => (timers.set(++seq, { at: now + ms, fn }), seq);
  const clearTimeout = (id: number) => timers.delete(id);
  const tick = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, t]) => t.at <= end).sort((x, y) => x[1].at - y[1].at)[0];
      if (!next) break;
      timers.delete(next[0]);
      now = next[1].at;
      next[1].fn();
    }
    now = end;
  };
  const IvaHttp = new Function('CF', 'setTimeout', 'clearTimeout', `${HTTP_RUNTIME}\nreturn IvaHttp;`)(CF, setTimeout, clearTimeout);
  /** a request of the web server: its answer, or null if it's held */
  const ask = (target: string) => {
    const n = sent.length;
    for (const f of feedback) f('request', `GET ${target} HTTP/1.1\r\nHost: 192.168.1.20:8900\r\n\r\n`);
    return sent.length > n ? sent[sent.length - 1] : null;
  };

  /**
   * A web view at `address`: what the server answers it (or what it answers
   * `got`: another's request) run as its page. Its body, its window, and
   * where it asks (view.ask: another panel's server, once that has started).
   */
  function open(address: string, got = address) {
    const location = new URL(address);
    const asked = new URL(got, address);
    const page = utf8(answer(ask(asked.pathname + asked.search)!).body);
    const own = page.slice(page.lastIndexOf('id="iva-data">') + 14, page.lastIndexOf('</script>'));
    const body: any = { style: {}, textContent: '', appendChild: (s: { text: string }) => vm.runInContext(s.text, ctx) };
    const document = {
      documentElement: { style: {}, getBoundingClientRect: () => ({ height: 300 }) },
      body, head: { appendChild() {} }, hidden: false,
      getElementById: (id: string) => (id === 'iva-data' ? { textContent: own } : null),
      createElement: () => ({}),
      addEventListener() {},
      open() {},
      write: (html: string) => (body.textContent = html),
      close() {},
    };
    class XMLHttpRequest {
      url = '';
      status = 0;
      responseText = '';
      headers: Record<string, string> = {};
      timeout = 0;
      onload?: () => void;
      onabort?: () => void;
      open(_method: string, url: string) {
        this.url = url;
      }
      send() {
        const u = new URL(this.url, location.href);
        const raw = view.ask(u.pathname + u.search);
        if (raw === null) return;
        const a = answer(raw);
        [this.status, this.headers, this.responseText] = [Number(a.status.split(' ')[1]), a.headers, utf8(a.body)];
        this.onload?.();
      }
      abort() {
        this.onabort?.();
      }
      getResponseHeader(name: string) {
        return this.headers[name.toLowerCase()] ?? null;
      }
    }
    const ctx = vm.createContext({
      document, location, XMLHttpRequest, URL, URLSearchParams, innerWidth: 400, innerHeight: 300, devicePixelRatio: 1,
      addEventListener() {}, setTimeout: () => 0, clearTimeout() {}, console: { error() {} }, getComputedStyle: () => ({ display: 'block' }),
    });
    ctx.window = ctx;
    const view = { body, window: ctx as any, ask };
    vm.runInContext(page.slice(page.indexOf('<script>') + 8, page.indexOf('</script>')), ctx);
    return view;
  }
  return { CF, IvaHttp, joins, sent, loaded, logged, ask, tick, open };
}

/** an answer's status, headers and body (bytes as chars) */
function answer(raw: string) {
  const at = raw.indexOf('\r\n\r\n');
  const [status, ...lines] = raw.slice(0, at).split('\r\n');
  const headers = Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf(':')).toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
  return { status, headers, body: raw.slice(at + 4) };
}
const utf8 = (bytes: string) => Buffer.from(bytes, 'latin1').toString('utf8');
const dataOf = (raw: string) => {
  const page = utf8(answer(raw).body);
  return JSON.parse(page.slice(page.lastIndexOf('id="iva-data">') + 14, page.lastIndexOf('</script>')));
};
const keyOf = (url: string) => new URL(url).searchParams.get('k')!;

test('the web server: an address without the key, or an old one, is refused - no join set, no handler run, no file read, nothing logged, no poll ended', () => {
  const p = panel({ 'room.glb': 'GLB', 'page.html': '<p>hi</p>', 'a.js': 'go()' });
  p.IvaHttp.web('IvaWeb', 8900);
  p.IvaHttp.app('x', { asset: 'a.js', joins: { lamp: 'd5' }, options: {}, handlers: {}, record: null });
  let rang: unknown;
  p.IvaHttp.handle('x', 'ring', (n: number) => (rang = n));
  const key = keyOf(p.IvaHttp.url(''));
  // a poll held (the app's page waits for news)
  assert.equal(p.ask(`/x/iva/poll?v=1&r=held&k=${key}`), null);
  const old = keyOf(panel().IvaHttp.url(''));
  assert.notEqual(old, key);
  for (const k of ['', `&k=${old}`, '&k=']) {
    for (const target of ['/x/iva/set?lamp=1', '/x/iva/call?fn=ring&args=%5B2%5D', '/x/iva/asset/room.glb', '/iva-file/page.html?r=1',
      '/iva/log?m=hi', '/x/iva/boot?r=1', '/x/iva/poll?v=0', '/x/?r=1', '/x/index.html?r=1']) {
      const raw = p.ask(target + k)!;
      assert.equal(answer(raw).status, 'HTTP/1.1 403 Forbidden', target + k);
      assert.match(dataOf(raw).error, /key/);
    }
  }
  assert.deepEqual([p.joins.d5, rang, p.loaded, p.logged], [undefined, undefined, [], []]);
  // the poll held is still the page's: a change answers it
  p.CF.setJoin('d5', 1);
  p.tick(25);
  const last = p.sent[p.sent.length - 1];
  assert.deepEqual([answer(last).headers['x-iva-req'], dataOf(last).values], ['held', { lamp: 1 }]);
  // no answer gives the key away (iViewer sends each to every client)
  assert.ok(p.sent.every((raw) => !raw.includes(key)));
});

test('the web server: the addresses it gives have the key (new each start); with it a web view is answered; the ping and the swatches need none', () => {
  const p = panel();
  p.IvaHttp.web('IvaWeb', 8900);
  p.IvaHttp.app('x', { asset: 'a.js', joins: { lamp: 'd5', k: 'd6' }, options: {}, handlers: {}, record: null });
  p.IvaHttp.view('s5', 'x/');
  p.IvaHttp.view('s6', 'iva-file/page.html');
  p.tick(1000);
  const key = keyOf(p.joins.s5 as string);
  assert.match(key, /^[0-9a-f]{24}$/);
  assert.deepEqual([p.joins.s5, p.joins.s6], [`http://127.0.0.1:8900/x/?k=${key}`, `http://127.0.0.1:8900/iva-file/page.html?k=${key}`]);
  assert.equal(p.IvaHttp.url('/iva-color/FFB000'), `http://127.0.0.1:8900/iva-color/FFB000?k=${key}`);
  assert.equal(p.IvaHttp.url('x/?look=dark#top'), `http://127.0.0.1:8900/x/?look=dark&k=${key}#top`);
  // with the key: a join set (not one named k - the key is no join's value)
  p.ask(`/x/iva/set?lamp=1&r=1&k=${key}`);
  assert.deepEqual([p.joins.d5, p.joins.d6], ['1', undefined]);
  // without: the server's self-check, a swatch
  assert.deepEqual([answer(p.ask('/iva/ping?n=1')!).status, answer(p.ask('/iva/ping?n=1')!).body], ['HTTP/1.1 200 OK', 'ok']);
  assert.deepEqual([answer(p.ask('/iva-color/FFB000')!).status, dataOf(p.ask('/iva-color/FFB000')!)], ['HTTP/1.1 200 OK', null]);
});

test('the web server: a project file\'s name stays in the project - "..", a URL, a path from the root aren\'t read, even with the key', () => {
  const p = panel({ 'sub/room.glb': 'GLB', 'v1..2.html': '<p>v</p>' });
  p.IvaHttp.web('IvaWeb', 8900);
  p.IvaHttp.app('x', { asset: 'a.js', joins: {}, options: {}, handlers: {}, record: null });
  const k = `k=${keyOf(p.IvaHttp.url(''))}`;
  for (const target of ['/x/iva/asset/..%2F..%2Fproject.gui', '/x/iva/asset/..%5Cproject.gui', '/x/iva/asset/http%3A%2F%2Frouter%2Fadmin',
    '/x/iva/asset/%2Fetc%2Fpasswd', '/iva-file/..%2Fproject.gui', '/iva-file/sub/../../project.gui', '/iva-file/file%3A%2F%2F%2Fetc%2Fpasswd', '/iva-file/%2Fetc%2Fpasswd']) {
    const raw = p.ask(`${target}?${k}`)!;
    assert.equal(answer(raw).status, 'HTTP/1.1 400 Bad Request', target);
    assert.match(dataOf(raw).error, /^not a project file: /);
  }
  assert.deepEqual(p.loaded, []);
  // a folder, dots in a name: read
  assert.equal(Buffer.from(dataOf(p.ask(`/x/iva/asset/sub%2Froom.glb?${k}`)!).b64, 'base64').toString(), 'GLB');
  assert.equal(dataOf(p.ask(`/iva-file/v1..2.html?${k}`)!).file, '<p>v</p>');
});

/** a web app: iva/web sets lamp and calls ring at once (panel: window.panel) */
let bundled = '';
function appCode() {
  if (bundled) return bundled;
  const entry = path.join(tmpDir('iva-http-key-'), 'app.js');
  fs.writeFileSync(entry, "import { panel } from 'iva/web';\nwindow.panel = panel;\npanel.set('lamp', 1);\npanel.call('ring', 2);\n");
  return (bundled = bundleWebApp(entry).code.toString('utf8'));
}

test('a web view\'s page carries its key: the boot page and iva/web ask with it, a page whose address has none sets nothing and says why', () => {
  const p = panel({ 'apps/x.js': appCode(), 'page.html': '<p>Hallo</p>' });
  p.IvaHttp.web('IvaWeb', 8900);
  p.IvaHttp.app('x', { asset: 'apps/x.js', joins: { lamp: 'd5' }, options: {}, handlers: {}, record: null, bg: '#123456' });
  let rang: unknown;
  p.IvaHttp.handle('x', 'ring', (n: number) => (rang = n));
  // without the key (another device), or with an old one: the page shows why, and asks nothing more
  for (const address of ['http://127.0.0.1:8900/x/', `http://127.0.0.1:8900/x/?k=${'0'.repeat(24)}`]) {
    assert.match(p.open(address).body.textContent, /key/);
  }
  assert.deepEqual([p.joins.d5, rang, p.logged], [undefined, undefined, []]);
  // the address the panel gives: booted, its app's set and call answered, what it reports in the panel's log
  p.open(p.IvaHttp.url('x/'));
  assert.deepEqual([p.joins.d5, rang], ['1', 2]);
  assert.match(p.logged.join('\n'), /^web \/x\/: loaded, 400x300/m);
  // a page of the project, its first answer another's (a swatch's): asked again, with the key
  assert.equal(p.open(p.IvaHttp.url('iva-file/page.html'), '/iva-color/000000').body.textContent, '<p>Hallo</p>');
  assert.match(p.open('http://127.0.0.1:8900/iva-file/page.html', '/iva-color/000000').body.textContent, /key/);
});

test('iva/web refused (the panel started again since its page loaded: a new key): it asks nothing more', () => {
  const start = () => {
    const p = panel({ 'apps/x.js': appCode() });
    p.IvaHttp.web('IvaWeb', 8900);
    p.IvaHttp.app('x', { asset: 'apps/x.js', joins: { lamp: 'd5' }, options: {}, handlers: {}, record: null });
    p.IvaHttp.handle('x', 'ring', () => 0);
    return p;
  };
  const p = start();
  const view = p.open(p.IvaHttp.url('x/'));
  assert.equal(p.joins.d5, '1');
  // the panel again: the page still there, its key old
  const again = start();
  view.ask = again.ask;
  let error: Error | undefined;
  view.window.panel.set('lamp', 0).catch((e: Error) => (error = e));
  assert.equal(again.sent.length, 1);
  assert.equal(answer(again.sent[0]).status, 'HTTP/1.1 403 Forbidden');
  assert.deepEqual(again.joins, {});
  view.window.panel.set('lamp', 1).catch(() => {});
  assert.equal(again.sent.length, 1);
  return Promise.resolve().then(() => assert.match(String(error), /key/));
});

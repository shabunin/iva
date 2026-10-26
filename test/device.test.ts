import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startDeviceServer } from '../src/server/device.ts';
import { readZip } from '../src/server/zip.ts';
import { tmpDir } from './tmp.ts';

const ECHO = path.resolve(import.meta.dirname, '../fixtures/local/echo-system/echo.gui');
const quiet = () => {};

async function get(port: number, p: string, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { method });
  return { status: res.status, headers: res.headers, body: method === 'HEAD' ? '' : await res.text() };
}

/** What /__iva/wait?v=<version> answers within `ms`: the build it sees - null if it's still waiting (no newer build). */
async function waited(port: number, version: string, ms = 300): Promise<string | null> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    return await (await fetch(`http://127.0.0.1:${port}/__iva/wait?v=${encodeURIComponent(version)}`, { signal: abort.signal })).text();
  } catch (e) {
    if (abort.signal.aborted) return null;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

test('serves a .gui the way GUI Designer\'s Upload Service does', async () => {
  const dir = tmpDir('iva-serve-');
  fs.copyFileSync(ECHO, path.join(dir, 'Echo.gui'));
  fs.writeFileSync(path.join(dir, 'Logo.PNG'), 'png');
  const s = await startDeviceServer({ target: path.join(dir, 'Echo.gui'), port: 0, host: '127.0.0.1', live: false, log: quiet });
  try {
    for (const p of ['/', '/Echo.gui', '/echo.gui']) {
      const r = await get(s.port, p);
      assert.equal(r.status, 200, p);
      assert.equal(r.headers.get('content-type'), 'text/xml');
      assert.equal(r.headers.get('cf-server'), 'v2.7.10.918;debug=launchmonitor;complete=cachecomplete');
      assert.ok(r.headers.get('last-modified'));
      assert.match(r.body, /<project>Echo system/);
      assert.doesNotMatch(r.body, /iva-live/);
    }
    // files by name, whatever the case (projects come from Windows)
    assert.equal((await get(s.port, '/logo.png')).body, 'png');
    assert.equal((await get(s.port, '/logo.png')).headers.get('content-type'), 'image/png');
    assert.equal((await get(s.port, '/nope.png')).status, 404);
    assert.equal((await get(s.port, '/', 'HEAD')).status, 200);
  } finally {
    await s.close();
  }
});

test('live: the served .gui reloads itself after a change', async () => {
  const dir = tmpDir('iva-serve-');
  const gui = path.join(dir, 'Echo.gui');
  fs.copyFileSync(ECHO, gui);
  const s = await startDeviceServer({ target: gui, port: 0, host: '127.0.0.1', live: true, log: quiet });
  try {
    const served = (await get(s.port, '/')).body;
    // named after the build (a page that got this .gui before a rebuild gets this build's script after it)
    const named = /<script name="(iva-live-[a-z0-9]+\.js)" \/>/.exec(served)![1];
    const script = (await get(s.port, `/${named}`)).body;
    // where iViewer asks for it: in the .gui's image folder
    assert.equal((await get(s.port, `/images/${named}`)).body, script);
    assert.match(script, new RegExp(`var base = "http://127\\.0\\.0\\.1:${s.port}"`));
    assert.match(script, /CF\.loadGUI\(base \+ "\/", \{ reloadGUI: true, reloadAssets: true, reloadAllAssets: true \}\)/);
    // its systems switched off before (iViewer keeps a GUI's sockets past a reload: a server would hold its port)
    assert.match(script, /var systems = \["Echo"\];[\s\S]*CF\.setSystemProperties\(n, \{ enabled: false \}\)[\s\S]*CF\.loadGUI/);
    const version = /var version = "([^"]+)"/.exec(script)![1];
    assert.equal(named, `iva-live-${version}.js`);
    // an older iva serve's .gui (iva-live.js): its script sees the build served now at once, and reloads into it
    const older = /var version = "([^"]*)"/.exec((await get(s.port, '/images/iva-live.js')).body)![1];
    assert.equal(await waited(s.port, older), version);
    // a device waiting for the next build gets it as soon as the file changes
    const waiting = get(s.port, `/__iva/wait?v=${version}`);
    await new Promise((r) => setTimeout(r, 100));
    fs.appendFileSync(gui, '\n');
    const next = await waiting;
    assert.equal(next.status, 200);
    assert.notEqual(next.body, version);
  } finally {
    await s.close();
  }
});

test('live: a .gui served before a rebuild gets its own build\'s live script - it sees the newer build at once; the newest one waits', async () => {
  const dir = tmpDir('iva-serve-');
  const gui = path.join(dir, 'Echo.gui');
  fs.copyFileSync(ECHO, gui);
  const s = await startDeviceServer({ target: gui, port: 0, host: '127.0.0.1', live: true, log: quiet });
  const liveIn = (xml: string) => /<script name="(iva-live[^"]*\.js)" \/>/.exec(xml)![1];
  const versionIn = (script: string) => /var version = "([^"]*)"/.exec(script)![1];
  try {
    // the device has the .gui, then the project is rebuilt before it asks for the scripts (iva serve's log:
    // GET / -> 200, built app.jsx, GET /assets/iva-live.js)
    const before = liveIn((await get(s.port, '/')).body);
    const first = versionIn((await get(s.port, `/images/${before}`)).body);
    const rebuilt = waited(s.port, first, 10000);
    fs.appendFileSync(gui, '\n');
    const second = await rebuilt;
    assert.ok(second && second !== first);
    // that .gui's live script, asked for now: it waits on the build that .gui is of, so it sees the newer one
    // and reloads the panel
    const late = versionIn((await get(s.port, `/images/${before}`)).body);
    assert.equal(late, first);
    assert.equal(await waited(s.port, late), second);
    // the newest .gui names its own live script, which waits for the next build
    const after = liveIn((await get(s.port, '/')).body);
    assert.notEqual(after, before);
    const current = versionIn((await get(s.port, `/images/${after}`)).body);
    assert.equal(current, second);
    assert.equal(await waited(s.port, current), null);
  } finally {
    await s.close();
  }
});

test('live: the panel\'s log in the console - CF.log, what its servers get and send, whether they answer', async () => {
  const lines: string[] = [];
  const s = await startDeviceServer({
    target: path.resolve(import.meta.dirname, '../examples/gallery/app.jsx'), port: 0, host: '127.0.0.1', live: true, log: (m) => lines.push(m),
  });
  try {
    const named = /<script name="(iva-live-[a-z0-9]+\.js)" \/>/.exec((await get(s.port, '/')).body)![1];
    const script = (await get(s.port, `/assets/${named}`)).body;
    assert.doesNotThrow(() => new Function(script));
    // the gallery's servers (its web apps', its camera's, its API's, the Network page's echo), found in the .gui: probed and watched
    assert.match(script, /var servers = \[\{"name":"IvaWeb","port":8900,"feedback":\["request"\]\},\{"name":"galleryCams","port":8898,"feedback":\["request"\]\},\{"name":"galleryApiServer","port":8899,"feedback":\["request"\]\},\{"name":"EchoServer","port":8897,"feedback":\["line"\]\}\];/);
    // a fake panel runs it: what it logs and its servers do reaches the console
    const sent: string[] = [];
    const watchers: { event: string; cb: (...a: any[]) => void }[] = [];
    const CF: any = {
      ConnectionStatusChangeEvent: 'conn', FeedbackMatchedEvent: 'fb', PageFlipEvent: 'page', version: '5.0.7', modules: [],
      log: () => {}, send: () => {}, loadGUI: () => {},
      watch: (event: string, ...a: any[]) => watchers.push({ event, cb: a[a.length - 1] === true ? a[a.length - 2] : a[a.length - 1] }),
      request: (url: string, cb: (...a: any[]) => void) => {
        sent.push(url);
        if (url.includes('/__iva/log')) get(s.port, url.replace(/^http:\/\/[^/]+/, '')).then(() => cb(200, {}, 'ok'));
      },
    };
    new Function('CF', 'setTimeout', script)(CF, () => 0);
    // iViewer runs the modules' setup when the scripts start: the servers are probed after
    for (const m of CF.modules) m.setup();
    CF.log('hello from the panel');
    watchers.find((w) => w.event === 'fb')!.cb('request', 'GET /iva-color/000000 HTTP/1.1\r\nHost: x\r\n\r\n');
    CF.send('IvaWeb', 'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n');
    watchers.find((w) => w.event === 'page')!.cb('Overview', 'Dials');
    for (let i = 0; i < 50 && !lines.some((l) => /page: Dials/.test(l)); i++) await new Promise((r) => setTimeout(r, 20));
    const panel = lines.filter((l) => l.startsWith('panel '));
    assert.ok(panel.some((l) => /started: iViewer 5\.0\.7, 4 server/.test(l)), panel.join('\n'));
    assert.ok(panel.some((l) => /hello from the panel/.test(l)));
    assert.ok(panel.some((l) => /scripts started/.test(l)));
    assert.ok(panel.some((l) => /IvaWeb got GET \/iva-color\/000000 HTTP\/1\.1/.test(l)));
    assert.ok(panel.some((l) => /IvaWeb sends HTTP\/1\.1 200 OK/.test(l)));
    assert.ok(panel.some((l) => /page: Dials/.test(l)));
  } finally {
    await s.close();
  }
});

test('a JSX project is built and served from memory', async () => {
  const s = await startDeviceServer({
    target: path.resolve(import.meta.dirname, '../examples/hello/app.jsx'), port: 0, host: '127.0.0.1', live: true, log: quiet,
  });
  try {
    assert.equal(s.name, 'Hello-iva.gui');
    const gui = (await get(s.port, '/Hello-iva.gui')).body;
    // the build's folders: scripts/, assets/ (the .gui's image folder)
    assert.match(gui, /<imagefolder>assets<\/imagefolder>/);
    assert.match(gui, /<script name="scripts\/iva-joins\.js" \/>\s*<script name="scripts\/main\.js" \/>\s*<script name="iva-live-[a-z0-9]+\.js" \/>/);
    const png = /sliders\/[\w-]+-track\.png/.exec(gui)![0];
    const image = await get(s.port, `/assets/${png}`);
    assert.equal(image.headers.get('content-type'), 'image/png');
    // the panel app's page (another origin) draws them with WebGL: CORS
    assert.equal(image.headers.get('access-control-allow-origin'), '*');
    // scripts in the image folder: iViewer looks for <script name="scripts/x.js"> in assets/
    assert.match((await get(s.port, '/assets/scripts/iva-joins.js')).body, /var Joins/);
    assert.equal((await get(s.port, '/scripts/iva-joins.js')).status, 404);
    assert.equal((await get(s.port, '/assets/scripts/../iva-joins.js')).status, 404);
  } finally {
    await s.close();
  }
});

test('the whole build in one zip for the panel to keep, and 304 for the build it has', async () => {
  const s = await startDeviceServer({
    target: path.resolve(import.meta.dirname, '../examples/hello/app.jsx'), port: 0, host: '127.0.0.1', live: true, log: quiet,
  });
  try {
    const res = await fetch(`http://127.0.0.1:${s.port}/__iva/gui.zip`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'application/zip');
    const etag = res.headers.get('etag')!;
    const files = readZip(Buffer.from(await res.arrayBuffer()));
    // the .gui and every file at the path it's served from (its case kept), the live script too
    const gui = files.get('Hello-iva.gui')!.toString('utf8');
    assert.match(gui, /<imagefolder>assets<\/imagefolder>/);
    assert.ok([...files.keys()].some((n) => /^assets\/sliders\/[\w-]+-track\.png$/.test(n)));
    assert.match(files.get('assets/scripts/iva-joins.js')!.toString('utf8'), /var Joins/);
    // the live script by the name the .gui gives it, waiting on this build
    const named = /<script name="(iva-live-[a-z0-9]+\.js)" \/>/.exec(gui)![1];
    assert.match(files.get(named)!.toString('utf8'), new RegExp(`var version = ${etag};[\\s\\S]*__iva/wait`));
    // the same build again: not modified
    const again = { headers: { 'If-None-Match': etag } };
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/__iva/gui.zip`, again)).status, 304);
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/`, again)).status, 304);
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/`, { headers: { 'If-None-Match': '"other"' } })).status, 200);
  } finally {
    await s.close();
  }
});

test('<Project sizes>: each size a GUI of its own at a path of its own - built after the one at /, again on a save; its own archive (that size only), live script and log', async () => {
  const dir = tmpDir('iva-serve-sizes-');
  const entry = path.join(dir, 'app.jsx');
  fs.writeFileSync(entry, `const { width } = screen();
export default (
  <Project name="app" width={1280} height={800} sizes={['1400x1400@3x']}>
    <Page name="Main"><Box x={16} y={16} w={width - 32} h={100} bg="#336699" radius={8} /></Page>
  </Project>
);`);
  const lines: string[] = [];
  const s = await startDeviceServer({ target: entry, port: 0, host: '127.0.0.1', live: true, log: (m) => lines.push(m) });
  try {
    assert.deepEqual(s.sizes, [{ path: '/', label: '1280x800' }, { path: '/1400w1400h/', label: '1400x1400@3x' }]);
    // at /: the project's own size, as before
    const root = await get(s.port, '/');
    assert.match(root.body, /<portrait width="800" height="1280" \/>\s*<landscape width="1280" height="800" \/>/);
    // the other at its folder (asked for before it's built: once it is), by the .gui's name too
    const phone = await get(s.port, '/1400w1400h/');
    assert.equal(phone.status, 200);
    assert.match(phone.body, /<portrait width="467" height="467" \/>\s*<landscape width="467" height="467" \/>/);
    assert.equal((await get(s.port, '/1400w1400h/app.gui')).body, phone.body);
    assert.ok(lines.some((l) => /^built 1400x1400@3x in \d+ ms \(at \/1400w1400h\/\)$/.test(l)), lines.join('\n'));
    // its folder without the slash: there with it (its .gui's files are named from beside it)
    const bare = await fetch(`http://127.0.0.1:${s.port}/1400w1400h`, { redirect: 'manual' });
    assert.equal(bare.status, 301);
    assert.equal(bare.headers.get('location'), '/1400w1400h/');
    // its archive: that size only, at its root - its files beside its .gui, served there too
    const res = await fetch(`http://127.0.0.1:${s.port}/1400w1400h/__iva/gui.zip`);
    assert.equal(res.headers.get('etag'), phone.headers.get('etag'));
    const files = readZip(Buffer.from(await res.arrayBuffer()));
    assert.match(files.get('app.gui')!.toString('utf8'), /<landscape width="467" height="467" \/>/);
    assert.ok(files.has('joins.json'));
    assert.ok(![...files.keys()].some((n) => /^\d+w\d+h\//.test(n)), [...files.keys()].join('\n'));
    const png = [...files.keys()].find((n) => /\/boxes\/[\w-]+\.png$/.test(n))!;
    assert.equal((await get(s.port, `/1400w1400h/${png}`)).headers.get('content-type'), 'image/png');
    assert.equal((await fetch(`http://127.0.0.1:${s.port}/1400w1400h/__iva/gui.zip`, { headers: { 'If-None-Match': res.headers.get('etag')! } })).status, 304);
    // the one at /: its own size only too
    const own = readZip(Buffer.from(await (await fetch(`http://127.0.0.1:${s.port}/__iva/gui.zip`)).arrayBuffer()));
    assert.match(own.get('app.gui')!.toString('utf8'), /<landscape width="1280" height="800" \/>/);
    assert.ok(![...own.keys()].some((n) => /^\d+w\d+h\//.test(n)), [...own.keys()].join('\n'));
    // its live script (in the archive too): waits on its own build, reloads its own path, logs as that size
    const named = /<script name="(iva-live-[a-z0-9]+\.js)" \/>/.exec(phone.body)![1];
    const script = (await get(s.port, `/1400w1400h/assets/${named}`)).body;
    assert.equal(files.get(named)!.toString('utf8'), script);
    assert.match(script, new RegExp(`var base = "http://127\\.0\\.0\\.1:${s.port}/1400w1400h"`));
    const version = /var version = "([^"]+)"/.exec(script)![1];
    assert.equal(`"${version}"`, phone.headers.get('etag'));
    await get(s.port, `/1400w1400h/__iva/log?m=${encodeURIComponent('hello')}`);
    assert.ok(lines.includes('panel 127.0.0.1 (1400x1400@3x): hello'), lines.join('\n'));
    // a save: every size built again - a device on the other size gets its next build
    const waiting = get(s.port, `/1400w1400h/__iva/wait?v=${version}`);
    await new Promise((r) => setTimeout(r, 100));
    fs.appendFileSync(entry, '\n');
    const next = await waiting;
    assert.notEqual(next.body, version);
    assert.equal((await get(s.port, '/1400w1400h/')).headers.get('etag'), `"${next.body}"`);
  } finally {
    await s.close();
  }
  // --size: that size only, at /
  const sized = await startDeviceServer({ target: entry, port: 0, host: '127.0.0.1', live: false, size: '1400x1400@3x', log: quiet });
  try {
    assert.deepEqual(sized.sizes, [{ path: '/', label: '1400x1400@3x' }]);
    const files = readZip(Buffer.from(await (await fetch(`http://127.0.0.1:${sized.port}/__iva/gui.zip`)).arrayBuffer()));
    assert.match(files.get('app.gui')!.toString('utf8'), /<landscape width="467" height="467" \/>/);
    assert.equal((await get(sized.port, '/1400w1400h/')).status, 404);
  } finally {
    await sized.close();
  }
});

test('a request for // or worse is answered, not a crash', async () => {
  const dir = tmpDir('iva-serve-');
  fs.copyFileSync(ECHO, path.join(dir, 'Echo.gui'));
  const s = await startDeviceServer({ target: path.join(dir, 'Echo.gui'), port: 0, host: '127.0.0.1', live: false, log: quiet });
  try {
    for (const p of ['//', '//x/y', '///Echo.gui']) {
      const status = await new Promise<number>((resolve, reject) => {
        http.get({ host: '127.0.0.1', port: s.port, path: p }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }).on('error', reject);
      });
      assert.ok(status === 200 || status === 404, `${p}: ${status}`);
    }
    assert.equal((await get(s.port, '/Echo.gui')).status, 200);
  } finally {
    await s.close();
  }
});

test("a path with a '%' that starts no escape: the file named so, else 400 - not a crash", async () => {
  const dir = tmpDir('iva-serve-');
  fs.copyFileSync(ECHO, path.join(dir, 'Echo.gui'));
  fs.writeFileSync(path.join(dir, '100%.png'), 'full');
  const s = await startDeviceServer({ target: path.join(dir, 'Echo.gui'), port: 0, host: '127.0.0.1', live: false, log: quiet });
  try {
    assert.equal((await get(s.port, '/%E0%A4%A')).status, 400);
    assert.equal((await get(s.port, '/50%.png')).status, 400);
    assert.equal((await get(s.port, '/100%.png')).body, 'full');
    assert.equal((await get(s.port, '/100%25.png')).body, 'full');
    assert.equal((await get(s.port, '/Echo.gui')).status, 200);
  } finally {
    await s.close();
  }
});

test('serves a folder of GUIs: every file by its path, a page at / listing the GUIs, no one build to archive', async () => {
  const dir = tmpDir('iva-serve-dir-');
  for (const name of ['home', 'lights']) {
    fs.mkdirSync(path.join(dir, name, 'assets'), { recursive: true });
    fs.copyFileSync(ECHO, path.join(dir, name, `${name[0].toUpperCase()}${name.slice(1)}.gui`));
    fs.writeFileSync(path.join(dir, name, 'assets', 'logo.png'), `png ${name}`);
  }
  const s = await startDeviceServer({ target: dir, port: 0, host: '127.0.0.1', live: true, log: quiet });
  try {
    const index = await get(s.port, '/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type') ?? '', /^text\/html/);
    assert.match(index.body, /href="home\/Home\.gui"/);
    assert.match(index.body, /href="lights\/Lights\.gui"/);
    const gui = await get(s.port, '/lights/Lights.gui');
    assert.equal(gui.status, 200);
    assert.equal(gui.headers.get('content-type'), 'text/xml');
    assert.match(gui.body, /<project>Echo system/);
    // no live script in a folder's GUIs (nothing is built here)
    assert.doesNotMatch(gui.body, /iva-live/);
    assert.equal((await get(s.port, '/home/assets/logo.png')).body, 'png home');
    // a .gui that isn't there is not there (a single .gui served answers any .gui name with itself)
    assert.equal((await get(s.port, '/nope.gui')).status, 404);
    assert.equal((await get(s.port, '/__iva/gui.zip')).status, 404);
  } finally {
    await s.close();
  }
});

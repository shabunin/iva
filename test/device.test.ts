import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startDeviceServer } from '../src/server/device.ts';

const ECHO = path.resolve(import.meta.dirname, '../fixtures/local/echo-system/echo.gui');
const quiet = () => {};

async function get(port: number, p: string, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${port}${p}`, { method });
  return { status: res.status, headers: res.headers, body: method === 'HEAD' ? '' : await res.text() };
}

test('serves a .gui the way GUI Designer\'s Upload Service does', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-serve-'));
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
      assert.doesNotMatch(r.body, /iva-live\.js/);
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-serve-'));
  const gui = path.join(dir, 'Echo.gui');
  fs.copyFileSync(ECHO, gui);
  const s = await startDeviceServer({ target: gui, port: 0, host: '127.0.0.1', live: true, log: quiet });
  try {
    const served = (await get(s.port, '/')).body;
    assert.match(served, /<script name="iva-live\.js" \/>/);
    const script = (await get(s.port, '/iva-live.js')).body;
    assert.match(script, new RegExp(`var base = "http://127\\.0\\.0\\.1:${s.port}"`));
    assert.match(script, /CF\.loadGUI\(base \+ "\/", \{ reloadGUI: true, reloadAssets: true, reloadAllAssets: true \}\)/);
    const version = /var version = "([^"]+)"/.exec(script)![1];
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

test('a JSX project is built and served from memory', async () => {
  const s = await startDeviceServer({
    target: path.resolve(import.meta.dirname, '../examples/hello/app.jsx'), port: 0, host: '127.0.0.1', live: true, log: quiet,
  });
  try {
    assert.equal(s.name, 'Hello-iva.gui');
    const gui = (await get(s.port, '/Hello-iva.gui')).body;
    assert.match(gui, /<script name="iva-joins\.js" \/>\s*<script name="main\.js" \/>\s*<script name="iva-live\.js" \/>/);
    const png = /iva_track_[0-9a-f]+\.png/.exec(gui)![0];
    assert.equal((await get(s.port, `/${png}`)).headers.get('content-type'), 'image/png');
    assert.match((await get(s.port, '/iva-joins.js')).body, /var Joins/);
  } finally {
    await s.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { loadRemoteManifest, resolveGuiLink } from '../src/server/project.ts';
import { loadGUI, openURL } from '../src/runtime/cf/jsapi/utilities.ts';
import { compile } from '../src/compiler/index.ts';

const guis = [
  { rel: 'GUILinking/gui-A.gui', name: 'GUILinking/gui-A.gui' },
  { rel: 'GUILinking/gui-B.gui', name: 'GUILinking/gui-B.gui' },
  { rel: 'Other/gui-B.gui', name: 'Other/gui-B.gui' },
];

test('a GUI link: the project\'s .gui of that name (its own folder first), else the URL', () => {
  // CommandFusion's GUILinking demo: cf://<their server>/gui-B.gui - here, this machine's copy
  assert.deepEqual(resolveGuiLink(guis, 'GUILinking/gui-A.gui', 'cf://192.168.0.10:8019/gui-B.gui'),
    { gui: 'GUILinking/gui-B.gui', note: "cf://192.168.0.10:8019/gui-B.gui - this machine's GUILinking/gui-B.gui" });
  assert.deepEqual(resolveGuiLink(guis, 'GUILinking/gui-A.gui', 'gui-B.gui'), { gui: 'GUILinking/gui-B.gui' });
  assert.deepEqual(resolveGuiLink(guis, 'GUILinking/gui-A.gui', 'http://host:8019/far/away.gui'), { gui: 'http://host:8019/far/away.gui' });
  // from a GUI on a server: names next to it there
  assert.deepEqual(resolveGuiLink(guis, 'http://host/dir/a.gui', 'next.gui'), { gui: 'http://host/dir/next.gui' });
  assert.throws(() => resolveGuiLink(guis, 'GUILinking/gui-A.gui', 'nope.gui'), /no nope\.gui next to GUILinking\/gui-A\.gui/);
});

test('a .gui on a web server: its images and scripts next to it, through the proxy', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-remote-'));
  fs.writeFileSync(path.join(dir, 'clock.gui'), `﻿<gui><properties><project>Clock</project></properties>
<themes><theme type="background" name="bg"><![CDATA[ .bg { background-image: url(face.png); } ]]></theme></themes>
<scripts><script name="main.js" /><script name="gone.js" /></scripts>
<page name="P"><portrait><img x="0" y="0" w="9" h="9" j="0">hand.png</img></portrait></page></gui>`);
  fs.writeFileSync(path.join(dir, 'main.js'), 'CF.log(1);');
  const server = http.createServer((req, res) => {
    const file = path.join(dir, decodeURIComponent(req.url!.slice(1)));
    if (!fs.existsSync(file)) return res.writeHead(404).end();
    res.end(fs.readFileSync(file));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  try {
    const m = await loadRemoteManifest(`cf://127.0.0.1:${port}/clock.gui`, (abs) => `/proxy?${abs}`);
    assert.equal(m.title, 'Clock');
    assert.deepEqual(m.imageMap, { 'face.png': `/proxy?http://127.0.0.1:${port}/face.png`, 'hand.png': `/proxy?http://127.0.0.1:${port}/hand.png` });
    assert.deepEqual([m.scriptMap, m.missingScripts], [{ 'main.js': 'CF.log(1);' }, ['gone.js']]);
    assert.equal(m.fileBase, `/proxy?http://127.0.0.1:${port}/`);
    await assert.rejects(loadRemoteManifest(`http://127.0.0.1:${port}/nope.gui`, (a) => a), /HTTP 404/);
  } finally {
    server.close();
  }
});

test('CF.loadGUI, CF.openURL("cf://..."): the host loads it; iViewer 5 profiles aren\'t the preview\'s', () => {
  const calls: unknown[][] = [];
  const ctx = { renderer: { loadGui: (...a: unknown[]) => calls.push(a) } } as never;
  loadGUI(ctx, 'http://host/x.gui', { startPage: 'Main' });
  openURL(ctx, 'cf://host:8019/y.gui');
  loadGUI(ctx, '', null);
  const warn = console.warn;
  console.warn = () => {};
  try {
    loadGUI(ctx, 'profile:Living room', {});
  } finally {
    console.warn = warn;
  }
  assert.deepEqual(calls, [['http://host/x.gui', { startPage: 'Main' }], ['cf://host:8019/y.gui', {}], ['', {}]]);
});

test('<Button href>: a link, written as GUI Designer does (before flip)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-href-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), `export default (
  <Project name="T" width={1024} height={768}>
    <Page name="Main"><Button w={100} h={40} text="B" href="cf://192.168.0.10:8019/gui-B.gui" /></Page>
  </Project>
);`);
  const r = await compile(path.join(dir, 'app.jsx'));
  assert.match(r.xml, /<btn [^>]*href="cf:\/\/192\.168\.0\.10:8019\/gui-B\.gui" flip="None"/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { decompile } from '../src/decompiler/index.ts';
import { buildFiles, compile, IvaError, writeBuild } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';

const inside = (dir: string, f: string) => !path.relative(dir, f).startsWith('..');

test("a .gui's file names that lead out of its folder (../, absolute) stay in the decompiled project, and out of its build", async () => {
  const dir = tmpDir('iva-dec-paths-');
  const src = path.join(dir, 'src');
  const out = path.join(dir, 'dec', 'out', 'proj');
  fs.mkdirSync(src);
  fs.writeFileSync(path.join(src, 'pwned.txt'), 'planted');
  fs.writeFileSync(path.join(src, 'key.mp3'), 'the GUI\'s own');
  // someone's files elsewhere: a sound by ../, an image by its absolute path
  const secret = path.join(dir, 'secret');
  fs.mkdirSync(secret);
  fs.writeFileSync(path.join(secret, 'key.mp3'), 'not the GUI\'s');
  fs.writeFileSync(path.join(secret, 'key.png'), 'not the GUI\'s');
  const up = path.relative(path.join(out, 'assets'), path.join(secret, 'key.mp3')).split(path.sep).join('/');
  fs.writeFileSync(path.join(src, 'demo.gui'), `<?xml version="1.0" encoding="utf-8"?>
<gui>
  <properties><project>Demo</project><designer>0</designer><size autoposition="scale"><portrait width="768" height="1024"/><landscape width="1024" height="768"/></size></properties>
  <sounds><sound name="key" j="0" loop="0" releasestop="0">${up}</sound></sounds>
  <scripts><script name="../../../pwned.txt" /></scripts>
  <page name="Home" j="0" transition="None" subtype="None" time="0" ease=""><portrait /><landscape>
    <img x="0" y="0" w="10" h="10" j="0" clickthrough="0" refresh="0" l="0" noCache="0" downloadIndicator="0" clearOnURLChange="0">${path.join(secret, 'key.png')}</img>
  </landscape></page>
</gui>`);
  const d = await decompile(path.join(src, 'demo.gui'), out);
  // the script written in the project's scripts/, not three folders up
  assert.ok(!fs.existsSync(path.join(dir, 'dec', 'pwned.txt')));
  assert.equal(fs.readFileSync(path.join(out, 'scripts', 'pwned.txt'), 'utf8'), 'planted');
  assert.ok(d.files.every((f) => inside(out, path.join(out, f))), d.files.join(', '));
  // the project's sources name the sound by its file name; the image is kept as written, as <Raw> (an <Image> by its file name builds another <img>)
  const sources = d.files.filter((f) => f.endsWith('.jsx')).map((f) => fs.readFileSync(path.join(out, f), 'utf8')).join('\n');
  assert.match(sources, /<Sound name="key" src="\.\/assets\/key\.mp3" \/>/);
  assert.match(sources, /<Raw xml=\{"<img [^}]*>[^<]*key\.png<\/img>"\} \/>/);
  assert.doesNotMatch(sources, /src="(\.\/assets\/)?(\.\.\/|\/)/);
  // its build takes nothing from outside it
  const r = await compile(d.entry);
  assert.ok(r.assets.every((a) => !a.file || inside(out, a.file)), r.assets.map((a) => a.file).join(', '));
  // and writes nothing outside its folder: the .gui's script name refused before the folder is emptied
  const dist = path.join(out, 'dist');
  assert.throws(() => writeBuild(r, dist), (e: any) => e instanceof IvaError && /\.\.\/\.\.\/\.\.\/pwned\.txt: a file out of the build's folder/.test(e.message));
  assert.ok(!fs.existsSync(path.join(dir, 'dec', 'pwned.txt')));
  assert.throws(() => buildFiles(r), /out of the build's folder/);
});

test('writeBuild and buildFiles place no file out of the build: a script or drawing name with ../ or an absolute one is an error, the folder left as it was', async () => {
  // a folder deep: four folders up from the build's scripts is still in the test's own
  const dir = path.join(tmpDir('iva-out-paths-'), 'a', 'proj');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app.jsx'), `export default (
  <Project name="T" width={1024} height={768}>
    <Script name="../../../../evil.js" code="CF.log(1);" />
    <Page name="Main" />
  </Project>
);`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const out = path.join(dir, 'dist');
  // a previous build there: kept
  writeBuild({ ...r, scripts: [] }, out);
  assert.throws(() => writeBuild(r, out), (e: any) => e instanceof IvaError && /evil\.js: a file out of the build's folder/.test(e.message));
  assert.ok(fs.existsSync(path.join(out, 'T.gui')));
  assert.ok(!fs.existsSync(path.join(path.dirname(dir), 'evil.js')));
  assert.throws(() => buildFiles(r), /evil\.js: a file out of the build's folder/);
  // an absolute one beside the .gui (folders={false}; a drawing's fixed name, say)
  const abs = { ...r, layout: { images: '', scripts: '' }, scripts: [], assets: [{ name: path.join(dir, 'abs.png'), data: Buffer.from('png') }] };
  assert.throws(() => writeBuild(abs, out), /abs\.png: a file out of the build's folder/);
  assert.ok(fs.existsSync(path.join(out, 'T.gui')));
  assert.throws(() => buildFiles(abs), /out of the build's folder/);
});

test("a script name that names no file (x/.., .., x/ - a .gui's, kept as an empty script) is an error before the build's folder is emptied, not EISDIR after", async () => {
  const dir = tmpDir('iva-out-paths-');
  const out = path.join(dir, 'dist');
  for (const [name, folders] of [['x/..', false], ['..', true], ['x/', false], ['.', false]] as const) {
    fs.writeFileSync(path.join(dir, 'app.jsx'), `export default (
  <Project name="T" width={1024} height={768}${folders ? '' : ' folders={false}'}>
    <Script name=${JSON.stringify(name)} code="" />
    <Page name="Main" />
  </Project>
);`);
    const r = await compile(path.join(dir, 'app.jsx'));
    writeBuild({ ...r, scripts: [] }, out);
    assert.throws(() => writeBuild(r, out), (e: any) => e instanceof IvaError && /no file's name in it/.test(e.message), name);
    assert.ok(fs.existsSync(path.join(out, 'T.gui')), name);
    assert.throws(() => buildFiles(r), /no file's name in it/, name);
  }
});

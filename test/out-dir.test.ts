import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile, IvaError, writeBuild, type CompileResult } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';

const APP = (props = '') => `export default (
  <Project name="T" width={1024} height={768}${props}>
    <Page name="Main"><Box w={100} h={50} bg="#123456" radius={8} /></Page>
  </Project>
);`;

async function project(jsx: string) {
  const dir = tmpDir('iva-out-src-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  return compile(path.join(dir, 'app.jsx'));
}

const refused = (r: CompileResult, out: string, pattern: RegExp) =>
  assert.throws(() => writeBuild(r, out), (e: any) => e instanceof IvaError && pattern.test(e.message), `${out} not refused`);

test("writeBuild empties only a previous build: a folder with a .gui and someone's files in it is left as it was (iva build -o ~/Desktop)", async () => {
  const r = await project(APP());
  const desk = tmpDir('iva-desk-');
  fs.writeFileSync(path.join(desk, 'old.gui'), '<gui />');
  fs.writeFileSync(path.join(desk, 'precious.txt'), 'keep me');
  fs.mkdirSync(path.join(desk, 'photos'));
  fs.writeFileSync(path.join(desk, 'photos', 'a.jpg'), 'jpg');
  refused(r, desk, /isn't a previous build \(no joins\.json in it\)/);
  // a GUI Designer project's folder (its .gui, its image folder): not iva's either
  const designer = tmpDir('iva-designer-');
  fs.writeFileSync(path.join(designer, 'Demo.gui'), '<gui><properties><imagefolder>images</imagefolder></properties></gui>');
  fs.mkdirSync(path.join(designer, 'images'));
  refused(r, designer, /no joins\.json/);
  // a previous build someone put their files in
  const out = tmpDir('iva-dist-');
  writeBuild(r, out);
  fs.writeFileSync(path.join(out, 'precious.txt'), 'keep me');
  fs.mkdirSync(path.join(out, 'photos'));
  refused(r, out, /isn't only a previous build \((photos, precious\.txt|precious\.txt, photos) in it\)/);
  assert.deepEqual([desk, designer, out].map((d) => fs.readdirSync(d).sort()), [
    ['old.gui', 'photos', 'precious.txt'], ['Demo.gui', 'images'], ['T.gui', 'assets', 'joins.json', 'photos', 'precious.txt'],
  ]);
  assert.equal(fs.readFileSync(path.join(desk, 'photos', 'a.jpg'), 'utf8'), 'jpg');
});

test("a previous build is emptied: its .gui (a renamed project's too) and image folder, --zip's archive, other sizes' builds, the OS's files", async () => {
  const r = await project(APP());
  const out = tmpDir('iva-dist-');
  writeBuild(r, out);
  fs.writeFileSync(path.join(out, 'assets', 'stale.png'), '');
  fs.writeFileSync(path.join(out, 'T.gui.zip'), 'zip');
  fs.writeFileSync(path.join(out, '.DS_Store'), '');
  // a renamed project's, laid out as iva did before scripts went in the image folder
  fs.writeFileSync(path.join(out, 'Old.gui'), '<gui><properties><imagefolder>images</imagefolder></properties><scripts><script name="scripts/main.js" /></scripts></gui>');
  fs.mkdirSync(path.join(out, 'images'));
  fs.mkdirSync(path.join(out, 'scripts'));
  fs.mkdirSync(path.join(out, '800w600h'));
  fs.writeFileSync(path.join(out, '800w600h', 'joins.json'), '{}');
  writeBuild(r, out);
  assert.deepEqual(fs.readdirSync(out).sort(), ['T.gui', 'assets', 'joins.json']);
  assert.ok(!fs.existsSync(path.join(out, 'assets', 'stale.png')));
  // a size's folder without its build in it: not iva's
  fs.mkdirSync(path.join(out, '1024w768h'));
  refused(r, out, /\(1024w768h in it\)/);
  // folders={false}: the build's files beside its .gui are its own
  const flat = await project(APP(' folders={false}'));
  const out2 = tmpDir('iva-dist-');
  writeBuild(flat, out2);
  assert.ok(fs.existsSync(path.join(out2, 'boxes')));
  writeBuild(flat, out2);
  assert.deepEqual(fs.readdirSync(out2).sort(), ['T.gui', 'boxes', 'joins.json']);
  // an older iva's build, all beside its .gui: the files it names (with their @2x)
  const old = tmpDir('iva-dist-');
  fs.writeFileSync(path.join(old, 'Hello.gui'), `<gui><scripts><script name="main.js" /></scripts>
  <themes><theme name=".b"><![CDATA[background-image: url(iva_btn_1a2b.png);]]></theme></themes>
  <page name="Main"><landscape><img x="0" y="0" w="10" h="10">iva_fill_3c4d.png</img><img x="0" y="0" w="10" h="10">R&amp;B.png</img></landscape></page></gui>`);
  for (const f of ['joins.json', 'main.js', 'iva_btn_1a2b.png', 'iva_btn_1a2b@2x.png', 'iva_fill_3c4d.png', 'R&B.png']) fs.writeFileSync(path.join(old, f), '');
  writeBuild(r, old);
  assert.deepEqual(fs.readdirSync(old).sort(), ['T.gui', 'assets', 'joins.json']);
});

test("only what a previous build's .gui names as a file is its own: folders named like its pages, labels or a GUI a script loads are someone's", async () => {
  const PAGES = (props = '') => `export default (
  <Project name="T" width={1024} height={768}${props}>
    <OnStart js="CF.loadGUI('lights/Lights.gui', {});" />
    <Page name="Home"><Box w={100} h={50} bg="#123456" radius={8} /><Text x={0} y={60} w={200} h={40} text="Photos" /></Page>
    <Page name="Music" />
  </Project>
);`;
  for (const props of ['', ' folders={false}']) {
    const r = await project(PAGES(props));
    const out = tmpDir('iva-dist-');
    writeBuild(r, out);
    const before = fs.readdirSync(out).sort();
    for (const d of ['Home', 'Music', 'Photos', 'T', 'lights']) {
      fs.mkdirSync(path.join(out, d));
      fs.writeFileSync(path.join(out, d, d === 'lights' ? 'joins.json' : 'precious.txt'), 'keep me');
    }
    refused(r, out, /isn't only a previous build \(.+, \.\.\. in it\)/);
    assert.deepEqual(fs.readdirSync(out).sort(), [...before, 'Home', 'Music', 'Photos', 'T', 'lights'].sort(), props);
    assert.equal(fs.readFileSync(path.join(out, 'Photos', 'precious.txt'), 'utf8'), 'keep me');
    // the same build alone: emptied
    for (const d of ['Home', 'Music', 'Photos', 'T', 'lights']) fs.rmSync(path.join(out, d), { recursive: true });
    writeBuild(r, out);
    assert.deepEqual(fs.readdirSync(out).sort(), before, props);
  }
});

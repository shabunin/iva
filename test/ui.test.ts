import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { check } from '../src/check.ts';

const GALLERY = path.resolve(import.meta.dirname, '../examples/gallery/app.jsx');

test('the iva/ui gallery builds: one runtime script, the shared subpages once', async () => {
  const r = await compile(GALLERY);
  assert.deepEqual(r.scripts.map((s) => s.name), ['iva-joins.js', 'iva-ui.js', 'iva-start.js']);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaUI\.menu\(/g)!.length, 1); // the side menu is on every page, set up once
  assert.equal(start.match(/IvaUI\.clock\(/g)!.length, 1);
  assert.equal((r.xml.match(/<subpage name="ui_menu" w=/g) ?? []).length, 1);
  assert.equal((r.xml.match(/<subpage name="ui_menu" x=/g) ?? []).length, 6); // placed on every page
  assert.deepEqual(r.warnings, []);
});

test('iva/ui props are checked in the editor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-ui-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Tile } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P"><Tile icon="tv" titel="TV" /></Page>
  </Project>
);
`);
  const c = await check(path.join(dir, 'app.jsx'));
  assert.ok(c.problems.some((p) => /'titel' does not exist.*Did you mean 'title'\?/s.test(p)), c.problems.join('\n'));
});

test('Dial: a track with gestures, arc frames named for the look, a thumb, its setup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-dial-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Dial, Knob } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <Dial join="level" value={65} steps={10} size={200} />
      <Dial x={300} join="other" steps={10} size={200} />
      <Knob x={600} join="vol" min={-10} max={10} step={1} />
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const frames = r.assets.filter((x) => /^iva_dial_\w+_\d+\.png$/.test(x.name));
  assert.equal(frames.length, 11); // 0..10, shared by the two dials that look the same
  assert.equal(r.assets.filter((x) => /^iva_dial_\w+_\d+@2x\.png$/.test(x.name)).length, 11);
  assert.equal((r.xml.match(/<gesture /g) ?? []).length, 6); // tap + pan on each control's ring
  assert.match(r.xml, /js="IvaUI\.dialTouch\(&quot;level&quot;, gesture\.x, gesture\.y\)"/);
  // every frame named in the .gui (in a hidden subpage), so it ships with the project
  assert.equal((r.xml.match(/<subpage name="ui_frames_iva_dial_\w+_" w=/g) ?? []).length, 1);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaUI\.dial\(/g)!.length, 3);
  assert.match(start, /IvaUI\.set\(Joins\.a\["level"\], 65, 0, 100\)/);
});

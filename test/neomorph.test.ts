import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';

const NEOMORPH = path.resolve(import.meta.dirname, '../examples/neomorph');
const IVA = path.resolve(import.meta.dirname, '../bin/iva.mjs');

/** A project of its own with the neomorph kit in it (its drawings go to its .neu/): a slider and a fader. */
function project() {
  const dir = tmpDir('iva-neu-');
  for (const sub of ['neu', 'scripts']) fs.cpSync(path.join(NEOMORPH, sub), path.join(dir, sub), { recursive: true });
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { createNeu } from './neu/index.jsx';
const neu = createNeu();
export default (
  <Project name="T" width={1280} height={800} sizes={['1400x1400@3x']}>
    <Page name="Main"><neu.Slider x={20} y={20} w={300} join="level" /><neu.Fader x={400} y={20} join="fader" /></Page>
  </Project>
);`);
  return dir;
}

/** a PNG's width and height */
const sizeOf = (file: string) => {
  const b = fs.readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

test("neomorph: a slider's thumb drawn at its own size and twice it (name@2x.png), whatever the screen; the other drawings at the screen's", async () => {
  const dir = project();
  const entry = path.join(dir, 'app.jsx');
  const tablet = await compile(entry);
  const phone = await compile(entry, { size: tablet.sizes[0] });
  const thumbs = (xml: string) => [...xml.matchAll(/<indicator [^>]*w="(\d+)" h="(\d+)"[^>]*>([^<]+)<\/indicator>/g)].map((m) => ({ name: m[3], w: +m[1], h: +m[2] }));
  // the 1x file named, the same one at every size: iViewer shows it at its own size (a thumb of 28 and its shadows' 8 round it),
  // the panel at the indicator's w / h - the same
  assert.equal(thumbs(tablet.xml).length, 4);
  assert.deepEqual(thumbs(phone.xml), thumbs(tablet.xml));
  for (const { name, w, h } of thumbs(tablet.xml)) {
    const n = /^neu-thumb-(\d+)x\1-[0-9a-f]{10}\.png$/.exec(name);
    assert.ok(n, name);
    const size = Number(n[1]);
    assert.ok(size === 44 || size === 46, name);
    assert.deepEqual([w, h], [size, size], name);
    assert.deepEqual(sizeOf(path.join(dir, '.neu', name)), [size, size]);
    assert.deepEqual(sizeOf(path.join(dir, '.neu', name.replace(/\.png$/, '@2x.png'))), [2 * size, 2 * size]);
  }
  // a groove (stretched to its element): as sharp as the screen, 2x on the tablet, 3x on the phone
  const groove = (xml: string) => /<img [^>]*>(neu-groove-300x12-[0-9a-f]{10}\.png)<\/img>/.exec(xml)![1];
  assert.deepEqual(sizeOf(path.join(dir, '.neu', groove(tablet.xml))), [600, 24]);
  assert.deepEqual(sizeOf(path.join(dir, '.neu', groove(phone.xml))), [900, 36]);
});

test('neomorph: iva build keeps the drawings it used, the thumbs\' @2x ones too, and deletes the rest', () => {
  const dir = project();
  const drawn = path.join(dir, '.neu');
  fs.mkdirSync(drawn);
  const stale = ['neu-thumb-44x44-0000000000.png', 'neu-thumb-44x44-0000000000@2x.png'];
  for (const f of stale) fs.writeFileSync(path.join(drawn, f), 'old');
  const r = spawnSync(process.execPath, [IVA, 'build', path.join(dir, 'app.jsx'), '-o', path.join(dir, 'dist')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const left = fs.readdirSync(drawn);
  for (const f of stale) assert.ok(!left.includes(f), f);
  // 4 thumbs (the slider's and the fader's, each up and pressed), the same at both sizes: each at 1x and its @2x, nothing else
  const thumbs = left.filter((f) => f.startsWith('neu-thumb-'));
  const ones = thumbs.filter((f) => !f.endsWith('@2x.png'));
  assert.equal(ones.length, 4);
  assert.deepEqual(thumbs.sort(), ones.flatMap((f) => [f, f.replace(/\.png$/, '@2x.png')]).sort());
});

/**
 * A slider's thumb as iViewer draws it: at its image's own size, in GUI units
 * (the <indicator>'s w / h aside - GUI Designer writes them 0), a @2x version
 * on retina screens. So iva draws its thumbs at 1x and 2x whatever the build's
 * scale, ships an image's @2x with it, and says when a thumb file's size
 * isn't the w / h given.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { circle } from '../src/compiler/images.ts';
import { tmpDir } from './tmp.ts';

async function build(jsx: string, files: Record<string, Buffer> = {}, size?: string) {
  const dir = tmpDir('iva-thumbs-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);
  return compile(path.join(dir, 'app.jsx'), { size });
}

const wrap = (body: string) => `export default (
  <Project name="T" width={1024} height={768}>
    <Page name="Main">${body}</Page>
  </Project>
);`;

test("iva's thumbs at 1x and @2x, a phone's @3x build too; what's stretched to its box at 3x", async () => {
  const r = await build(wrap(`
    <Slider w={300} h={28} bg="#333333" thumbColor="#ffffff" />
    <Slider y={60} w={300} h={28} thumb={{ src: draw.box({ w: 20, h: 20, radius: 10, fill: '#ff0000' }), w: 20, h: 20 }} />`), {}, '1400x1400@3x');
  const px = (name: string) => r.assets.find((a) => a.name === name)!.data!.readUInt32BE(16);
  assert.equal(px('sliders/thumb-28-ffffff.png'), 28);
  assert.equal(px('sliders/thumb-28-ffffff@2x.png'), 56);
  assert.equal(px('drawn/box-20x20.png'), 20);
  assert.equal(px('drawn/box-20x20@2x.png'), 40);
  assert.equal(px('sliders/300x28-r14-333333-track.png'), 900);
  assert.ok(!r.assets.some((a) => a.name.startsWith('sliders/300x28') && a.name.includes('@2x')));
  // drawn at its size: no w / h for iViewer to ignore, as GUI Designer writes it
  assert.match(r.xml, /<indicator state="0" offsetX="0" offsetY="0" x="0" y="0" w="0" h="0" t="">sliders\/thumb-28-ffffff\.png<\/indicator>/);
});

test("an image's @2x beside it ships with it", async () => {
  const r = await build(wrap(`<Image w={44} h={44} src="./logo.png" /><Image y={50} w={44} h={44} src="./plain.png" />`), {
    'logo.png': circle(44, '#fff'), 'logo@2x.png': circle(44, '#fff', 2), 'plain.png': circle(44, '#fff'),
  });
  assert.deepEqual(r.assets.map((a) => a.name).sort(), ['logo.png', 'logo@2x.png', 'plain.png']);
});

test("a thumb file whose size isn't its w / h: a warning (iViewer draws it at its own; a @2x one at half)", async () => {
  const r = await build(wrap(`
    <Slider w={300} h={44} thumb={{ src: './knob.png', w: 44, h: 44 }} />
    <Slider y={60} w={300} h={44} thumb={{ src: './big.png', w: 44, h: 44 }} />
    <Slider y={120} w={300} h={44} thumb={{ src: './odd.png', w: 44, h: 44 }} />
    <Slider y={180} w={300} h={44} thumb="./big.png" />`), {
    'knob.png': circle(44, '#fff'), 'knob@2x.png': circle(44, '#fff', 2),
    // painted at a @3x screen's scale
    'big.png': circle(44, '#fff', 3),
    'odd.png': circle(44, '#fff'), 'odd@2x.png': circle(44, '#fff', 3),
  });
  assert.deepEqual(r.assets.map((a) => a.name).sort(), ['big.png', 'knob.png', 'knob@2x.png', 'odd.png', 'odd@2x.png']);
  assert.deepEqual(r.warnings, [
    "app.jsx:5: <Slider>: thumb big.png: iViewer draws a thumb at its image's own size (132x132 px), not at w / h (44x44)",
    "app.jsx:6: <Slider>: thumb odd@2x.png: iViewer draws a thumb at its image's own size (132x132 px, a @2x one at half), not at w / h (44x44)",
  ]);
});

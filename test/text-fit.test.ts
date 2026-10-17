/**
 * A text element with a value too long for any GPU texture (a 64 KB log on
 * a join) draws what its box can show instead of a black box; a text a box
 * might show is drawn whole, as before.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <txt j="1" x="0" y="0" w="200" h="100" t="t" wrap="True" l="0"></txt>
      <txt j="2" x="0" y="100" w="200" h="40" t="t" wrap="False" l="0"></txt>
      <btn j="4" x="0" y="150" w="80" h="40" t="b" flip="None" sim="1" l="0" s="3"><inactive s="3">A</inactive><active s="3">A</active></btn>
    </landscape>
  </page>`;

/** the Pixi text in an element's container */
const drawn = (renderer: any, join: string): string => {
  const find = (c: any): any => (typeof c.text === 'string' ? c : (c.children ?? []).map(find).find(Boolean));
  return find(renderer.nodesMap[join][0]).text;
};

test('a value past any texture: the lines a wrapped box twice as high shows; a short value untouched', async () => {
  const { CF, renderer } = await runGui(GUI);
  CF.setJoin('s1', 'hello\nthere');
  assert.equal(drawn(renderer, 's1'), 'hello\nthere');
  // 64 KB, as the Matter probe writes
  let log = '';
  for (let n = 0; n < 64 * 1024; n++) log += String.fromCharCode(48 + ((n * 7) % 74)) + (n % 40 === 39 ? ' ' : '');
  CF.setJoin('s1', log);
  const text = drawn(renderer, 's1');
  assert.ok(text.length > 100 && text.length < 2000, `cut to what the box can show: ${text.length} chars`);
  assert.ok(log.startsWith(text.split('\n')[0]), 'from the start of the value');
  const lines = text.split('\n');
  // the stand-in canvas: a glyph 7 px wide, lines 13 px high: a 100 px box shows 7, twice that is kept
  assert.ok(lines.length <= 16, `${lines.length} lines`);
  assert.ok(lines.every((l) => l.length * 7 <= 200), 'each line within the box, as wrapped');
});

test('one line, not wrapped: cut where it would pass the texture limit (4096 px); a button label too', async () => {
  const { CF, renderer } = await runGui(GUI);
  CF.setJoin('s2', 'a title wider than its box but not than a texture');
  assert.equal(drawn(renderer, 's2'), 'a title wider than its box but not than a texture');
  CF.setJoin('s2', 'x'.repeat(20000));
  const text = drawn(renderer, 's2');
  assert.ok(text.length * 7 <= 4096, `${text.length} chars at 7 px`);
  assert.ok(text.length > 200, 'well past the box, as a long line is clipped by its box not cut short');
  CF.setJoin('s3', 'y'.repeat(20000));
  const label = drawn(renderer, 'd4');
  assert.ok(label.length * 7 <= 4096 && label.length > 50, `${label.length} chars`);
});

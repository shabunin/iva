/**
 * CF.setProperties w / h: the element made again at that size (its bounds,
 * its text laid out there), with its scale as scale / xscale / yscale say -
 * not scaled to the size, which stretched its text and children.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui, answer } from './gui-runtime.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <txt j="1" x="10" y="20" w="100" h="30" t="t" wrap="True" l="0">Hello world, and a few more words</txt>
      <btn j="1" x="200" y="20" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">A</inactive><active s="0">A</active></btn>
      <subpage name="Card" x="300" y="20" j="30" transition1="" subtype1="" time1="0" ease1="" transition2="" subtype2="" time2="0" ease2="" clickthrough="0" topmost="0" v="1" l="0" />
    </landscape>
  </page>
  <page name="Other" j="11" transition="" subtype="" time="0" ease=""><portrait /><landscape><txt j="60" x="0" y="0" w="50" h="20" t="t" wrap="False" l="0">elsewhere</txt></landscape></page>
  <subpage name="Card" w="80" h="60"><txt j="50" x="0" y="0" w="80" h="20" t="t" wrap="False" l="0" /></subpage>`;

/** the element on a join as it is now (made anew, the old one is gone) */
const el = (renderer: any, join: string) => renderer.nodesMap[join].filter((c: any) => !c.destroyed).at(-1);
const props = async (CF: any, join: string) => (await answer<[any]>((cb) => CF.getProperties(join, cb)))[0];

test('setProperties w / h: the element made again at that size, its scale its own', async () => {
  const { CF, renderer } = await runGui(GUI);
  const before = el(renderer, 'd1');
  CF.setProperties({ join: 'd1', scale: 2 });
  CF.setProperties({ join: 'd1', w: 160, h: 80 });
  const btn = el(renderer, 'd1');
  assert.notEqual(btn, before, 'made anew');
  assert.equal(before.destroyed, true);
  assert.deepEqual([btn.cfNode.w, btn.cfNode.h], [160, 80]);
  assert.deepEqual([btn.hitArea.width, btn.hitArea.height], [160, 80], 'its bounds at the new size');
  assert.deepEqual([btn.scale.x, btn.scale.y], [2, 2], 'its scale as set, not the size scaled to');
  assert.equal(btn.x, 200 + 160 / 2, 'in the same place (pivot at its centre)');
  const p = await props(CF, 'd1');
  assert.deepEqual([p.w, p.h, p.scale], [160, 80, 2]);
  // a text: laid out at the new width
  CF.setProperties({ join: 's1', w: 240 });
  const txt = el(renderer, 's1').children.find((c: any) => c.style);
  assert.equal(txt.style.wordWrapWidth, 240);
  assert.equal(el(renderer, 's1').scale.x, 1);
  // a subpage: its frame at the new size
  CF.setProperties({ join: 'd30', w: 160, h: 120 });
  assert.deepEqual([el(renderer, 'd30').hitArea.width, el(renderer, 'd30').hitArea.height], [160, 120]);
  // the size stays through a flip away and back
  renderer.navigate('Other');
  renderer.navigate('Main');
  assert.deepEqual([el(renderer, 'd1').cfNode.w, el(renderer, 'd1').hitArea.width, el(renderer, 'd1').scale.x], [160, 160, 2]);
  assert.equal(el(renderer, 's1').children.find((c: any) => c.style).style.wordWrapWidth, 240);
});

test('setProperties w / h animated: drawn growing to the size meanwhile, made at it at the end, its scale its own again', async () => {
  const { CF, renderer } = await runGui(GUI);
  const old = el(renderer, 'd1');
  CF.setProperties({ join: 'd1', w: 160 }, 0, 0.05);
  await new Promise((r) => setTimeout(r, 400));
  const btn = el(renderer, 'd1');
  assert.notEqual(btn, old);
  assert.deepEqual([btn.cfNode.w, btn.hitArea.width, btn.scale.x, btn.scale.y], [160, 160, 1, 1]);
});

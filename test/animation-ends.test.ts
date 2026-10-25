/**
 * An animation let go however it ends - run its course, stopped, or cut
 * short by a newer animation of a value (motion's `finished` never comes for
 * those): a value animated on each feedback keeps none. A size animated
 * (CF.setProperties w / h) is made all the same when its scale, standing in
 * for the size meanwhile, is animated before it's there.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
import { killTweensOf, trackedForTest } from '../src/runtime/cf/renderer.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <txt j="1" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">level</txt>
      <btn j="1" x="200" y="20" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">A</inactive><active s="0">A</active></btn>
    </landscape>
  </page>`;

const el = (renderer: any, join: string) => renderer.nodesMap[join].filter((c: any) => !c.destroyed).at(-1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('animations cut short by newer ones of their values, or stopped, are let go', async () => {
  const { CF, renderer } = await runGui(GUI);
  const before = trackedForTest();
  // a meter driven by feedback: each change cuts the last one short
  for (let i = 1; i <= 5; i++) {
    CF.setProperties({ join: 's1', x: 10 * i }, 0, 2);
    await sleep(40);
  }
  assert.equal(trackedForTest() - before, 1, 'the one still going');
  // one of its values taken over (x), the other (y) run its course
  CF.setProperties({ join: 's1', x: 0, y: 0 }, 0, 0.2);
  await sleep(40);
  CF.setProperties({ join: 's1', x: 60 }, 0, 0.2);
  await sleep(400);
  assert.equal(trackedForTest() - before, 0);
  assert.equal(el(renderer, 's1').x - el(renderer, 's1').pivot.x, 60);
  // stopped
  CF.setProperties({ join: 's1', opacity: 0.5 }, 0, 1);
  killTweensOf(el(renderer, 's1'));
  await sleep(0);
  assert.equal(trackedForTest() - before, 0);
});

test('w / h animated, its scale animated before it is there: made at that size all the same, at that scale', async () => {
  const { CF, renderer } = await runGui(GUI);
  CF.setProperties({ join: 'd1', w: 160 }, 0, 0.5);
  await sleep(100);
  CF.setProperties({ join: 'd1', scale: 1.1 }, 0, 0.2);
  await sleep(700);
  const btn = el(renderer, 'd1');
  assert.deepEqual([btn.cfNode.w, btn.hitArea.width], [160, 160]);
  assert.deepEqual([btn.scale.x, btn.scale.y], [1.1, 1.1]);
});

test('w / h animated again before it is there: the later size grows on, made at the end', async () => {
  const { CF, renderer } = await runGui(GUI);
  CF.setProperties({ join: 'd1', w: 160 }, 0, 0.3);
  await sleep(100);
  const growing = el(renderer, 'd1');
  CF.setProperties({ join: 'd1', w: 240 }, 0, 1);
  await sleep(50);
  assert.equal(el(renderer, 'd1'), growing, 'not made at once: growing to it');
  await sleep(1400);
  assert.deepEqual([el(renderer, 'd1').cfNode.w, el(renderer, 'd1').scale.x], [240, 1]);
});

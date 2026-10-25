/**
 * The device asking for reduced motion (prefers-reduced-motion: Android's
 * Remove animations, Reduce Motion on iPad): the GUI's animations run as it
 * gives them all the same - motion would put x, y and scale at their ends at
 * once, dropping what it's told of each value (its end, its delay) - and are
 * let go as they end: a size animated is made at it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
// (after the runtime's frames: motion takes them as it's loaded)
import { hasReducedMotionListener, prefersReducedMotion } from 'motion';
import { trackedForTest } from '../src/runtime/cf/renderer.ts';

// as motion reads it off the device (matchMedia), before anything is animated
hasReducedMotionListener.current = true;
prefersReducedMotion.current = true;

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

test('reduced motion asked for: x, y and scale animated as given, let go at their end; a size animated made at it', async () => {
  const { CF, renderer } = await runGui(GUI);
  const before = trackedForTest();
  CF.setProperties({ join: 'd1', w: 160 }, 0, 0.3);
  CF.setProperties({ join: 's1', x: 50, y: 40, opacity: 0.5 }, 0, 1);
  CF.setProperties({ join: 's1', scale: 1.5 }, 0, 1);
  await sleep(40);
  const txt = el(renderer, 's1');
  assert.ok(txt.x - txt.pivot.x < 50, `x on its way, not at its end at once (${txt.x - txt.pivot.x})`);
  await sleep(1500);
  const btn = el(renderer, 'd1');
  assert.deepEqual([btn.cfNode.w, btn.hitArea.width, btn.scale.x, btn.scale.y], [160, 160, 1, 1]);
  assert.deepEqual([txt.x - txt.pivot.x, txt.y - txt.pivot.y, txt.alpha, txt.scale.x], [50, 40, 0.5, 1.5]);
  assert.equal(trackedForTest() - before, 0);
});

/**
 * CF.listAdd builds only the rows near what the list shows: a long
 * playlist filled (cleared and added again, or a row at a time) doesn't
 * make every row's subpage to throw most away in the same call.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <list j="5" x="0" y="0" w="400" h="300" t="" headerSub="" titleSub="" contentSub="Row" footerSub="" orientation="v" l="0" swipedelete="0" />
    </landscape>
  </page>
  <subpage name="Row" w="400" h="50"><txt j="73" x="0" y="0" w="100" h="20" t="t" wrap="False" l="0" /></subpage>`;

/** the GUI, and how many row subpages it has built */
async function list() {
  const { CF, renderer } = await runGui(GUI);
  let built = 0;
  const create = renderer.createSubpage.bind(renderer);
  renderer.createSubpage = ((...a: Parameters<typeof create>) => (built++, create(...a))) as typeof create;
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ s73: `Track ${i + 1}` }));
  return { CF, renderer, items, built: () => built };
}

// the list is 300 high, its rows 50: what shows and two screens after it is 18 rows (19 with the one at the edge)
const NEAR = 19;

test('a list cleared and filled with 500 rows builds the rows near what shows, not 500', async () => {
  const l = await list();
  l.CF.listAdd('l5', l.items(20));
  const before = l.built();
  l.CF.listRemove('l5');
  l.CF.listAdd('l5', l.items(500));
  assert.ok(l.built() - before <= NEAR, `${l.built() - before} rows built`);
  assert.equal(l.CF.listsStore.l5.length, 500);
});

test('500 rows added one at a time build the rows near what shows', async () => {
  const l = await list();
  for (const item of l.items(500)) l.CF.listAdd('l5', [item]);
  assert.ok(l.built() <= NEAR, `${l.built()} rows built`);
});

/**
 * PageFlipEvent (and OrientationChangeEvent) told once the page is there -
 * its elements, their joins, its lists, its flip begun: what a script does
 * then (a flip of its own, an element slid in, a list scrolled) is done to
 * it. A host that shows the page again as it turns to it: made once.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape><txt j="1" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">main</txt></landscape>
  </page>
  <page name="Secret" j="11" transition="" subtype="" time="0" ease="">
    <portrait />
    <landscape>
      <txt j="2" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">secret</txt>
      <txt j="3" x="10" y="60" w="100" h="30" t="t" wrap="False" l="0" />
      <list j="1" x="10" y="100" w="180" h="50" t="" headerSub="" titleSub="" contentSub="Row" footerSub="" orientation="v" l="0" swipedelete="0" />
    </landscape>
  </page>
  <page name="Login" j="12" transition="" subtype="" time="0" ease="">
    <portrait />
    <landscape><txt j="4" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">login</txt></landscape>
  </page>
  <page name="Tall" j="13" transition="" subtype="" time="0" ease="">
    <portrait><txt j="5" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">tall</txt></portrait>
    <landscape />
  </page>
  <subpage name="Row" w="180" h="25"><txt j="1" x="0" y="0" w="180" h="25" t="t" wrap="False" l="0" /></subpage>`;

const live = (list: any[] | undefined) => (list ?? []).filter((c: any) => !c.destroyed);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("PageFlipEvent: the page there as it's told - its elements on their joins; a flip from it (a login guard) shows that page, as CF.currentPage says", async () => {
  const { CF, renderer, app } = await runGui(GUI);
  let seen: number | undefined;
  CF.watch(CF.PageFlipEvent, (_from: string | null, to: string) => {
    if (to !== 'Secret') return;
    seen = live(renderer.nodesMap.s2).length;
    CF.flipToPage('Login');
  });
  CF.flipToPage('Secret');
  assert.equal(seen, 1, "the page's elements there for the script");
  assert.equal(CF.currentPage, 'Login');
  assert.equal(renderer.currentPageName, 'Login');
  assert.deepEqual(app.stage.children, [renderer.currentContainer], 'one page on the stage');
  assert.equal(live(renderer.nodesMap.s4)[0]?.parent, renderer.currentContainer, "Login's on it");
  assert.deepEqual(Object.keys(renderer.nodesMap), ['s4'], 'no joins of the page flipped from');
  assert.deepEqual(renderer.pageHistory, ['Main', 'Secret']);
});

test('PageFlipEvent: a flip from it (a login guard) - the watchers after it told of that flip only, not of the one it turned away', async () => {
  const { CF } = await runGui(GUI);
  CF.watch(CF.PageFlipEvent, (_from: string | null, to: string) => {
    if (to === 'Secret') CF.flipToPage('Login');
  });
  // the panel's own, watching last: the page it says is shown
  const told: unknown[][] = [];
  CF.watch(CF.PageFlipEvent, (...a: unknown[]) => told.push(a));
  told.length = 0;
  CF.flipToPage('Secret');
  assert.deepEqual(told, [['Secret', 'Login', CF.currentOrientation]]);
});

test('PageFlipEvent: an element slid in from it animates; a list scrolled from it scrolls', async () => {
  const { CF, renderer } = await runGui(GUI);
  CF.listAdd('l1', ['a', 'b', 'c', 'd', 'e', 'f'].map((s1) => ({ s1 })));
  CF.watch(CF.PageFlipEvent, (_from: string | null, to: string) => {
    if (to !== 'Secret') return;
    CF.setProperties({ join: 's2', x: -200 });
    CF.setProperties({ join: 's2', x: 100 }, 0, 0.3);
    CF.listScroll('l1', 2, CF.TopPosition, false);
  });
  CF.flipToPage('Secret');
  const box = live(renderer.nodesMap.l1)[0].children.find((k: any) => k.scrollY !== undefined);
  assert.equal(box.scrollY, -50, 'at its third row');
  const x = () => {
    const el = live(renderer.nodesMap.s2)[0];
    return el.x - el.pivot.x;
  };
  assert.equal(x(), -200, 'where it starts from, not put at its end at once');
  await sleep(700);
  assert.equal(x(), 100);
});

test('a page with nothing in the orientation shown, the host turning to the other and showing it again itself (the preview): made once, told once', async () => {
  const { CF, renderer } = await runGui(GUI);
  renderer.onOrientationChange = (o) => renderer.navigate(renderer.currentPageName!, o);
  let made = 0;
  const createNode = renderer.createNode.bind(renderer);
  renderer.createNode = (...a: Parameters<typeof createNode>) => (made++, createNode(...a));
  const told: unknown[][] = [];
  CF.watch(CF.PageFlipEvent, (...a: unknown[]) => told.push(a));
  CF.watch(CF.OrientationChangeEvent, (...a: unknown[]) => told.push(a));
  renderer.navigate('Tall');
  assert.equal(made, 1);
  assert.deepEqual(told, [['Main', 'Tall', CF.PortraitOrientation]]);
  assert.equal(live(renderer.nodesMap.s5).length, 1);
});

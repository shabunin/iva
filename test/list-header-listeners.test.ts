/**
 * A list's header and footer are rows as its items are: their objects'
 * join listeners go with them - a page's ui.ScrollArea (a joinless list,
 * the page's content its header) flipped to and from, a list cleared and
 * filled again, leave none behind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <list j="0" x="0" y="0" w="400" h="150" t="" headerSub="Area" titleSub="" contentSub="" footerSub="Foot" orientation="v" l="0" swipedelete="0" />
      <list j="3" x="0" y="150" w="400" h="150" t="" headerSub="Head" titleSub="" contentSub="Row" footerSub="" orientation="v" l="0" swipedelete="0" />
    </landscape>
  </page>
  <page name="Other" j="11" transition="" subtype="" time="0" ease="">
    <portrait />
    <landscape><txt j="60" x="0" y="0" w="50" h="20" t="t" wrap="False" l="0">elsewhere</txt></landscape>
  </page>
  <subpage name="Area" w="400" h="300">
    <txt j="70" x="0" y="0" w="100" h="20" t="t" wrap="False" l="0" />
    <btn j="5" x="0" y="30" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">A</inactive><active s="0">A</active></btn>
  </subpage>
  <subpage name="Foot" w="400" h="40"><txt j="71" x="0" y="0" w="100" h="20" t="t" wrap="False" l="0" /></subpage>
  <subpage name="Head" w="400" h="40"><txt j="72" x="0" y="0" w="100" h="20" t="t" wrap="False" l="0" /></subpage>
  <subpage name="Row" w="400" h="40"><txt j="73" x="0" y="0" w="100" h="20" t="t" wrap="False" l="0" /></subpage>`;

const listeners = (key: string) => (joinStore as any).listeners.get(key)?.size ?? 0;
const keys = ['s70', 'd5', 's71', 'l3:-1:s72'];

test("a joinless list's header and footer (a page's ScrollArea): their listeners go with the page - flipped to and from 20 times, one each", async () => {
  const { renderer } = await runGui(GUI);
  assert.deepEqual(keys.map(listeners), [1, 1, 1, 1]);
  for (let i = 0; i < 20; i++) {
    renderer.navigate('Other');
    renderer.navigate('Main');
  }
  assert.deepEqual(keys.map(listeners), [1, 1, 1, 1]);
  renderer.navigate('Other');
  assert.deepEqual(keys.map(listeners), [0, 0, 0, 0]);
});

test("a joined list's header: cleared and filled again (all of it again), one listener still", async () => {
  const { CF } = await runGui(GUI);
  for (let i = 0; i < 5; i++) {
    CF.listAdd('l3', [{}, {}]);
    CF.listRemove('l3');
  }
  assert.equal(listeners('l3:-1:s72'), 1);
});

const PICS = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <list j="4" x="0" y="0" w="400" h="300" t="" headerSub="" titleSub="" contentSub="Pic" footerSub="" orientation="v" l="0" swipedelete="0" />
    </landscape>
  </page>
  <subpage name="Pic" w="400" h="40">
    <img x="0" y="0" w="40" h="40">icons/late.png</img>
    <txt j="74" x="50" y="0" w="100" h="20" t="t" wrap="False" l="0" />
  </subpage>`;

test("a list's rows made once their images are in (a moment later): their listeners still go with the rows - removed, none left", async () => {
  const { CF, renderer } = await runGui(PICS);
  // the row's image known and a moment late, as from a server
  (renderer as any).aliasOf = (ref: string) => ref;
  (renderer as any).ensureLoaded = () => new Promise((r) => setTimeout(r, 10));
  const rowKeys = () => [...(joinStore as any).listeners.keys()].filter((k: string) => /^l4:\d+:s74$/.test(k));
  CF.listAdd('l4', [{}, {}, {}]);
  await new Promise((r) => setTimeout(r, 60));
  assert.ok(rowKeys().map(listeners).reduce((a, b) => a + b, 0) >= 3, 'the rows were made');
  CF.listRemove('l4');
  assert.deepEqual(rowKeys().map(listeners).filter(Boolean), []);
});

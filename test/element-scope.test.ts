/**
 * An element's listeners in a scope of its own while it's made: one that
 * fails to be made leaves the scope as it was - what's made after it
 * listens in the page's, gone with the page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape><txt j="1" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">Hello</txt></landscape>
  </page>`;

test("an element that fails to be made: the scope the page's again", async () => {
  const { renderer } = await runGui(GUI);
  const scope = renderer.currentScope;
  // a timer without its attributes: its render throws
  assert.throws(() => renderer.createNode({ type: 'timer', j: '0', x: 0, y: 0, w: 0, h: 0, children: [] } as any));
  assert.equal(renderer.currentScope, scope);
});

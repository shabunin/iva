/**
 * A button's text as iViewer keeps it: every character of its state's text,
 * newlines too, a line each - blank ones as well - the block placed by its
 * theme (in the middle). GUI Designer's "\n\nUNLOCK" before the icon puts
 * UNLOCK under it; an icon on a line of its own after the text (an older iva
 * build's: "Share\n        \n      ") puts Share a line above the middle.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasTextMetrics, Text } from 'pixi.js';
import { runGui } from './gui-runtime.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <btn j="4" x="0" y="0" w="90" h="70" t="b" flip="None" sim="1" l="0"><inactive s="0">

UNLOCK<img x="20" y="0" w="52" h="52">unlock.png</img></inactive><active s="0">

OPEN<img x="20" y="0" w="52" h="52">unlock.png</img></active></btn>
      <btn j="5" x="100" y="0" w="90" h="70" t="b" flip="None" sim="1" l="0">
        <inactive s="0">Share
          <img x="20" y="0" w="24" h="24">share.png</img>
        </inactive>
        <active s="0">Share
          <img x="20" y="0" w="24" h="24">share.png</img>
        </active>
      </btn>
      <btn j="6" x="200" y="0" w="90" h="70" t="b" flip="None" sim="1" l="0">
        <inactive s="0">
          <img x="20" y="0" w="24" h="24">power.png</img>
        </inactive>
        <active s="0">
          <img x="20" y="0" w="24" h="24">power.png</img>
        </active>
      </btn>
    </landscape>
  </page>`;

/** the button's text: the Pixi text, its lines as laid out */
const label = (renderer: any, join: string) => {
  const text = renderer.nodesMap[join][0].children[0].children.find((c: unknown) => c instanceof Text) as Text;
  return { text, lines: CanvasTextMetrics.measureText(text.text, text.style).lines.map((l) => l.replace(/\u200B/g, '').trim()) };
};

test("a button's text keeps its every line, blank ones too, the block in the middle (as iViewer has it)", async () => {
  const { renderer, project } = await runGui(GUI);
  const [unlock, share] = project.pages.Main.landscape!;
  assert.equal(unlock.inactiveText, '\n\nUNLOCK');
  assert.equal(share.inactiveText, 'Share\n          \n        ');
  // UNLOCK two lines down: under the icon
  const u = label(renderer, 'd4');
  assert.deepEqual(u.lines, ['', '', 'UNLOCK']);
  assert.deepEqual([u.text.anchor.x, u.text.anchor.y, u.text.x, u.text.y], [0.5, 0.5, 45, 35]);
  // Share, then two blank lines (the last one too, which Pixi's wrap would drop): Share a line above the middle
  assert.deepEqual(label(renderer, 'd5').lines, ['Share', '', '']);
  // the indent around a state's icon (GUI Designer's): no text
  assert.equal(label(renderer, 'd6').text.text, '');
  // the active state's the same way
  joinStore.set('4', 'd', true);
  assert.deepEqual(label(renderer, 'd4').lines, ['', '', 'OPEN']);
});

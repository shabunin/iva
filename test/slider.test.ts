/**
 * A slider's press join (d): high while a finger is on it, as iViewer has it
 * - the parser keeps the attribute, the renderer resolves it in a list row.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <slider j="1" d="20" x="10" y="150" w="180" h="16" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0" />
    </landscape>
  </page>`;

test("a slider's d join is high while it is dragged, low once let go; the parser keeps d", async () => {
  const { CF, renderer, project } = await runGui(GUI);
  assert.equal(project.pages.Main.landscape![0].d, '20');
  const slider = renderer.nodesMap['a1'][0].children.find((c: any) => c.eventMode === 'dynamic')!;
  const pressed: boolean[] = [];
  CF.watch(CF.JoinChangeEvent, 'd20', (_j: string, v: string) => pressed.push(v === '1'));
  assert.equal(joinStore.get('20', 'd'), false);
  slider.emit('pointerdown', { global: { x: 100, y: 158 }, stopPropagation() {} } as any);
  assert.equal(joinStore.get('20', 'd'), true);
  assert.ok((joinStore.get('1', 'a') as number) > 0, 'the drag moved it');
  slider.emit('pointerup', {} as any);
  assert.equal(joinStore.get('20', 'd'), false);
  // (JoinChangeEvent reaches a watcher once the script has moved on)
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(pressed, [true, false]);
});

test("in a list row, a slider's d join is the row's (l1:0:d20)", async () => {
  const { renderer } = await runGui(GUI);
  const node = { ...project0(renderer), j: '1', d: '20' };
  const made = (renderer.createNode(node, 'l1', 0) as any).cfNode;
  assert.deepEqual([made.j, made.d], ['l1:0:1', 'l1:0:20']);
});

const project0 = (renderer: any) => renderer.project.pages.Main.landscape[0];

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

test("a slider's thumb is its image at the image's own size, as iViewer draws it: an indicator's w / h aside; a sheet's frame the same", async () => {
  const { Assets, Rectangle, Texture, TextureSource } = await import('pixi.js');
  // a thumb painted at 3x (132 px for a 44 unit thumb), a file of its own; another a frame of a sheet (the panel's atlas)
  Assets.cache.set('thumb.png', new Texture({ source: new TextureSource({ width: 132, height: 132 }) }));
  Assets.cache.set('knob.png', new Texture({ source: new TextureSource({ width: 256, height: 256 }), frame: new Rectangle(2, 2, 30, 20) }));
  try {
    const { renderer } = await runGui(`
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <slider j="1" x="10" y="100" w="180" h="44" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0">
        <indicator state="0" offsetX="0" offsetY="0" x="0" y="0" w="44" h="44" t="">thumb.png</indicator>
        <indicator state="1" offsetX="0" offsetY="0" zoom="100" />
      </slider>
      <slider j="2" x="10" y="200" w="180" h="44" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0">
        <indicator state="0" offsetX="0" offsetY="0" x="0" y="0" w="0" h="0" t="">knob.png</indicator>
      </slider>
    </landscape>
  </page>`);
    /** the thumb as drawn: the image in the container that moves with the value */
    const thumb = (join: string) => {
      const slider = renderer.nodesMap[join][0].children.find((c: any) => c.eventMode === 'dynamic')!;
      return (slider.children.at(-1) as any).children[0];
    };
    const t = thumb('a1');
    assert.deepEqual([t.width, t.height], [132, 132]);
    assert.deepEqual([t.x, t.y], [-66, -66], 'centred on the value');
    const k = thumb('a2');
    assert.deepEqual([k.width, k.height, k.x, k.y], [30, 20, -15, -10]);
  } finally {
    Assets.cache.remove('thumb.png');
    Assets.cache.remove('knob.png');
  }
});

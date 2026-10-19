import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture } from 'pixi.js';
import { stageChanged } from '../src/runtime/cf/renderer.ts';

/**
 * What drawing a frame does to Pixi's bookkeeping (RenderGroupSystem,
 * updateRenderGroupTransforms): the structure built, the containers whose
 * transform or view changed taken off their lists.
 */
function drawn(stage: Container) {
  const g = (stage as any).renderGroup;
  // the structure built again: every view collected, its change taken in
  if (g.structureDidChange) {
    const walk = (c: any) => {
      c.didViewUpdate = false;
      c.children.forEach(walk);
    };
    walk(stage);
  }
  g.structureDidChange = false;
  for (const k in g.childrenToUpdate) {
    const l = g.childrenToUpdate[k];
    for (let i = 0; i < l.index; i++) l.list[i].didChange = false;
    l.index = 0;
  }
  const r = g.childrenRenderablesToUpdate;
  for (let i = 0; i < r.index; i++) r.list[i].didViewUpdate = false;
  r.index = 0;
}

test('a frame is drawn only when the stage changed - a child added or gone, moved, faded, hidden, its texture changed - and not when nothing did', () => {
  const stage = new Container();
  stage.enableRenderGroup();
  const page = new Container();
  const sprite = new Sprite(Texture.WHITE);
  page.addChild(sprite);
  stage.addChild(page);
  assert.equal(stageChanged(stage), true, 'not drawn yet');
  drawn(stage);
  assert.equal(stageChanged(stage), false, 'drawn, nothing since');
  page.x = 10;
  assert.equal(stageChanged(stage), true, 'moved');
  drawn(stage);
  assert.equal(stageChanged(stage), false);
  page.x = 10;
  assert.equal(stageChanged(stage), false, 'set to what it was: no change');
  sprite.alpha = 0.5;
  assert.equal(stageChanged(stage), true, 'faded');
  drawn(stage);
  sprite.visible = false;
  assert.equal(stageChanged(stage), true, 'hidden');
  drawn(stage);
  sprite.visible = true;
  drawn(stage);
  sprite.texture = Texture.EMPTY;
  assert.equal(stageChanged(stage), true, 'another texture');
  drawn(stage);
  page.addChild(new Container());
  assert.equal(stageChanged(stage), true, 'a child added');
  drawn(stage);
  page.removeChildAt(1);
  assert.equal(stageChanged(stage), true, 'a child gone');
  drawn(stage);
  // a child of a child, deep down
  const deep = new Container();
  const inner = new Container();
  inner.addChild(deep);
  page.addChild(inner);
  drawn(stage);
  deep.scale.set(2);
  assert.equal(stageChanged(stage), true, 'scaled, deep down');
  drawn(stage);
  assert.equal(stageChanged(stage), false);
  // a stage never drawn (no render group yet): drawn
  assert.equal(stageChanged(new Container()), true);
});

test("a texture's pixels changed in place (a video's next frame, a canvas drawn on): drawn, though no container changed", async () => {
  const { TextureSource } = await import('pixi.js');
  const { setRenderOnDemandForTest } = await import('../src/runtime/cf/renderer.ts').then((m) => ({ setRenderOnDemandForTest: m.drewSourcesForTest }));
  const stage = new Container();
  stage.enableRenderGroup();
  stage.addChild(new Sprite(Texture.WHITE));
  drawn(stage);
  setRenderOnDemandForTest();
  assert.equal(stageChanged(stage), false);
  new TextureSource({ width: 4, height: 4 }).update();
  assert.equal(stageChanged(stage), true);
  setRenderOnDemandForTest();
  assert.equal(stageChanged(stage), false);
});

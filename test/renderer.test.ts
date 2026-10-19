import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Assets, Texture } from 'pixi.js';
import { CFRenderer } from '../src/runtime/cf/renderer.ts';

test("an image the .gui names with GUI Designer's backslashes: found where it was loaded", () => {
  Assets.cache.set('computer&mobile-32/icon-volume-down.png', Texture.WHITE);
  Assets.cache.set('Lamp0.png', Texture.WHITE);
  const r = Object.assign(Object.create(CFRenderer.prototype), {
    imageMap: { 'computer&mobile-32/icon-volume-down.png': 'blob:a', 'icon-volume-down.png': 'blob:a', 'Lamp0.png': 'blob:b' },
  }) as CFRenderer;
  assert.equal(r.assetKey('computer&mobile-32\\icon-volume-down.png'), 'computer&mobile-32/icon-volume-down.png');
  assert.equal(r.texture('computer&mobile-32\\icon-volume-down.png'), Texture.WHITE);
  // by file name, any case
  assert.equal(r.assetKey('White\\lamp0.PNG'), 'Lamp0.png');
  assert.equal(r.assetKey('nowhere.png'), undefined);
});

test("a page's images, loaded as it's about to show: its objects', its themes' (every state), its runtime themes' - not its subpages' (they load their own)", () => {
  const css = (url: string) => ({ 'background-image': `url(${url})` });
  const r = Object.assign(Object.create(CFRenderer.prototype), {
    imageMap: { 'buttons/a.png': 'blob:1', 'a.png': 'blob:1', 'buttons/a-down.png': 'blob:2', 'icons/lamp.png': 'blob:3', 'bg/home.png': 'blob:4', 'bg/sub.png': 'blob:5', 'buttons/b-light.png': 'blob:6' },
    themeOf: {},
    project: {
      themes: {
        btn: { states: { '0': css('buttons/a.png'), '1': css("'buttons/a-down.png'") } },
        home: { states: { '0': css('bg/home.png') } },
        sub: { states: { '0': css('bg/sub.png') } },
        'btn-light': { states: { '0': css('buttons/b-light.png') } },
      },
      subpages: {},
      pages: {
        Home: {
          landscapeTheme: 'home',
          landscape: [
            { type: 'btn', t: 'btn', attributes: {}, children: [{ type: 'inactive', attributes: {}, children: [{ type: 'img', text: 'icons\\Lamp.PNG', attributes: {}, children: [] }] }] },
            { type: 'subpage', name: 'Menu', attributes: {}, children: [] },
          ],
        },
      },
    },
  }) as any;
  assert.deepEqual([...r.pageImages('Home')].sort(), ['bg/home.png', 'buttons/a-down.png', 'buttons/a.png', 'icons/lamp.png']);
  // a look switched at runtime (CF.setProperties theme): its drawings too, on any page made after
  r.themeOf['d5'] = 'btn-light';
  assert.ok(r.pageImages('Home').has('buttons/b-light.png'));
  // a subpage's: its own nodes and theme
  assert.deepEqual([...r.imagesOf([], ['sub'])], ['bg/sub.png']);
});

test('images nothing shows are let go, but for the latest used (up to the budget) and any used a moment ago', async () => {
  const { Container, Sprite, TextureSource } = await import('pixi.js');
  const tex = (px: number) => new Texture({ source: new TextureSource({ width: px, height: px }) });
  const shown = tex(10), back = tex(1000), old = tex(1000), recent = tex(1000);
  for (const [k, t] of Object.entries({ shown, back, old, recent })) Assets.cache.set(`lazy-${k}.png`, t);
  const stage = new Container();
  stage.addChild(new Container()).addChild(new Sprite(shown));
  const now = performance.now();
  const r = Object.assign(Object.create(CFRenderer.prototype), { app: { stage }, textureBudget: 5e6 }) as any;
  r.lastUsed = new Map([['lazy-shown.png', now - 60000], ['lazy-back.png', now - 20000], ['lazy-old.png', now - 40000], ['lazy-recent.png', now - 1000]]);
  const unload = Assets.unload;
  const unloaded: string[] = [];
  (Assets as any).unload = async (keys: string[]) => void unloaded.push(...keys);
  try {
    r.collect();
  } finally {
    (Assets as any).unload = unload;
  }
  // 4 MB each: the one used a second ago kept anyway, the page before within the budget, the older one let go
  assert.deepEqual(unloaded, ['lazy-old.png']);
  assert.ok(r.lastUsed.get('lazy-shown.png') > now - 1000, 'on the stage: seen in use now');
  for (const k of ['shown', 'back', 'old', 'recent']) Assets.cache.remove(`lazy-${k}.png`);
});

test("in a list item, a button's text joins are the item's own (each item its s1), as its join is", () => {
  const r = Object.assign(Object.create(CFRenderer.prototype), {
    imageMap: {}, themeOf: {}, tagsMap: {}, nodesMap: {}, project: { subpages: {}, themes: {} }, debugMode: false,
  }) as CFRenderer;
  // the item template's element as the parser gives it: <btn j="1"><inactive s="1">..</inactive><active s="2">..</active></btn>
  const node = { type: 'state-joins', x: 0, y: 0, w: 300, h: 72, j: '1', inactive_s: '1', active_s: '2', attributes: {}, children: [] } as any;
  const made = (r.createNode(node, 'l10', 3) as any).cfNode;
  assert.equal(made.j, 'l10:3:1');
  assert.equal(made.inactive_s, 'l10:3:1');
  assert.equal(made.active_s, 'l10:3:2');
  // outside a list: as written
  const page = (r.createNode(node) as any).cfNode;
  assert.deepEqual([page.j, page.inactive_s, page.active_s], ['1', '1', '2']);
});

test("CF.setProperties' curves: CF's constants (ANIMATION_CURVE_EASE_IN ...) and plain names", async () => {
  const { easeOf } = await import('../src/runtime/cf/renderer.ts');
  assert.equal(easeOf('ANIMATION_CURVE_EASE_IN'), 'easeIn');
  assert.equal(easeOf('ANIMATION_CURVE_EASE_OUT'), 'easeOut');
  assert.equal(easeOf('ANIMATION_CURVE_EASE_IN_OUT'), 'easeInOut');
  assert.equal(easeOf('ANIMATION_CURVE_LINEAR'), 'linear');
  assert.equal(easeOf('easeInOut'), 'easeInOut');
  assert.equal(easeOf(undefined), 'linear');
});

test('xrotation / yrotation (3D) drawn as a scale: an edge at 90°, the back mirrored past it, with its own scale', async () => {
  const { drawnScale } = await import('../src/runtime/cf/renderer.ts');
  assert.deepEqual(drawnScale({ x: 1, y: 1 }, { x: 0, y: 0 }), { x: 1, y: 1 });
  assert.deepEqual(drawnScale({ x: 1, y: 1 }, { x: 0, y: 90 }), { x: 0, y: 1 });
  assert.deepEqual(drawnScale({ x: 1.5, y: 1 }, { x: 0, y: 180 }), { x: -1.5, y: 1 });
  assert.equal(Math.round(drawnScale({ x: 1, y: 2 }, { x: 60, y: 0 }).y * 100) / 100, 1);
});

test("an animation's target: writes dropped once its element is destroyed (a page flipped away mid-animation), one stand-in an element", async () => {
  const { animTarget } = await import('../src/runtime/cf/renderer.ts');
  const el = { destroyed: false, x: 0, scale: { x: 1, y: 1 } };
  const t = animTarget(el);
  assert.equal(animTarget(el), t, 'the same stand-in: a new animation of a value replaces the running one');
  t.x = 10;
  assert.equal(el.x, 10);
  const sc = animTarget(el.scale, el);
  el.destroyed = true;
  // what Pixi does to a destroyed container: its position is gone - a write would throw
  Object.defineProperty(el, 'x', { set() { throw new TypeError("Cannot set properties of null (setting 'x')"); } });
  assert.doesNotThrow(() => Object.assign(t, { x: 20 }));
  sc.x = 3;
  assert.equal(el.scale.x, 1);
  assert.equal(t.destroyed, true, 'reads go through');
});

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
  Assets.cache.remove('computer&mobile-32/icon-volume-down.png');
  Assets.cache.remove('Lamp0.png');
});

test('a file the .gui names by path and by bare name: one texture, under the first name (unloaded whole)', () => {
  const r = Object.assign(Object.create(CFRenderer.prototype), {
    imageMap: { 'icons/x.png': 'blob:x', 'x.png': 'blob:x', 'y.png': 'blob:y' },
  }) as CFRenderer;
  assert.equal(r.aliasOf('x.png'), 'icons/x.png');
  assert.equal(r.aliasOf('icons\\X.PNG'), 'icons/x.png');
  assert.equal(r.aliasOf('y.png'), 'y.png');
  assert.equal(r.getBgImage('url("x.png")'), 'icons/x.png');
  // loaded under the first name: found by the other
  Assets.cache.set('icons/x.png', Texture.WHITE);
  assert.equal(r.assetKey('x.png'), 'icons/x.png');
  assert.equal(r.texture('x.png'), Texture.WHITE);
  Assets.cache.remove('icons/x.png');
  assert.equal(r.assetKey('x.png'), undefined);
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

test("the other pages' images are fetched ahead, the pages after the one shown first, until the budget is reached", async () => {
  const page = (img: string, sub?: string) => ({ landscape: [{ type: 'img', text: img, attributes: {}, children: [] }, ...(sub ? [{ type: 'subpage', name: sub, attributes: {}, children: [] }] : [])] });
  const loaded: string[][] = [];
  const r = Object.assign(Object.create(CFRenderer.prototype), {
    imageMap: { 'a.png': 'blob:a', 'b.png': 'blob:b', 'c.png': 'blob:c', 'd.png': 'blob:d', 's.png': 'blob:s' },
    themeOf: {},
    project: { themes: {}, subpages: { S: { nodes: [{ type: 'img', text: 's.png', attributes: {}, children: [] }] } }, pages: { A: page('a.png'), B: page('b.png'), C: page('c.png', 'S'), D: page('d.png') } },
    currentPageName: 'B',
    navToken: 1,
    textureBudget: 1e9,
    lastUsed: new Map(),
    ensureLoaded: async (aliases: string[]) => void loaded.push([...aliases]),
  }) as any;
  await r.prefetch();
  // after B: C with its subpage's, D, then round to A - not B's own
  assert.deepEqual(loaded, [['c.png', 's.png'], ['d.png'], ['a.png']]);
  // the budget reached (the images loaded weigh it): no more
  loaded.length = 0;
  r.textureBudget = 0;
  await r.prefetch();
  assert.equal(loaded.length, 0);
  // a flip meanwhile: stopped after the page under way
  loaded.length = 0;
  r.textureBudget = 1e9;
  r.ensureLoaded = async (aliases: string[]) => { loaded.push([...aliases]); r.navToken++; };
  await r.prefetch();
  assert.deepEqual(loaded, [['c.png', 's.png']]);
});

test("an image in a sheet (iva build's atlas) comes with its sheet: the sheet loaded once, its every image a frame of it under its own name; the sheet let go, its images go", async () => {
  const { Container, Sprite, TextureSource } = await import('pixi.js');
  const r = Object.assign(Object.create(CFRenderer.prototype), {
    imageMap: { 'icons/a.png': 'blob:a', 'a.png': 'blob:a', 'icons/b.png': 'blob:b', 'icons/c.png': 'blob:c', 'big.png': 'blob:big' },
    atlas: { sheets: ['blob:sheet0', 'blob:sheet1'], frames: { 'icons/a.png': [0, 2, 2, 10, 20], 'icons/b.png': [0, 16, 2, 30, 30], 'icons/c.png': [1, 2, 2, 8, 8] } },
    loading: new Map(),
    lastUsed: new Map(),
    textureBudget: 0,
    app: { stage: new Container() },
  }) as any;
  const loads: string[] = [];
  // what Pixi's loader would do: the file, decoded, in its cache under its key
  r.loadOne = async (key: string) => {
    loads.push(key);
    await new Promise((res) => setTimeout(res, 1));
    Assets.cache.set(key, new Texture({ source: new TextureSource({ width: 64, height: 64 }) }));
    r.lastUsed.set(key, performance.now());
  };
  // a and b asked for at once, by any of their names: one sheet, once; big.png isn't in one - on its own
  await r.ensureLoaded([r.aliasOf('a.png'), 'icons/b.png', 'big.png']);
  assert.deepEqual(loads.sort(), ['big.png', 'iva-atlas:blob:sheet0']);
  const sheet = Assets.get('iva-atlas:blob:sheet0') as Texture;
  const a = r.texture('a.png') as Texture;
  assert.equal(a.source, sheet.source);
  assert.deepEqual([a.frame.x, a.frame.y, a.frame.width, a.frame.height], [2, 2, 10, 20]);
  assert.equal((r.texture('icons/b.png') as Texture).frame.width, 30);
  assert.equal(r.texture('icons/c.png'), undefined, "the other sheet's: not loaded");
  // again: nothing to load; the sheet is what's tracked, not its images
  await r.ensureLoaded(['icons/a.png']);
  assert.equal(loads.length, 2);
  assert.ok(r.lastUsed.has('iva-atlas:blob:sheet0') && !r.lastUsed.has('icons/a.png'));
  assert.equal(r.filesFor(['icons/a.png', 'icons/b.png', 'icons/c.png', 'big.png']), 3);
  // b on the stage: the sheet stays; then nothing on it, and old - the sheet goes, and its images with it
  const shown = new Sprite(r.texture('icons/b.png'));
  r.app.stage.addChild(shown);
  const unload = Assets.unload;
  const unloaded: string[] = [];
  (Assets as any).unload = async (keys: string[]) => void unloaded.push(...keys);
  try {
    for (const k of r.lastUsed.keys()) r.lastUsed.set(k, performance.now() - 60000);
    r.collect();
    assert.deepEqual(unloaded, ['big.png']);
    r.app.stage.removeChild(shown);
    for (const k of r.lastUsed.keys()) r.lastUsed.set(k, performance.now() - 60000);
    r.collect();
    await new Promise((res) => setTimeout(res, 0));
  } finally {
    (Assets as any).unload = unload;
  }
  assert.deepEqual(unloaded, ['big.png', 'iva-atlas:blob:sheet0']);
  assert.ok(!Assets.cache.has('icons/a.png') && !Assets.cache.has('icons/b.png'), "the sheet's images forgotten with it");
  assert.ok(a.destroyed);
  // asked for again: the sheet again
  Assets.cache.remove('iva-atlas:blob:sheet0');
  await r.ensureLoaded(['icons/a.png']);
  assert.equal(loads.filter((k) => k === 'iva-atlas:blob:sheet0').length, 2);
  for (const k of ['iva-atlas:blob:sheet0', 'icons/a.png', 'icons/b.png', 'big.png']) if (Assets.cache.has(k)) Assets.cache.remove(k);
});

test("a sheet that doesn't come: its images on their own", async () => {
  const r = Object.assign(Object.create(CFRenderer.prototype), {
    imageMap: { 'icons/x.png': 'blob:x' },
    atlas: { sheets: ['blob:gone'], frames: { 'icons/x.png': [0, 2, 2, 4, 4] } },
    loading: new Map(),
    lastUsed: new Map(),
  }) as any;
  const loads: string[] = [];
  r.loadOne = async (key: string) => {
    loads.push(key);
    if (key.startsWith('iva-atlas:')) return; // failed, after its tries
    Assets.cache.set(key, Texture.WHITE);
  };
  await r.ensureLoaded(['icons/x.png']);
  assert.deepEqual(loads, ['iva-atlas:blob:gone', 'icons/x.png']);
  assert.equal(r.texture('icons/x.png'), Texture.WHITE);
  Assets.cache.remove('icons/x.png');
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
  // the decoded bitmap (an ImageBitmap in a browser): closed once unloaded
  let closed = 0;
  old.source.resource = { close: () => ++closed };
  const unload = Assets.unload;
  const unloaded: string[] = [];
  (Assets as any).unload = async (keys: string[]) => void unloaded.push(...keys);
  try {
    r.collect();
    await new Promise((res) => setTimeout(res, 0));
  } finally {
    (Assets as any).unload = unload;
  }
  // 4 MB each: the one used a second ago kept anyway, the page before within the budget, the older one let go
  assert.deepEqual(unloaded, ['lazy-old.png']);
  assert.equal(closed, 1);
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

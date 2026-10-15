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

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

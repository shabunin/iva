import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rendererLabel, rendererOptions } from '../src/runtime/cf/loadProject.ts';

test("what draws the GUI, as chosen: Pixi's preference (and WebGL's version); what an app draws with, said plainly", () => {
  assert.deepEqual(rendererOptions(), { preference: 'webgl' });
  assert.deepEqual(rendererOptions('auto'), { preference: 'webgl' });
  assert.deepEqual(rendererOptions('webgl2'), { preference: 'webgl', webgl: { preferWebGLVersion: 2 } });
  assert.deepEqual(rendererOptions('webgl1'), { preference: 'webgl', webgl: { preferWebGLVersion: 1 } });
  assert.deepEqual(rendererOptions('webgpu'), { preference: 'webgpu' });
  assert.deepEqual(rendererOptions('canvas'), { preference: 'canvas' });
  const app = (renderer: object) => ({ renderer }) as never;
  assert.equal(rendererLabel(app({ name: 'webgl', context: { webGLVersion: 1 } })), 'WebGL 1');
  assert.equal(rendererLabel(app({ name: 'webgl', context: { webGLVersion: 2 } })), 'WebGL 2');
  assert.equal(rendererLabel(app({ name: 'webgpu' })), 'WebGPU');
  assert.equal(rendererLabel(app({ name: 'canvas' })), 'Canvas 2D');
});

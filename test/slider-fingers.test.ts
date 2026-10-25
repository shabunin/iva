/**
 * A slider follows the finger that dragged it, and lets go when that one
 * lifts: two faders dragged at once each go their own way; another finger
 * lifting (a tap elsewhere) doesn't release it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, updateRenderGroupTransforms } from 'pixi.js';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

// the window's events as a browser has them (the harness has none): a slider hears a finger lift there
const win = new EventTarget();
const g = globalThis as any;
g.addEventListener = win.addEventListener.bind(win);
g.removeEventListener = win.removeEventListener.bind(win);
const { runGui } = await import('./gui-runtime.ts');

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <slider j="1" d="20" x="10" y="150" w="180" h="16" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0" />
      <slider j="2" d="21" x="10" y="200" w="180" h="16" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0" />
      <btn j="4" x="300" y="0" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">A</inactive><active s="0">A</active></btn>
    </landscape>
  </page>`;

test('two faders dragged at once: each follows its own finger; one lifted lets go of its own only', async () => {
  const { app } = await runGui(GUI);
  const stage: Container = app.stage;
  const boundary = new EventBoundary(stage);
  stage.enableRenderGroup();
  const at = (type: string, x: number, y: number, pointerId: number) => {
    updateRenderGroupTransforms(stage.renderGroup, true);
    const e = new FederatedPointerEvent(boundary);
    Object.assign(e, { type, pointerId, pointerType: 'touch', button: 0, isPrimary: pointerId === 1 });
    e.global.set(x, y);
    e.client.set(x, y);
    boundary.mapEvent(e);
  };
  /** a finger lifted: the browser tells the window, Pixi what it was on */
  const lift = (x: number, y: number, pointerId: number) => {
    win.dispatchEvent(Object.assign(new Event('pointerup'), { pointerId, clientX: x, clientY: y }));
    at('pointerup', x, y, pointerId);
  };
  const a = () => joinStore.get('1', 'a') as number;
  const b = () => joinStore.get('2', 'a') as number;
  at('pointerdown', 100, 158, 1);
  at('pointerdown', 40, 208, 2);
  const [a0, b0] = [a(), b()];
  assert.ok(a0 > b0);
  // finger 2 moves fader B, not A
  at('pointermove', 160, 208, 2);
  assert.equal(a(), a0);
  assert.ok(b() > a0);
  // finger 2 lifted: B let go, A still held
  lift(160, 208, 2);
  assert.equal(joinStore.get('21', 'd'), false);
  assert.equal(joinStore.get('20', 'd'), true);
  // a tap elsewhere doesn't let go of A, or move it
  at('pointerdown', 320, 20, 3);
  lift(320, 20, 3);
  assert.equal(joinStore.get('20', 'd'), true);
  assert.equal(a(), a0);
  // finger 1 still drags A, and lets it go
  at('pointermove', 40, 158, 1);
  assert.ok(a() < a0);
  lift(40, 158, 1);
  assert.equal(joinStore.get('20', 'd'), false);
});

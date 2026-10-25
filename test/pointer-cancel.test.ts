/**
 * A touch the device takes back (pointercancel: a swipe in from the edge,
 * the app paused mid-touch) lets go of what it pressed, as a release off it
 * - Pixi hears no cancels: a button held stayed down, repeating, a slider's
 * drag went on with the next touch.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, updateRenderGroupTransforms } from 'pixi.js';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

// the window's events as a browser has them (the harness has none)
const win = new EventTarget();
const g = globalThis as any;
g.addEventListener = win.addEventListener.bind(win);
g.removeEventListener = win.removeEventListener.bind(win);
g.dispatchEvent = win.dispatchEvent.bind(win);
const { runGui } = await import('./gui-runtime.ts');
const { releaseOnCancel } = await import('../src/runtime/cf/loadProject.ts');

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <btn j="4" x="0" y="0" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">Vol +</inactive><active s="0">Vol +</active>
        <actions><action><press repeat="100" js="globalThis.presses = (globalThis.presses ?? 0) + 1;" /></action></actions>
      </btn>
      <slider j="1" d="20" x="10" y="150" w="180" h="16" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0" />
    </landscape>
  </page>`;

/** Pixi's events as the app's (its stage, positions as the browser's) - a cancel told it as releaseOnCancel does */
async function start() {
  const r = await runGui(GUI);
  const stage: Container = r.app.stage;
  const boundary = new EventBoundary(stage);
  stage.enableRenderGroup();
  releaseOnCancel({ rootBoundary: boundary, mapPositionToPoint: (p: any, x: number, y: number) => p.set(x, y) } as any);
  const at = (type: string, x: number, y: number, pointerId: number) => {
    updateRenderGroupTransforms(stage.renderGroup, true);
    const e = new FederatedPointerEvent(boundary);
    Object.assign(e, { type, pointerId, pointerType: 'touch', button: 0, isPrimary: true });
    e.global.set(x, y);
    e.client.set(x, y);
    boundary.mapEvent(e);
  };
  const cancel = (pointerId: number) =>
    dispatchEvent(Object.assign(new Event('pointercancel'), { pointerId, pointerType: 'touch', isPrimary: true, button: -1, clientX: 0, clientY: 0 }));
  return { ...r, at, cancel };
}

test('a button held, its press repeating, the touch taken back: let go - its momentary join low, no more repeats, released', async () => {
  const { CF, at, cancel } = await start();
  const released: string[] = [];
  CF.watch(CF.ObjectReleasedEvent, 'd4', (join: string) => released.push(join));
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    g.presses = 0;
    at('pointerdown', 10, 10, 31);
    assert.equal(joinStore.get('4', 'd'), true);
    mock.timers.tick(250);
    assert.equal(g.presses, 3);
    cancel(31);
    assert.equal(joinStore.get('4', 'd'), false);
    assert.deepEqual(released, ['d4']);
    mock.timers.tick(1000);
    assert.equal(g.presses, 3, 'no more repeats');
    // another finger's cancel is not its
    at('pointerdown', 10, 10, 32);
    cancel(33);
    assert.equal(joinStore.get('4', 'd'), true);
    at('pointerup', 10, 10, 32);
    assert.equal(joinStore.get('4', 'd'), false);
  } finally {
    mock.timers.reset();
  }
});

test("a slider dragged, the touch taken back: let go - its press join low; the next touch's moves elsewhere don't drag it", async () => {
  const { at, cancel } = await start();
  at('pointerdown', 100, 158, 41);
  assert.equal(joinStore.get('20', 'd'), true);
  const value = joinStore.get('1', 'a');
  cancel(41);
  assert.equal(joinStore.get('20', 'd'), false);
  at('pointerdown', 300, 250, 42);
  at('pointermove', 180, 250, 42);
  assert.equal(joinStore.get('1', 'a'), value);
});

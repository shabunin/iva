/**
 * A button pressed by a finger as by a mouse, wherever Pixi sees no phone
 * (a touch PC, a touch laptop's preview: here) - Pixi's own events, its hit
 * testing and its pointers; a finger at a time.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import 'pixi.js/events';
import { Container, EventBoundary, FederatedPointerEvent, isMobile, updateRenderGroupTransforms } from 'pixi.js';
import { runGui } from './gui-runtime.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <btn j="4" x="0" y="0" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">A</inactive><active s="0">A</active></btn>
    </landscape>
  </page>`;

/** a pointer's event as Pixi makes it of the browser's, at (x, y) on the stage - where things are as a frame drawn before it has them */
function pointers(stage: Container) {
  const boundary = new EventBoundary(stage);
  stage.enableRenderGroup();
  return (type: string, x: number, y: number, pointerId = 7, pointerType = 'touch') => {
    updateRenderGroupTransforms(stage.renderGroup, true);
    const e = new FederatedPointerEvent(boundary);
    Object.assign(e, { type, pointerId, pointerType, button: 0, isPrimary: pointerId === 7 });
    e.global.set(x, y);
    e.client.set(x, y);
    boundary.mapEvent(e);
  };
}

test('a finger presses a button where Pixi sees no phone, as a mouse does: down while held, up let go on it or off it', async () => {
  assert.equal(isMobile.any, false);
  const { CF, app } = await runGui(GUI);
  const at = pointers(app.stage);
  const released: string[] = [];
  CF.watch(CF.ObjectReleasedEvent, 'd4', (join: string) => released.push(join));
  at('pointerdown', 10, 10);
  assert.equal(joinStore.get('4', 'd'), true, 'a touch presses it');
  at('pointerup', 10, 10);
  assert.equal(joinStore.get('4', 'd'), false);
  assert.deepEqual(released, ['d4']);
  // let go off it: released all the same
  at('pointerdown', 10, 10, 8);
  at('pointerup', 300, 200, 8);
  assert.equal(joinStore.get('4', 'd'), false);
  assert.deepEqual(released, ['d4', 'd4']);
  // a mouse as ever
  at('pointerdown', 10, 10, 1, 'mouse');
  assert.equal(joinStore.get('4', 'd'), true);
  at('pointerup', 10, 10, 1, 'mouse');
  assert.equal(joinStore.get('4', 'd'), false);
});

test("a finger at a time: another's touch on the button and its lifting are not the press's", async () => {
  const { CF, app } = await runGui(GUI);
  const at = pointers(app.stage);
  const pressed: string[] = [];
  CF.watch(CF.ObjectPressedEvent, 'd4', (join: string) => pressed.push(join));
  at('pointerdown', 10, 10, 11);
  at('pointerdown', 30, 20, 12);
  at('pointerup', 30, 20, 12);
  assert.equal(joinStore.get('4', 'd'), true, 'still held by the first');
  assert.deepEqual(pressed, ['d4']);
  at('pointerup', 10, 10, 11);
  assert.equal(joinStore.get('4', 'd'), false);
});

const LIST = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <list j="3" x="0" y="0" w="400" h="100" t="" headerSub="" titleSub="" contentSub="Row" footerSub="" orientation="v" l="0" swipedelete="0" />
    </landscape>
  </page>
  <subpage name="Row" w="400" h="40">
    <btn j="6" x="0" y="0" w="80" h="30" t="b" flip="None" sim="1" l="0"><inactive s="0">A</inactive><active s="0">A</active></btn>
  </subpage>`;

test("in a list: a finger's tap presses and releases; held, then dragging the list, the press is undone and nothing released", async () => {
  const { CF, app } = await runGui(LIST);
  CF.listAdd('l3', Array.from({ length: 10 }, () => ({})));
  const at = pointers(app.stage);
  const heard: string[] = [];
  CF.watch(CF.ObjectPressedEvent, (join: string) => heard.push(`pressed ${join}`));
  CF.watch(CF.ObjectReleasedEvent, (join: string) => heard.push(`released ${join}`));
  at('pointerdown', 10, 10, 21);
  at('pointerup', 10, 10, 21);
  assert.deepEqual(heard, ['pressed l3:0:d6', 'released l3:0:d6']);
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    at('pointerdown', 10, 10, 22);
    mock.timers.tick(400);
    assert.equal(joinStore.get('l3:0:6', 'd'), true, 'held: pressed');
    // (the list's drag tells it as pixi/ui's ScrollBox does)
    at('pointermove', 10, 40, 22);
    assert.equal(joinStore.get('l3:0:6', 'd'), false, 'the list took the touch');
    at('pointerup', 10, 40, 22);
    assert.deepEqual(heard, ['pressed l3:0:d6', 'released l3:0:d6', 'pressed l3:0:d6']);
  } finally {
    mock.timers.reset();
  }
  // and the next tap on it (the list back at its top) is a tap
  CF.listScroll('l3', 0, CF.TopPosition, false);
  at('pointerdown', 10, 10, 23);
  at('pointerup', 10, 10, 23);
  assert.deepEqual(heard.slice(3), ['pressed l3:0:d6', 'released l3:0:d6']);
});

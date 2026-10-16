import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GestureRecognizer, gestureDef, runGestureAction, type GestureInfo, type GesturePhase } from '../src/runtime/cf/components/Gestures.ts';
import { transitionEase, transitionSide, animates } from '../src/runtime/cf/renderer.ts';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

(globalThis as any).window ??= { devicePixelRatio: 1 };

/** gestures as the .gui has them, and what they fired: "name phase" */
function recognizer(...specs: Record<string, string>[]) {
  const fired: string[] = [];
  const infos: GestureInfo[] = [];
  const defs = specs.map((a) => gestureDef({ type: 'gesture', attributes: a, children: [] } as any));
  const r = new GestureRecognizer(defs, (g, phase: GesturePhase, info) => {
    fired.push(`${g.node.attributes.name} ${phase}`);
    infos.push(info);
  });
  return { r, fired, infos };
}

test('tap: on release, still and quick; a double tap fires the double-tap gesture once and the single-tap one twice', () => {
  const { r, fired, infos } = recognizer({ name: 'one', type: 'tap', taps: '1', touches: '1' }, { name: 'two', type: 'tap', taps: '2', touches: '1' });
  r.down(1, 100, 50, 0);
  assert.deepEqual(fired, []);
  r.up(1, 103, 52, 120);
  assert.deepEqual(fired, ['one begin', 'one end']);
  assert.deepEqual([infos[0].x, infos[0].y], [100, 50]);
  r.down(2, 101, 51, 300);
  r.up(2, 101, 51, 380);
  assert.deepEqual(fired, ['one begin', 'one end', 'one begin', 'one end', 'two begin', 'two end']);
  // held too long, or moved: no tap
  fired.length = 0;
  r.down(3, 10, 10, 2000);
  r.up(3, 10, 10, 2900);
  r.down(4, 10, 10, 4000);
  r.move(4, 40, 10, 4050);
  r.up(4, 40, 10, 4100);
  assert.deepEqual(fired, []);
});

test('tap with two fingers: only the two-finger gesture', () => {
  const { r, fired } = recognizer({ name: 'one', type: 'tap', touches: '1' }, { name: 'two', type: 'tap', touches: '2' });
  r.down(1, 100, 100, 0);
  r.down(2, 140, 100, 20);
  r.up(1, 100, 100, 100);
  r.up(2, 140, 100, 110);
  assert.deepEqual(fired, ['two begin', 'two end']);
});

test('press: as soon as it is pressed', () => {
  const { r, fired, infos } = recognizer({ name: 'press', type: 'press', touches: '1' });
  r.down(1, 30, 40, 0);
  assert.deepEqual(fired, ['press begin', 'press end']);
  assert.deepEqual([infos[0].x, infos[0].y], [30, 40]);
});

test('swipe: once it is far enough mostly one way, in its direction only, once a touch', () => {
  const { r, fired, infos } = recognizer({ name: 'left', type: 'swipe', direction: 'left' }, { name: 'up', type: 'swipe', direction: 'up' });
  r.down(1, 200, 100, 0);
  r.move(1, 180, 102, 50);
  assert.deepEqual(fired, []);
  r.move(1, 150, 104, 100);
  assert.deepEqual(fired, ['left begin', 'left end']);
  assert.equal(infos[0].direction, 'left');
  assert.equal(infos[0].deltax, -50);
  r.move(1, 60, 104, 150);
  r.up(1, 60, 104, 200);
  assert.equal(fired.length, 2);
  // too slow: no swipe
  r.down(2, 200, 100, 1000);
  r.move(2, 200, 60, 1800);
  r.up(2, 200, 60, 1850);
  assert.equal(fired.length, 2);
});

test('pan: begins once moved past a little, changes as it moves (velocity), ends on release', () => {
  const { r, fired, infos } = recognizer({ name: 'pan', type: 'pan', touches: '1' });
  r.down(1, 100, 100, 0);
  r.move(1, 105, 100, 16);
  assert.deepEqual(fired, []);
  r.move(1, 120, 100, 32);
  r.move(1, 140, 100, 48);
  r.up(1, 140, 100, 64);
  assert.deepEqual(fired, ['pan begin', 'pan change', 'pan end']);
  assert.deepEqual([infos[0].startx, infos[0].x, infos[0].deltax], [100, 120, 20]);
  assert.ok(infos[1].velocityx! > 500, 'points a second');
  assert.equal(infos[2].x, 140);
});

test('pinch and rotate: two fingers; scale from the start distance, rotation in radians since it began', () => {
  const { r, fired, infos } = recognizer({ name: 'pinch', type: 'pinch' }, { name: 'rotate', type: 'rotate' });
  r.down(1, 100, 100, 0);
  r.down(2, 200, 100, 10);
  r.move(2, 300, 100, 30);
  const pinch = infos[fired.indexOf('pinch begin')];
  assert.equal(pinch.scale, 2);
  assert.equal(pinch.distance, 200);
  // a quarter turn about the first finger
  r.move(2, 100, 300, 60);
  const turned = infos[fired.lastIndexOf('rotate change')] ?? infos[fired.lastIndexOf('rotate begin')];
  assert.ok(Math.abs(turned.rotation! - Math.PI / 2) < 1e-9);
  r.up(2, 100, 300, 80);
  assert.ok(fired.includes('pinch end') && fired.includes('rotate end'));
});

test("a gesture's actions: its [tokens] and iViewer's math in values, a list item's joins, tokens, the script's locals", () => {
  joinStore.clear();
  const cf = new CFAPI();
  (globalThis as any).CF = cf;
  const info: GestureInfo = { type: 'pan', x: 240, y: 160, startx: 200, starty: 100, deltax: 40, deltay: 60, velocity: 3 };
  const act = (attrs: Record<string, string>, ctx = {}) => runGestureAction({ type: 'action', attributes: attrs, children: [] } as any, info, ctx);
  act({ phase: 'change', j: 'a1', value: '{{max((65535/480)*[x], 0)}}' });
  assert.equal(joinStore.get('1', 'a'), 32767.5);
  act({ phase: 'change', j: 's1', value: '[x], [y]' });
  assert.equal(joinStore.get('1', 's'), '240, 160');
  act({ phase: 'begin', j: 'd10', value: '1' }, { list: 'l5', listIndex: 2 });
  assert.equal(joinStore.get('l5:2:10', 'd'), true);
  act({ phase: 'begin', token: '[angle]', target: 'e0', value: '{{round(rtod(atan(1)))}}' });
  assert.equal(cf.tokensStore['e0']['[angle]'], '45');
  let seen: unknown[] = [];
  (globalThis as any).probe = (...a: unknown[]) => (seen = a);
  act({ phase: 'begin', js: 'probe(gesture.deltax, join, list, listIndex)' }, { join: 'l5:2:s3', list: 'l5', listIndex: 2 });
  assert.deepEqual(seen, [40, 's3', 'l5', 2]);
});

test('transitions: Ease In / Out / Both, the side what moves comes from, None or 0 s at once', () => {
  assert.equal(transitionEase('easeInEaseOut'), 'easeInOut');
  assert.equal(transitionEase('easeIn'), 'easeIn');
  assert.equal(transitionEase('EaseOut'), 'easeOut');
  assert.equal(transitionEase(''), 'linear');
  assert.equal(transitionEase('linear'), 'linear');
  assert.deepEqual(transitionSide('fromRight'), { x: 1, y: 0 });
  assert.deepEqual(transitionSide('fromTop'), { x: 0, y: -1 });
  assert.equal(animates({ type: 'moveIn', time: 0 }), false);
  assert.equal(animates({ type: 'None', time: 1 }), false);
  assert.equal(animates({ type: 'push', time: 0.4 }), true);
});

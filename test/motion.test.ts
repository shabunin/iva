/**
 * iva-motion.js on the panel: an element coming in as its page shows, pressed, with a join - what it asks
 * CF.setProperties, from where the element is laid out (CF.getProperties).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const RUNTIME = fs.readFileSync(new URL('../src/compiler/iva-motion.js', import.meta.url), 'utf8');

/** a panel's CF as the script sees it: watchers, where elements are, what setProperties is asked */
function panel(bases: Record<string, Record<string, number>>, page = 'Main') {
  let now = 1_000_000;
  const watchers: Record<string, { joins?: string | string[]; cb: (...a: any[]) => void }[]> = {};
  const props: any[] = [];
  const CF: any = {
    PageFlipEvent: 'page', ObjectPressedEvent: 'press', ObjectReleasedEvent: 'release', JoinChangeEvent: 'join',
    AnimationCurveLinear: 'linear', AnimationCurveEaseIn: 'easeIn', AnimationCurveEaseOut: 'easeOut', AnimationCurveEaseInOut: 'easeInOut',
    currentPage: page,
    joins: {} as Record<string, string>,
    watch(event: string, a: any, b?: any, c?: any) {
      const cb = typeof a === 'function' ? a : b;
      const joins = typeof a === 'function' ? undefined : a;
      const fireNow = typeof a === 'function' ? b : c;
      (watchers[event] ??= []).push({ joins, cb });
      if (fireNow && event === 'join') for (const j of [joins].flat()) cb(j, CF.joins[j] ?? '0');
    },
    getProperties(j: string, cb: (p: unknown) => void) { cb(bases[j] ? { join: j, ...bases[j] } : null); },
    setProperties(p: any, delay = 0, duration = 0, curve?: string) { props.push({ ...p, delay, duration, curve }); },
  };
  const Clock = class extends Date { static now() { return now; } };
  const IvaMotion = new Function('CF', 'Date', `${RUNTIME}\nreturn IvaMotion;`)(CF, Clock);
  const fire = (event: string, join: string, ...rest: unknown[]) =>
    (watchers[event] ?? []).forEach((w) => { if (!w.joins || w.joins === join || (Array.isArray(w.joins) && w.joins.includes(join))) w.cb(join, ...rest); });
  const flip = (to: string) => { const from = CF.currentPage; CF.currentPage = to; (watchers.page ?? []).forEach((w) => w.cb(from, to, 'landscape')); };
  return { CF, IvaMotion, props, fire, flip, tick: (ms: number) => { now += ms; } };
}

test('enter: put at `from` at once, then to where it is laid out; again on each flip to its page, not on another page', () => {
  const d = panel({ s1: { x: 10, y: 20, w: 100, h: 30, opacity: 1, scale: 1 } });
  d.IvaMotion.add({ join: 's1', page: 'Main', enter: { from: { y: '+40', opacity: 0 }, delay: 0.1, duration: 0.4, curve: 'easeOut' } });
  assert.deepEqual(d.props, [
    { join: 's1', y: 60, opacity: 0, delay: 0, duration: 0, curve: 'linear' },
    { join: 's1', y: 20, opacity: 1, delay: 0.1, duration: 0.4, curve: 'easeOut' },
  ], 'the page shown already: in now');
  d.tick(1000);
  d.flip('Other');
  assert.equal(d.props.length, 2, 'another page: nothing');
  d.flip('Main');
  assert.equal(d.props.length, 4, 'back: in again');
  d.flip('Other');
  d.flip('Main');
  assert.equal(d.props.length, 4, 'a second show within half a second: once');
});

test('press: these while pressed, back on release; when: on / off with the join, from its value at the start', () => {
  const d = panel({ d1: { x: 0, y: 0, w: 160, h: 48, scale: 1, opacity: 1 }, s2: { x: 0, y: 0, w: 64, h: 64, scale: 1, opacity: 1 } }, 'Elsewhere');
  d.IvaMotion.add({ join: 'd1', page: 'Main', press: { scale: 0.92, duration: 0.08 } });
  d.fire('press', 'd1');
  d.fire('release', 'd1');
  d.fire('press', 'd9');
  assert.deepEqual(d.props, [
    { join: 'd1', scale: 0.92, delay: 0, duration: 0.08, curve: 'easeOut' },
    { join: 'd1', scale: 1, delay: 0, duration: 0.08, curve: 'easeOut' },
  ]);
  d.props.length = 0;
  d.CF.joins.d5 = '1';
  d.IvaMotion.add({ join: 's2', page: 'Main', when: { join: 'd5', on: { opacity: 1, scale: 1.15 }, off: { opacity: 0.35 }, duration: 0.3 } });
  assert.deepEqual(d.props, [{ join: 's2', opacity: 1, scale: 1.15, delay: 0, duration: 0.3, curve: 'easeInOut' }], 'high at the start: on');
  d.fire('join', 'd5', '0');
  assert.deepEqual(d.props.at(-1), { join: 's2', opacity: 0.35, scale: 1, delay: 0, duration: 0.3, curve: 'easeInOut' }, 'low: off, what off leaves out as laid out');
});

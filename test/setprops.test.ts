import { test } from 'node:test';
import assert from 'node:assert/strict';
import { a, cmd, d, js, macro, s, setProps } from '../src/compiler/components.ts';

/** run an action's code against a CF that records its calls (callbacks run at once) and the build's Joins */
function run(code: string, props: Record<string, Record<string, number>> = {}) {
  const calls: string[] = [];
  const CF = {
    AnimationCurveLinear: 'LINEAR', AnimationCurveEaseIn: 'EASE_IN', AnimationCurveEaseOut: 'EASE_OUT', AnimationCurveEaseInOut: 'EASE_IN_OUT',
    setProperties(changes: unknown, delay?: number, duration?: number, curve?: string, callback?: () => void) {
      calls.push(`set ${JSON.stringify(changes)}${delay !== undefined ? ` ${delay} ${duration} ${curve}` : ''}`);
      callback?.();
    },
    getProperties(joins: string[], cb: (p: unknown[]) => void) {
      calls.push(`get ${joins.join(',')}`);
      cb(joins.map((j) => props[j] ?? {}));
    },
    runCommand: (_s: null, name: string) => calls.push(`command ${name}`),
    runMacro: (name: string) => calls.push(`macro ${name}`),
  };
  new Function('CF', 'Joins', code)(CF, { d: { cube: 'd1000', other: 'd1001' }, s: {}, a: {} });
  return calls;
}

test('setProps: CF.setProperties for a join - named (Joins), numbered, a tag - at once or animated', () => {
  assert.equal(setProps(d('cube'), { scale: 1.5 }).value, 'CF.setProperties({ join: Joins.d["cube"], scale: 1.5 });');
  assert.equal(setProps(s(12), { opacity: 0 }).value, 'CF.setProperties({ join: "s12", opacity: 0 });');
  assert.equal(setProps('menu', { theme: 'big' }).value, 'CF.setProperties({ join: "menu", theme: "big" });');
  assert.equal(setProps(d('cube'), { x: 100, zrotation: 90 }, { duration: 0.3, curve: 'easeOut' }).value,
    'CF.setProperties({ join: Joins.d["cube"], x: 100, zrotation: 90 }, 0, 0.3, CF.AnimationCurveEaseOut);');
  // a button's action (a js one); in a script's code as text too
  const act = setProps(d('cube'), { opacity: 1 }, { delay: 1 });
  assert.equal(act.kind, 'js');
  assert.equal(`${act}`, act.value);
  assert.deepEqual(run(act.value), ['set {"join":"d1000","opacity":1} 1 0 LINEAR']);
  // several at once: one call
  assert.deepEqual(run(setProps([d('cube'), d('other'), 'menu'], { opacity: 0 }, { duration: 0.4 }).value),
    ['set [{"join":"d1000","opacity":0},{"join":"d1001","opacity":0},{"join":"menu","opacity":0}] 0 0.4 LINEAR']);
});

test("setProps: then - the next animation, a command, a macro, JavaScript - in the callback, in turn", () => {
  const bounce = setProps(d('cube'), { scale: 1.2 }, { duration: 0.1, curve: 'easeOut', then: setProps(d('cube'), { scale: 1 }, { duration: 0.2, curve: 'easeIn' }) });
  assert.deepEqual(run(bounce.value), ['set {"join":"d1000","scale":1.2} 0 0.1 EASE_OUT', 'set {"join":"d1000","scale":1} 0 0.2 EASE_IN']);
  const done = setProps(d('cube'), { opacity: 0 }, { duration: 0.5, then: [cmd('Lights off'), macro('Night'), js('CF.log("x");')] });
  assert.match(done.value, /function \(\) \{ CF\.runCommand\(null, "Lights off"\); CF\.runMacro\("Night"\); CF\.log\("x"\); \}/);
  // the joins it uses: the build checks some element has them
  assert.deepEqual(bounce.joins, [d('cube'), d('cube')]);
  assert.equal(setProps(d(5), { x: 1 }).joins, undefined);
});

test("setProps: '+n' / '-n' - by how much, from where CF.getProperties says it is", () => {
  const move = setProps([d('cube'), d('other')], { x: '+200', opacity: '-0.5' }, { duration: 0.6, curve: 'easeInOut' });
  assert.deepEqual(run(move.value, { d1000: { x: 10, opacity: 1 }, d1001: { x: 50, opacity: 0.75 } }), [
    'get d1000,d1001',
    'set [{"join":"d1000","x":210,"opacity":0.5},{"join":"d1001","x":250,"opacity":0.25}] 0 0.6 EASE_IN_OUT',
  ]);
});

test('setProps: what it takes, said at build time', () => {
  assert.throws(() => setProps(d('cube'), { rotation: 90 } as any), /no property "rotation" \(did you mean "zrotation"\?\)/);
  assert.throws(() => setProps(d('cube'), { x: '100' as any }), /x: a number, or '\+n' \/ '-n'/);
  assert.throws(() => setProps(d('cube'), { x: 1 }, { curve: 'easeout' as any }), /curve: .* \(did you mean "easeOut"\?\)/);
  assert.throws(() => setProps('menu', { x: '+10' }), /need joins/);
  assert.throws(() => setProps([], { x: 1 }), /an element/);
  assert.throws(() => setProps(a('level'), {}), /no property to change/);
  assert.throws(() => setProps(d('cube'), { x: 1 }, { then: 'Power' as any }), /then: setProps\(\), cmd\(\)/);
});

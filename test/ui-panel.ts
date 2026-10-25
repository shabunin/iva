/**
 * A compiled project's scripts (iva-joins.js, iva-ui.js ... iva-start.js) run
 * as the panel runs them, against just enough of iViewer's CF: joins and
 * their watchers (fire-now too), lists, the orientation and its turns. A
 * change is told when the value changed (echo 'always': on every set) - at
 * once, or with `lag` a moment later, as iViewer does on a device (a script's
 * own CF.setJoin too; CF.getJoin's answer later, as the join was when asked).
 * Timers and what's told later wait for run().
 */
import type { CompileResult } from '../src/compiler/index.ts';

export interface PanelOptions {
  way?: 'landscape' | 'portrait';
  echo?: 'change' | 'always';
  lag?: boolean;
  /** joins as they are before the scripts start ('a1000': 32768) */
  joins?: Record<string, unknown>;
  /** what the project's own code calls (onEnter="Door.unlock(code)": { Door }) */
  globals?: Record<string, unknown>;
}

export function runPanel(r: Pick<CompileResult, 'scripts'>, { way = 'landscape', echo = 'change', lag = false, joins: before = {}, globals = {} }: PanelOptions = {}) {
  const joins: Record<string, any> = { ...before };
  const lists: Record<string, any[]> = {};
  const watchers: { event: string; joins?: string | string[]; cb: (...a: any[]) => void }[] = [];
  const tasks: (() => void)[] = [];
  const later = (f: () => void) => tasks.push(f);
  const told = (f: () => void) => (lag ? later(f) : f());
  const fire = (event: string, join: string, ...rest: any[]) => told(() => {
    for (const w of [...watchers]) {
      if (w.event !== event) continue;
      if (w.joins && !(Array.isArray(w.joins) ? w.joins.includes(join) : w.joins === join)) continue;
      w.cb(join, ...rest);
    }
  });
  const CF: any = {
    modules: [], JoinChangeEvent: 'join', InputFieldEditedEvent: 'input', ListWillStartScrollingEvent: 'start', ListDidEndScrollingEvent: 'end',
    PageFlipEvent: 'page', OrientationChangeEvent: 'orientation', LandscapeOrientation: 'landscape', PortraitOrientation: 'portrait',
    TopPosition: 'top', PixelPosition: 'pixel', AnimationCurveEaseInOut: 'inout', AnimationCurveEaseOut: 'out', AnimationCurveLinear: 'linear',
    currentOrientation: way, currentPage: '',
    setJoin(j: string, v: any) {
      const changed = String(joins[j]) !== String(v);
      joins[j] = v;
      if (changed || echo === 'always') fire('join', j, v);
    },
    getJoin(j: string, cb: any) {
      const v = joins[j] ?? 0;
      told(() => cb(j, v));
    },
    getJoins(js: string[], cb: any) {
      const m = Object.fromEntries(js.map((j) => [j, { value: joins[j] ?? 0 }]));
      told(() => cb(m));
    },
    watch(event: string, a: any, b?: any, fireNow?: boolean) {
      const cb = typeof a === 'function' ? a : b;
      const js = typeof a === 'function' ? undefined : a;
      watchers.push({ event, joins: js, cb });
      if (fireNow && js) {
        for (const j of [js].flat()) {
          const v = joins[j] ?? 0;
          told(() => cb(j, v));
        }
      }
    },
    listAdd(l: string, items: any[]) { (lists[l] ??= []).push(...items); },
    listRemove(l: string) { lists[l] = []; },
    listScroll() {},
    listInfo(l: string, cb: any) { cb(l, lists[l]?.length ?? 0, 0, 5, 0); },
    setProperties() {},
    getProperties(_j: unknown, cb: (p: unknown) => void) { cb(null); },
    log() {},
  };
  const code = `${r.scripts.map((s) => s.code).join('\n')}\nreturn { IvaUI: IvaUI, Joins: typeof Joins === 'undefined' ? {} : Joins };`;
  const names = Object.keys(globals);
  const { IvaUI, Joins } = new Function('CF', 'setTimeout', 'setInterval', 'clearInterval', ...names, code)(
    CF, later, () => 0, () => {}, ...names.map((n) => globals[n]));
  /** what's due (timers, what's told later), until nothing is; how many ran - a script going round never settles */
  const run = (limit = 5000) => {
    let ran = 0;
    for (; tasks.length && ran < limit; ran++) tasks.shift()!();
    return ran;
  };
  for (const m of CF.modules) m.setup();
  run();
  /** a join named by the project or a component (Joins.a.count); a RegExp: the one whose name matches (a component's own, named by a hash) */
  const join = (type: 'd' | 'a' | 's' | 'l', name: string | RegExp): string => {
    if (typeof name === 'string') return Joins[type][name];
    const found = Object.keys(Joins[type] ?? {}).filter((n) => name.test(n));
    if (found.length !== 1) throw new Error(`${found.length} ${type} joins named ${name}: ${found.join(', ')}`);
    return Joins[type][found[0]];
  };
  /** a finger, a feedback or a script elsewhere sets a join */
  const user = (j: string, v: unknown) => {
    CF.setJoin(j, v);
    run();
  };
  /** the panel turned: OrientationChangeEvent, then what iva-start.js does then */
  const turn = (to: 'landscape' | 'portrait') => {
    CF.currentOrientation = to;
    for (const w of [...watchers]) if (w.event === 'orientation') w.cb('', to);
    run();
  };
  return { CF, IvaUI, joins, lists, join, user, turn, run, pending: () => tasks.length };
}

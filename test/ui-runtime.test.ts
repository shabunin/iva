import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI_RUNTIME } from '../lib/ui/runtime.ts';

/** Just enough of iViewer's CF for iva-ui.js: joins, watchers, lists. */
function panel() {
  const joins: Record<string, any> = {};
  const watchers: { event: string; joins?: string | string[]; cb: (...a: any[]) => void }[] = [];
  const lists: Record<string, any[]> = {};
  const scrolls: [string, number][] = [];
  const fire = (event: string, join: string, ...rest: any[]) => {
    for (const w of watchers) {
      if (w.event !== event) continue;
      if (w.joins && !(Array.isArray(w.joins) ? w.joins.includes(join) : w.joins === join)) continue;
      w.cb(join, ...rest);
    }
  };
  const CF: any = {
    JoinChangeEvent: 'join', InputFieldEditedEvent: 'input', ListWillStartScrollingEvent: 'start', ListDidEndScrollingEvent: 'end',
    FeedbackMatchedEvent: 'fb', PageFlipEvent: 'page', TopPosition: 'top',
    setJoin(j: string, v: any) {
      joins[j] = v;
      fire('join', j, v);
    },
    getJoin(j: string, cb: any) { cb(j, joins[j] ?? 0); },
    getJoins(js: string[], cb: any) { cb(Object.fromEntries(js.map((j) => [j, { value: joins[j] ?? 0 }]))); },
    watch(event: string, a: any, b?: any, fireNow?: boolean) {
      const cb = typeof a === 'function' ? a : b;
      const js = typeof a === 'function' ? undefined : a;
      watchers.push({ event, joins: js, cb });
      if (fireNow && js) for (const j of [js].flat()) cb(j, joins[j] ?? 0);
    },
    listRemove(l: string) { lists[l] = []; },
    listAdd(l: string, items: any[]) { (lists[l] ??= []).push(...items); },
    listScroll(l: string, i: number) { scrolls.push([l, i]); },
    setProperties() {},
    log() {},
  };
  const IvaUI = new Function('CF', 'setTimeout', `${UI_RUNTIME}\nreturn IvaUI;`)(CF, (f: () => void) => f());
  return { CF, IvaUI, joins, lists, scrolls, fire };
}

const pad = (n: number) => String(n).padStart(2, '0');

test('TimePicker: the field, the drums, OK writes the hour and minute', () => {
  const { IvaUI, joins, lists } = panel();
  const drums = [{ list: 'l1', values: Array.from({ length: 24 }, (_, i) => pad(i)) }, { list: 'l2', values: Array.from({ length: 12 }, (_, i) => pad(i * 5)) }];
  IvaUI.picker('t', { kind: 'time', open: 'd1', label: 's1', rowH: 48, watch: ['a1', 'a2'], step: 5, ampm: false, value: '07:30', drums });
  assert.deepEqual([joins.a1, joins.a2, joins.s1], [7, 30, '07:30']);
  assert.equal(lists.l1.length, 24 + 4); // two blank rows either side
  IvaUI.pickerOpen('t');
  assert.equal(joins.d1, 1);
  IvaUI.drumTo('t', [8, 3]);
  IvaUI.pickerOk('t');
  assert.deepEqual([joins.a1, joins.a2, joins.s1, joins.d1], [8, 15, '08:15', 0]);
});

test('TimePicker: 12 hours and AM / PM', () => {
  const { IvaUI, joins } = panel();
  const drums = [{ list: 'l1', values: [] }, { list: 'l2', values: [] }, { list: 'l3', values: ['AM', 'PM'] }].map((d, k) => ({
    ...d, values: k === 0 ? Array.from({ length: 12 }, (_, i) => pad(i + 1)) : k === 1 ? Array.from({ length: 60 }, (_, i) => pad(i)) : d.values,
  }));
  IvaUI.picker('t', { kind: 'time', open: 'd1', label: 's1', rowH: 48, watch: ['a1', 'a2'], step: 1, ampm: true, value: '00:05', drums });
  assert.equal(joins.s1, '12:05 AM');
  IvaUI.drumTo('t', [10, 45, 1]); // 11, 45, PM
  IvaUI.pickerOk('t');
  assert.deepEqual([joins.a1, joins.a2, joins.s1], [23, 45, '11:45 PM']);
});

test('DatePicker: drums in its order, a day the month lacks becomes its last, the format', () => {
  const { IvaUI, joins } = panel();
  const drums = ['y', 'm', 'd'].map((k, i) => ({ list: `l${i}`, values: k === 'd' ? Array(31).fill('') : k === 'm' ? Array(12).fill('') : Array(11).fill('') }));
  const o = { kind: 'date', open: 'd1', label: 's1', rowH: 48, watch: ['a1', 'a2', 'a3'], order: 'ymd', minYear: 2020, format: 'D MMMM YYYY',
    months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], placeholder: 'Pick a date', value: '', drums };
  IvaUI.picker('d', o);
  assert.equal(joins.s1, 'Pick a date');
  IvaUI.drumTo('d', [4, 1, 30]); // 2024, February, 31
  IvaUI.pickerOk('d');
  assert.deepEqual([joins.a1, joins.a2, joins.a3, joins.s1], [29, 2, 2024, '29 February 2024']);
});

test('NumberField: keys within digits and decimals, the range checked on OK', () => {
  const { IvaUI, joins } = panel();
  const o = { join: 'a1', open: 'd1', label: 's1', display: 's2', error: 's3', min: -10, max: 40, decimals: 1, digits: 3, unit: '°C', value: 21.5,
    words: { invalid: 'Not a number', range: 'From -10 to 40' } };
  IvaUI.num('n', o);
  assert.equal(joins.s1, '21.5°C');
  IvaUI.numOpen('n');
  assert.equal(joins.s2, '21.5°C');
  for (const k of ['5', '5']) IvaUI.numKey('n', k); // the first key replaces the value
  IvaUI.numOk('n');
  assert.equal(joins.s3, 'From -10 to 40');
  assert.equal(joins.d1, 1);
  IvaUI.numBack('n');
  for (const k of ['-', '.', '2', '7']) IvaUI.numKey('n', k); // one decimal: the 7 is too many
  assert.equal(joins.s2, '-5.2°C');
  IvaUI.numOk('n');
  assert.deepEqual([joins.s1, joins.d1, joins.s3], ['-5.2°C', 0, '']);
});

test('SearchSelect: filters as you type, a tap picks (not a drag), options from JSON', () => {
  const { IvaUI, joins, lists, fire } = panel();
  const o = { join: 'a1', label: 's1', input: 's2', hint: 's3', none: 's4', list: 'l1', open: 'd1', row: 'row', options: [], source: 's9',
    placeholder: 'Pick one', empty: 'Nothing found' };
  IvaUI.select('c', o);
  assert.equal(joins.s1, 'Pick one');
  // the options arrive later, from a script or a feedback
  fire('join', 's9', JSON.stringify(['Berlin', 'Dublin', 'Oslo', { label: 'Lisbon' }]));
  assert.equal(lists.l1.length, 4);
  IvaUI.selectOpen('c');
  fire('input', 's2', 'li');
  assert.deepEqual(lists.l1.map((r: any) => r.s1), ['Berlin', 'Dublin', 'Lisbon']);
  // pressed, the list scrolled, let go: no pick
  IvaUI.rowDown('l1');
  fire('start', 'l1');
  IvaUI.selectPick('l1', 2);
  assert.equal(joins.d1, 1);
  // a tap
  IvaUI.rowDown('l1');
  IvaUI.selectPick('l1', 2);
  assert.deepEqual([joins.a1, joins.s1, joins.d1], [3, 'Lisbon', 0]);
  fire('input', 's2', 'zz');
  assert.equal(joins.s4, 'Nothing found');
});

test('IvaTheme: switches themes by tag, images by join, lists with the look\'s rows', async () => {
  const { CF, IvaUI, joins, lists } = panel();
  const calls: any[] = [];
  CF.setProperties = (changes: any) => calls.push(changes);
  CF.setToken = (_j: string, name: string, v: string) => (joins[`token:${name}`] = v);
  CF.modules = [];
  const data = { names: ['dark', 'light'], tags: { iva_t_a: ['btn_1', 'btn_2'] }, images: { s9: ['d.png', 'l.png'] }, files: [{}, { 'd.png': 'l.png' }], rows: [{}, { row: 'row__light' }] };
  const src = (await import('node:fs')).readFileSync(new URL('../src/compiler/themes.ts', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('return `// iva: runtime themes') + 'return `'.length, src.lastIndexOf('`;'));
  const script = body.replace('${JSON.stringify(data)}', JSON.stringify(data));
  const IvaTheme = new Function('CF', 'IvaUI', `${script}\nreturn IvaTheme;`)(CF, IvaUI);
  IvaUI.fill('l1', [{ subpage: 'row', s1: 'd.png' }]);
  (globalThis as any).IvaTheme = IvaTheme;
  try {
    IvaTheme.set('light');
    assert.deepEqual(calls[0], [{ join: 'iva_t_a', theme: 'btn_2' }]);
    assert.equal(joins.s9, 'l.png');
    assert.equal(joins['token:[iva_theme]'], 'light');
    // the list again, in the light look's rows and images
    assert.deepEqual(lists.l1, [{ subpage: 'row__light', s1: 'l.png' }]);
    assert.equal(IvaTheme.file('d.png'), 'l.png');
  } finally {
    delete (globalThis as any).IvaTheme;
  }
});

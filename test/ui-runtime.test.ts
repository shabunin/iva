import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI_RUNTIME } from '../lib/ui/runtime.ts';

/**
 * Just enough of iViewer's CF for iva-ui.js: joins, watchers, lists. A list's
 * scroll: its top row (fractional where a finger left it); listInfo gives the
 * position in rows of `rowH` GUI pixels times `scale` (a phone's iViewer
 * scales the GUI up), and counts a row above as shown by a sliver at the end.
 */
function panel({ rowH = 48, scale = 1 } = {}) {
  const joins: Record<string, any> = {};
  const watchers: { event: string; joins?: string | string[]; cb: (...a: any[]) => void }[] = [];
  const lists: Record<string, any[]> = {};
  const scrolls: [string, number][] = [];
  const tops: Record<string, number> = {};
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
    listScroll(l: string, i: number) {
      scrolls.push([l, i]);
      tops[l] = i;
    },
    listInfo(l: string, cb: any) {
      const count = lists[l]?.length ?? 0;
      const top = Math.min(tops[l] ?? 0, Math.max(0, count - 5));
      const end = top === count - 5 && top > 0;
      cb(l, count, end ? top - 1 : Math.floor(top), end ? 6 : 5, top * rowH * scale);
    },
    setProperties() {},
    log() {},
  };
  const IvaUI = new Function('CF', 'setTimeout', 'setInterval', 'clearInterval', `${UI_RUNTIME}\nreturn IvaUI;`)(
    CF, (f: () => void) => f(), () => 0, () => {});
  return { CF, IvaUI, joins, lists, scrolls, tops, fire };
}

/**
 * iViewer as a device runs a script: what the script asks comes back later,
 * on a clock of its own - a join's change event (for the script's own
 * CF.setJoin too, unless its third argument is false), CF.getJoins' answer,
 * a timer, an animation's end. echo: an event when the value changed, or on
 * every set. run() runs what's due; a script going round never settles.
 */
function device({ echo = 'change', lag = 5 }: { echo?: 'change' | 'always'; lag?: number } = {}) {
  let now = 1_000_000;
  let seq = 0;
  const tasks: { at: number; n: number; fn: () => void }[] = [];
  const later = (ms: number, fn: () => void) => {
    tasks.push({ at: now + ms, n: ++seq, fn });
    return seq;
  };
  const joins: Record<string, any> = {};
  const sets: { join: string; value: any; quiet: boolean }[] = [];
  const props: { props: any; duration: number }[] = [];
  const watchers: { event: string; joins?: string | string[]; cb: (...a: any[]) => void }[] = [];
  const fire = (event: string, join: string, ...rest: any[]) => later(lag, () => {
    for (const w of watchers) {
      if (w.event !== event) continue;
      if (w.joins && !(Array.isArray(w.joins) ? w.joins.includes(join) : w.joins === join)) continue;
      w.cb(join, ...rest);
    }
  });
  const CF: any = {
    JoinChangeEvent: 'join', PageFlipEvent: 'page', ListDidEndScrollingEvent: 'end', TopPosition: 'top', AnimationCurveLinear: 'linear', AnimationCurveEaseOut: 'out',
    setJoin(j: string, v: any, send = true) {
      const changed = String(joins[j]) !== String(v);
      joins[j] = v;
      sets.push({ join: j, value: v, quiet: send === false });
      if (send !== false && (echo === 'always' || changed)) fire('join', j, v);
    },
    // answered as they are when asked (iViewer takes a script's calls in order), the answer later
    getJoin(j: string, cb: any) {
      const v = joins[j] ?? 0;
      later(lag, () => cb(j, v));
    },
    getJoins(js: string[], cb: any) {
      const m = Object.fromEntries(js.map((j) => [j, { value: joins[j] ?? 0 }]));
      later(lag, () => cb(m));
    },
    watch(event: string, a: any, b?: any, fireNow?: boolean) {
      const cb = typeof a === 'function' ? a : b;
      const js = typeof a === 'function' ? undefined : a;
      watchers.push({ event, joins: js, cb });
      if (fireNow && js) {
        for (const j of [js].flat()) {
          const v = joins[j] ?? 0;
          later(lag, () => cb(j, v));
        }
      }
    },
    setProperties(p: any, delay = 0, duration = 0, curve?: unknown, done?: () => void) {
      props.push({ props: p, duration });
      if (done) later((delay + duration) * 1000, done);
    },
    listRemove() {},
    listAdd() {},
    listScroll() {},
    log() {},
  };
  class Clock extends Date {
    static now() { return now; }
  }
  const IvaHttp = { ready: (f: () => void) => f(), url: (path: string) => `http://127.0.0.1:8900/${path}` };
  const IvaUI = new Function('CF', 'setTimeout', 'setInterval', 'clearInterval', 'Date', 'IvaHttp', `${UI_RUNTIME}\nreturn IvaUI;`)(
    CF, (f: () => void, ms = 0) => later(ms, f), () => 0, () => {}, Clock, IvaHttp);
  /** what's due in the next ms (everything: Infinity), at most limit tasks; how many ran */
  const run = (ms = Infinity, limit = 5000) => {
    const until = now + ms;
    let ran = 0;
    for (;;) {
      tasks.sort((x, y) => x.at - y.at || x.n - y.n);
      const t = tasks[0];
      if (!t || t.at > until || ran >= limit) break;
      tasks.shift();
      now = Math.max(now, t.at);
      t.fn();
      ran++;
    }
    if (ms !== Infinity) now = Math.max(now, until);
    return ran;
  };
  /** a finger moving an element (a slider): its join set, the event later */
  const user = (j: string, v: any) => {
    joins[j] = v;
    fire('join', j, v);
  };
  return { CF, IvaUI, joins, sets, props, run, user, pending: () => tasks.length };
}

/** Tones of a table: each one's row images (normal, every other, selected) and badge. */
const TONES = Object.fromEntries(['', 'alarm', 'alarmAck', 'warning', 'warningAck', 'running', 'offline'].map((t) => [t, { rows: [`${t}0`, `${t}1`, `${t}sel`], badge: `${t}b` }]));

function table(IvaUI: any, id: string, more: Record<string, unknown> = {}) {
  IvaUI.table(id, {
    list: 'l1', row: 'row', heads: ['h1', 'h2', 'h3'], empty: 'se', titles: ['ID', 'Temp', 'State'], tones: TONES, toneKey: 'tone', count: 'sc',
    cols: [{ key: 'id' }, { key: 'temp', decimals: 1 }, { key: 'state', badge: true }], words: { rows: 'rows', of: 'of', empty: 'Nothing' }, ...more,
  });
}

const pad = (n: number) => String(n).padStart(2, '0');

test('TimePicker: the field, the drums, OK writes the hour and minute', () => {
  const { IvaUI, joins, lists } = panel();
  const drums = [{ list: 'l1', values: Array.from({ length: 24 }, (_, i) => pad(i)) }, { list: 'l2', values: Array.from({ length: 12 }, (_, i) => pad(i * 5)) }];
  IvaUI.picker('t', { kind: 'time', open: 'd1', label: 's1', rowH: 48, watch: ['a1', 'a2'], step: 5, ampm: false, value: '07:30', drums });
  assert.deepEqual([joins.a1, joins.a2, joins.s1], [7, 30, '07:30']);
  assert.equal(lists.l1.length, 24 + 5); // two blank rows before, three after
  IvaUI.pickerOpen('t');
  assert.equal(joins.d1, 1);
  IvaUI.drumTo('t', [8, 3]);
  IvaUI.pickerOk('t');
  assert.deepEqual([joins.a1, joins.a2, joins.s1, joins.d1], [8, 15, '08:15', 0]);
});

test('TimePicker: OK while a drum still turns (let go a moment ago, no end yet) takes where it has got to', () => {
  for (const scale of [1, 3]) {
    const { IvaUI, joins, tops } = panel({ scale });
    const drums = [{ list: 'l1', values: Array.from({ length: 24 }, (_, i) => pad(i)) }, { list: 'l2', values: Array.from({ length: 12 }, (_, i) => pad(i * 5)) }];
    IvaUI.picker('t', { kind: 'time', open: 'd1', label: 's1', rowH: 48, watch: ['a1', 'a2'], step: 5, ampm: false, value: '07:30', drums });
    IvaUI.pickerOpen('t');
    // flung: still turning, between rows
    tops.l1 = 13.3;
    tops.l2 = 2.8;
    IvaUI.pickerOk('t');
    assert.deepEqual([joins.a1, joins.a2, joins.s1, joins.d1], [13, 15, '13:15', 0], `scale ${scale}`);
  }
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

test('TimePicker: a drum let go at its very end gives the last value, whatever listInfo counts in', () => {
  for (const [scale, value] of [[1, '07:30'], [3, '07:30'], [2.998, '07:30'], [3, '00:00']] as const) {
    const { IvaUI, joins, fire, tops } = panel({ scale });
    const drums = [{ list: 'l1', values: Array.from({ length: 24 }, (_, i) => pad(i)) }, { list: 'l2', values: Array.from({ length: 60 }, (_, i) => pad(i)) }];
    IvaUI.picker('t', { kind: 'time', open: 'd1', label: 's1', rowH: 48, watch: ['a1', 'a2'], step: 1, ampm: false, value, drums });
    IvaUI.pickerOpen('t');
    // the minutes drum flung to its end: 65 rows, 5 shown - the top one 60 (a sliver of 59 counted as shown)
    tops.l2 = 60;
    fire('end', 'l2');
    assert.equal(tops.l2, 59, `scale ${scale}, from ${value}: turned back to the last minute`);
    fire('end', 'l2'); // the turn's own end: it stays
    assert.equal(tops.l2, 59);
    // let go between two rows: the nearer one (where the unit is known)
    tops.l1 = 13.4;
    fire('end', 'l1');
    if (value !== '00:00') assert.equal(tops.l1, 13, `scale ${scale}: the nearer hour`);
    IvaUI.pickerOk('t');
    assert.equal(joins.a2, 59, `scale ${scale}, from ${value}`);
  }
});

test('TimePicker: AM / PM - the last one can be picked', () => {
  const { IvaUI, joins, fire, tops } = panel({ scale: 3 });
  const drums = [{ list: 'l1', values: [] }, { list: 'l2', values: [] }, { list: 'l3', values: ['AM', 'PM'] }].map((d, k) => ({
    ...d, values: k === 0 ? Array.from({ length: 12 }, (_, i) => String(i + 1)) : k === 1 ? Array.from({ length: 60 }, (_, i) => pad(i)) : d.values,
  }));
  IvaUI.picker('t', { kind: 'time', open: 'd1', label: 's1', rowH: 48, watch: ['a1', 'a2'], step: 1, ampm: true, value: '10:45', drums });
  IvaUI.pickerOpen('t');
  tops.l3 = 2; // AM PM and three blanks under them: dragged as far as it goes
  fire('end', 'l3');
  assert.equal(tops.l3, 1);
  IvaUI.pickerOk('t');
  assert.equal(joins.s1, '10:45 PM');
});

test('SideMenu: a section\'s other screens (ui.Screens) light its item', () => {
  const { IvaUI, joins, fire } = panel();
  IvaUI.menu({ Overview: 'd1', Lists: 'd2' });
  fire('page', 'Overview', 'Lists / ScrollBox');
  assert.deepEqual([joins.d1, joins.d2], [0, 1]);
  fire('page', 'Lists / ScrollBox', 'Overview');
  assert.deepEqual([joins.d1, joins.d2], [1, 0]);
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

test('DataTable: rows in tones, search, sort up / down / off, a tap selects', () => {
  const { IvaUI, joins, lists, fire } = panel();
  const data = [{ id: 'P1', temp: 41.5, state: 'Running', tone: 'running' }, { id: 'B1', temp: 96.42, state: 'Overheat', tone: 'alarm' },
    { id: 'P2', temp: 22, state: 'Stopped' }];
  table(IvaUI, 't', { data, key: 'id', selected: 's9', input: 'si', hint: 'sh', placeholder: 'Search' });
  assert.deepEqual(lists.l1[1], { subpage: 'row', s20: 'alarm1', s1: 'B1', s2: '96.4', s3: 'Overheat', s23: 'alarmb' });
  assert.equal(lists.l1[2].s20, '0'); // no tone: the plain row, the first look of the pair
  assert.deepEqual([joins.sc, joins.sh], ['3 rows', 'Search']);
  fire('input', 'si', 'p');
  assert.deepEqual(lists.l1.map((r: any) => r.s1), ['P1', 'P2']);
  assert.equal(joins.sc, '2 of 3 rows');
  fire('input', 'si', '');
  IvaUI.tableSort('t', 1);
  assert.deepEqual(lists.l1.map((r: any) => r.s1), ['P2', 'P1', 'B1']);
  assert.equal(joins.h2, 'Temp \u25B2');
  IvaUI.tableSort('t', 1);
  assert.deepEqual(lists.l1.map((r: any) => r.s1), ['B1', 'P1', 'P2']);
  IvaUI.tableSort('t', 1);
  assert.deepEqual([lists.l1.map((r: any) => r.s1), joins.h2], [['P1', 'B1', 'P2'], 'Temp']);
  IvaUI.rowDown('l1');
  IvaUI.tableTap('l1', 1);
  assert.equal(joins.s9, 'B1');
  assert.equal(lists.l1[1].s20, 'alarmsel');
  fire('input', 'si', 'zz');
  assert.equal(joins.se, 'Nothing');
});

test('AlarmTable: raised by a join, acked, cleared; an acked cleared alarm goes away; the banner', () => {
  const { CF, IvaUI, joins, lists } = panel();
  table(IvaUI, 'a', { key: 'id', cols: [{ key: 'time' }, { key: 'severity', badge: true }, { key: 'source' }, { key: 'text' }, { key: 'state' }] });
  IvaUI.alarms('plant', { table: 'a', filters: ['f0', 'f1', 'f2'], summary: 'ss',
    conditions: [{ id: 'hot', join: 'd5', above: 0.5, severity: 'alarm', source: 'B1', text: 'Too hot' }] });
  const looks = { alarm: ['a0', 'a1'], warning: ['w0', 'w1'], none: ['n0'] };
  IvaUI.alarmBanner('plant', { bg: 'sb', icon: 'si', text: 'st', more: 'sm', looks, icons: { alarm: 'ia', warning: 'iw', none: 'in' } });
  const rows = () => lists.l1.map((r: any) => `${r.s3} ${r.s5}`);
  assert.deepEqual([joins.st, joins.sb, joins.f0], ['No alarms', 'n0', 1]);
  CF.setJoin('d5', 1);
  IvaUI.alarmRaise('plant', { id: 'door', severity: 'warning', source: 'Access', text: 'Door open' });
  assert.deepEqual(rows(), ['Access Active', 'B1 Active']);
  assert.equal(joins.ss, '1 alarm \u00B7 1 warning \u00B7 2 unacked');
  // the alarm before the warning, though older
  assert.deepEqual([joins.st, joins.sm, joins.sb], ['B1: Too hot', '+1 more', 'a0']);
  IvaUI.alarmAck('plant', 'hot');
  assert.equal(lists.l1[1].s20, 'alarmAck1');
  assert.equal(joins.st, 'Access: Door open');
  // cleared but not acked: it stays, grey, until acked
  IvaUI.alarmClear('plant', 'door');
  assert.deepEqual(rows(), ['Access Cleared', 'B1 Acked']);
  IvaUI.alarmFilter('plant', 2);
  assert.deepEqual([rows(), joins.f2, joins.f0], [['Access Cleared'], 1, 0]);
  IvaUI.alarmFilter('plant', 0);
  IvaUI.alarmAckAll('plant');
  assert.deepEqual(rows(), ['B1 Acked']);
  // all acked: the banner shows the active alarm, still
  assert.deepEqual([joins.st, joins.sm, joins.sb], ['B1: Too hot', '', 'a1']);
  CF.setJoin('d5', 0);
  assert.deepEqual([rows(), joins.st, joins.ss], [[], 'No alarms', '0 alarms \u00B7 0 warnings \u00B7 0 unacked']);
});

test('Pager: the page and its dot from a join, steps stop at the ends', () => {
  const { IvaUI, joins } = panel();
  IvaUI.pager('p', { join: 'a1', pages: ['d1', 'd2', 'd3'], dots: ['d11', 'd12', 'd13'], value: 1 });
  assert.deepEqual([joins.d1, joins.d2, joins.d12], [0, 1, 1]);
  IvaUI.pagerStep('p', 1);
  IvaUI.pagerStep('p', 1);
  assert.deepEqual([joins.a1, joins.d3, joins.d13, joins.d2], [2, 1, 1, 0]);
  IvaUI.pagerGo('p', 0);
  assert.deepEqual([joins.d1, joins.d11, joins.d3], [1, 1, 0]);
});

test('DragDrop: the item under the finger follows it, a target that takes it lights up, a drop writes its label and calls back', () => {
  const { CF, IvaUI, joins } = panel();
  // where things are (a page's coordinates): the area at 100, 50; items in a row; targets below
  const rects: Record<string, { x: number; y: number; w: number; h: number }> = {
    s1: { x: 100, y: 50, w: 600, h: 300 },
    d1: { x: 100, y: 50, w: 100, h: 90 }, d2: { x: 220, y: 50, w: 100, h: 90 },
    d11: { x: 100, y: 200, w: 200, h: 100 }, d12: { x: 320, y: 200, w: 200, h: 100 },
  };
  CF.getProperties = (js: string[], cb: (p: unknown[]) => void) => cb(js.map((j) => ({ join: j, ...rects[j] })));
  const moves: any[] = [];
  CF.setProperties = (p: any, _d?: number, _t?: number, _c?: string, done?: () => void) => {
    moves.push(p);
    if (done) done();
  };
  const drops: string[][] = [];
  IvaUI.dragdrop('audio', {
    area: 's1', items: [{ id: 'tv', join: 'd1' }, { id: 'radio', join: 'd2' }],
    targets: [{ id: 'living', hover: 'd11', value: 's21', hint: 's31' }, { id: 'bed', hover: 'd12', value: 's22', hint: 's32', accept: ['radio'] }],
    labels: { tv: 'TV', radio: 'Radio' }, placeholder: 'Drop here',
  }, (item: string, target: string) => drops.push([item, target]));
  assert.equal(joins.s31, 'Drop here');
  // a press on nothing: no drag
  IvaUI.ddBegin('audio', 590, 20);
  IvaUI.ddMove('audio', 100, 200);
  IvaUI.ddEnd('audio');
  assert.equal(moves.length, 0);
  // TV (area 10, 10) over the bedroom, which takes radio only: no light
  IvaUI.ddBegin('audio', 10, 10);
  assert.deepEqual(moves[0], { join: 'd1', opacity: 0.8, scale: 1.08 });
  IvaUI.ddMove('audio', 300, 200);
  assert.deepEqual(moves[1], { join: 'd1', x: 390, y: 240 });
  assert.equal(joins.d12, undefined);
  // over the living room: lit
  IvaUI.ddMove('audio', 50, 180);
  assert.equal(joins.d11, 1);
  IvaUI.ddEnd('audio');
  assert.deepEqual(drops, [['tv', 'living']]);
  assert.deepEqual([joins.s21, joins.s31], ['TV', '']);
  // it went back to where it was
  assert.ok(moves.some((m) => m.join === 'd1' && m.x === 100 && m.y === 50));
});

test('SideMenu: the page shown lit (its items in a ScrollBox\'s header subpage: the page\'s own joins)', () => {
  const { CF, IvaUI, joins, fire } = panel();
  CF.currentPage = 'A';
  IvaUI.menu({ A: 'd1', B: 'd2' });
  assert.deepEqual([joins.d1, joins.d2], [1, 0]);
  fire('page', 'A', 'B');
  assert.deepEqual([joins.d1, joins.d2], [0, 1]);
});

test('ColorPicker on the device (its own joins told back, later): a touch, the slider, a change elsewhere settle - no colour going round', () => {
  const toJoin = (v: number) => Math.round(v * 65535);
  for (const echo of ['change', 'always'] as const) {
    const d = device({ echo });
    const changes: string[] = [];
    d.IvaUI.color('lamp', { size: 210, markSize: 28, mark: 's1', v: 'a4', r: 'a1', g: 'a2', b: 'a3', hex: 's2', url: 's3', value: '#FFB000' },
      (r: number, g: number, b: number, hex: string) => changes.push(hex));
    d.run();
    assert.equal(d.pending(), 0, `${echo}: settled at start`);
    assert.deepEqual([d.joins.a1, d.joins.a2, d.joins.a3, d.joins.s2, d.joins.a4], [255, 176, 0, '#FFB000', 65535]);
    assert.equal(d.joins.s3, 'http://127.0.0.1:8900/iva-color/ffb000');

    // a touch on the wheel: green (the phone's went round, #79EE56 - #79EE57 ...); r, g, b, the hex once each
    let from = d.sets.length;
    d.IvaUI.colorTouch('lamp', 169.5, 123.7);
    d.run();
    assert.equal(d.pending(), 0, `${echo}: a touch settles`);
    const touched = [d.joins.a1, d.joins.a2, d.joins.a3];
    assert.deepEqual(touched, [130, 255, 92]);
    assert.deepEqual(d.sets.slice(from).map((x) => x.join).sort(), ['a1', 'a2', 'a3', 's2', 's3']);
    assert.deepEqual(changes.slice(1), ['#82FF5C']);

    // the slider dragged darker, its events late: never set back under the finger, the colour the last place's
    from = d.sets.length;
    for (const v of [62000, 59000, 61166 - 3000, 61166 - 1000, 61166]) {
      d.user('a4', v);
      d.run(16);
    }
    d.run();
    assert.equal(d.pending(), 0, `${echo}: the slider settles`);
    assert.ok(!d.sets.slice(from).some((x) => x.join === 'a4'), `${echo}: the slider isn't set under the finger`);
    assert.deepEqual([d.joins.a1, d.joins.a2, d.joins.a3, d.joins.s2], [121, 238, 86, '#79EE56']);
    assert.equal(d.joins.s3, 'http://127.0.0.1:8900/iva-color/79ee56');

    // r, g, b set elsewhere (a device's feedback): followed - the hex, the slider (no event) - not written back
    d.CF.setJoin('a1', 10);
    d.CF.setJoin('a2', 20);
    d.CF.setJoin('a3', 200);
    from = d.sets.length;
    d.run();
    assert.equal(d.pending(), 0, `${echo}: a change elsewhere settles`);
    assert.ok(!d.sets.slice(from).some((x) => /^a[123]$/.test(x.join)), `${echo}: not written back`);
    assert.equal(d.joins.s2, '#0A14C8');
    assert.deepEqual(d.sets.slice(from).filter((x) => x.join === 'a4').map((x) => [x.value, x.quiet]), [[toJoin(200 / 255), true]]);

    // a swatch tapped twice: the colour once
    from = d.sets.length;
    d.IvaUI.colorSet('lamp', '#FF3B30');
    d.run(50);
    d.IvaUI.colorSet('lamp', '#FF3B30');
    d.run();
    assert.equal(d.pending(), 0);
    assert.equal(d.sets.slice(from).filter((x) => x.join === 'a1').length, 1);
    assert.equal(changes.at(-1), '#FF3B30');
  }
});

test('Dial on the device: a finger\'s moves - a value at most every 40 ms and the last always, nothing shown twice, no animation under it', () => {
  const d = device();
  d.IvaUI.dial('level', { prefix: 'f_', steps: 50, sweep: 270, size: 200, min: 0, max: 100, step: 1, decimals: 0, unit: '%', join: 'a1', arc: 's1', thumb: 's2', text: 's3' });
  d.IvaUI.set('a1', 65, 0, 100);
  d.run();
  assert.deepEqual([d.joins.s1, d.joins.s3], ['f_33.png', '65 %']);
  // a finger round the ring, a move every 4 ms for 400 ms
  const at = (deg: number): [number, number] => [100 + 80 * Math.sin(deg * Math.PI / 180), 100 - 80 * Math.cos(deg * Math.PI / 180)];
  let from = d.sets.length;
  const p0 = d.props.length;
  for (let i = 0; i <= 100; i++) {
    d.IvaUI.dialTouch('level', ...at(-135 + 2.7 * i));
    d.run(4);
  }
  d.run();
  assert.equal(d.pending(), 0);
  const puts = d.sets.slice(from).filter((x) => x.join === 'a1');
  assert.ok(puts.length >= 5 && puts.length <= 12, `${puts.length} values put in 400 ms`);
  assert.deepEqual([d.joins.a1, d.joins.s1, d.joins.s3], [65535, 'f_50.png', '100 %']);
  assert.ok(d.props.slice(p0).every((p) => p.duration === 0), 'no animation under a finger');
  const frames = d.sets.slice(from).filter((x) => x.join === 's1').map((x) => x.value);
  assert.ok(frames.every((f, i) => !i || f !== frames[i - 1]), 'no frame twice in a row');
  // the finger still: nothing more
  from = d.sets.length;
  for (let i = 0; i < 10; i++) {
    d.IvaUI.dialTouch('level', ...at(135));
    d.run(10);
  }
  d.run();
  assert.equal(d.sets.length, from);
  // a step (a button) a while later: turned smoothly
  d.run(1000);
  const p1 = d.props.length;
  d.IvaUI.dialStep('level', -1);
  d.run();
  assert.deepEqual([d.joins.a1, d.joins.s3], [Math.round(0.99 * 65535), '99 %']);
  assert.equal(d.props[p1].duration, 0.12);
  // and the finger back where it was: put again
  d.IvaUI.dialTouch('level', ...at(135));
  d.run();
  assert.equal(d.joins.a1, 65535);
});

test('side menu: dragged from the edge - shown off the screen, following the finger, open or closed as let go; a swipe meanwhile is the drag\'s', () => {
  const { CF, IvaUI, joins } = panel();
  const props: { changes: any; time: number }[] = [];
  CF.setProperties = (changes: any, _delay = 0, time = 0, _curve?: unknown, done?: () => void) => {
    props.push({ changes, time });
    done?.();
  };
  const o = { join: 'd100', w: 300, panel: 'ui_menu_panel', shade: 'ui_menu_shade' };
  const at = (x: number) => [{ join: 'ui_menu_panel', x }, { join: 'ui_menu_shade', opacity: (x + 300) / 300 }];

  IvaUI.menuDrag(o, 'begin', { deltax: 0, deltay: 0 }, true);
  IvaUI.menuSwipe('d100', 1);
  assert.equal(joins.d100, undefined, 'a swipe while dragging: the drag does it');
  IvaUI.menuDrag(o, 'change', { deltax: 5, deltay: 1 }, true);
  assert.equal(joins.d100, undefined, 'not across enough yet');
  IvaUI.menuDrag(o, 'change', { deltax: 60, deltay: 4 }, true);
  // off the screen first, then shown (its transition out of sight), then where the finger is
  assert.deepEqual(props[0].changes, at(-300));
  assert.equal(joins.d100, 1);
  assert.deepEqual(props.at(-1)!.changes, at(-240));
  // let go a third of the way, slowly: closed again - hidden off the screen, then put back in place
  IvaUI.menuDrag(o, 'end', { deltax: 100, deltay: 4, velocityx: 50 }, true);
  assert.equal(joins.d100, 0);
  assert.deepEqual(props.at(-1)!.changes, at(0));

  // from the edge, flung: open
  props.length = 0;
  IvaUI.menuDrag(o, 'begin', { deltax: 0, deltay: 0 }, true);
  IvaUI.menuDrag(o, 'end', { deltax: 70, deltay: 2, velocityx: 900 }, true);
  assert.equal(joins.d100, 1);
  assert.deepEqual(props.at(-1)!.changes, at(0));
  assert.ok(props.at(-1)!.time > 0, 'slides the rest of the way');

  // open, dragged to the left: closed
  IvaUI.menuDrag(o, 'begin', { deltax: 0, deltay: 0 }, false);
  IvaUI.menuDrag(o, 'change', { deltax: -50, deltay: 3 }, false);
  assert.deepEqual(props.at(-1)!.changes, at(-50));
  IvaUI.menuDrag(o, 'end', { deltax: -200, deltay: 5, velocityx: -100 }, false);
  assert.equal(joins.d100, 0);

  // dragged on the panel itself: its coordinates go with it - the finger's way is the delta plus the panel's
  CF.setJoin('d100', 1);
  IvaUI.menuDrag(o, 'begin', { deltax: 0, deltay: 0 }, false, true);
  IvaUI.menuDrag(o, 'change', { deltax: -30, deltay: 1 }, false, true);
  assert.deepEqual(props.at(-1)!.changes, at(-30));
  // the finger 80 to the left: 50 in the panel's coordinates (it went 30 with it)
  IvaUI.menuDrag(o, 'change', { deltax: -50, deltay: 1 }, false, true);
  assert.deepEqual(props.at(-1)!.changes, at(-80));
  IvaUI.menuDrag(o, 'end', { deltax: -100, deltay: 2 }, false, true);
  assert.deepEqual(props.at(-3)!.changes, at(-180));
  assert.equal(joins.d100, 0, 'more than half way: closed');

  // up and down on it: its list's, not a drag
  props.length = 0;
  IvaUI.menuDrag(o, 'begin', { deltax: 0, deltay: 0 }, false);
  IvaUI.menuDrag(o, 'change', { deltax: 3, deltay: 30 }, false);
  IvaUI.menuDrag(o, 'end', { deltax: -40, deltay: 90 }, false);
  assert.deepEqual(props, []);
  // a swipe with no drag going on: as iViewer sees it
  IvaUI.menuSwipe('d100', 1);
  assert.equal(joins.d100, 1);
});

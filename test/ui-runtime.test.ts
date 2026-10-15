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
  const IvaUI = new Function('CF', 'setTimeout', 'setInterval', 'clearInterval', `${UI_RUNTIME}\nreturn IvaUI;`)(
    CF, (f: () => void) => f(), () => 0, () => {});
  return { CF, IvaUI, joins, lists, scrolls, fire };
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

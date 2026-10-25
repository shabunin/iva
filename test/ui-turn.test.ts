import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';
import { runPanel } from './ui-panel.ts';

/** a page of a project laid out either way (<Project orientation="both">: 1280 x 800, and 800 x 1280 turned); `width`: screen()'s */
async function both(imports: string, page: string) {
  const dir = tmpDir('iva-ui-turn-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { ${imports} } from 'iva/ui';
const { width } = screen();
export default (
  <Project name="T" width={1280} height={800} orientation="both">
    ${page}
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  assert.deepEqual(r.warnings, []);
  return r;
}
const startOf = (r: { scripts: { name: string; code?: string }[] }) => r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
const toJoin = (v: number, min: number, max: number) => Math.round(((v - min) / (max - min)) * 65535);

test('turned: a TimePicker, a NumberField and a SearchSelect as wide as the panel allows (a dropdown one way) keep what was set - their `value` not written again', async () => {
  const r = await both('TimePicker, NumberField, SearchSelect', `<Page name="F">
      <TimePicker w={width / 4} title="Wake" hour="wakeH" minute="wakeM" value="07:30" />
      <NumberField y={100} w={width / 4} join="count" value={7} mode={width > 1000 ? 'dropdown' : 'sheet'} />
      <SearchSelect y={200} w={width / 4} join="city" options={['Oslo', 'Riga', 'Turku']} value={1} mode={width > 1000 ? 'dropdown' : 'sheet'} />
    </Page>`);
  const p = runPanel(r);
  const [hour, minute, count, city] = [p.join('a', 'wakeH'), p.join('a', 'wakeM'), p.join('a', 'count'), p.join('a', 'city')];
  const values = () => [p.joins[hour], p.joins[minute], p.joins[count], p.joins[city]];
  assert.deepEqual(values(), [7, 30, toJoin(7, 0, 100), 1]);
  // set elsewhere (a script, the controller)
  p.user(hour, 6);
  p.user(minute, 15);
  p.user(count, toJoin(42, 0, 100));
  p.user(city, 2);
  for (const way of ['portrait', 'landscape', 'portrait'] as const) {
    p.turn(way);
    assert.deepEqual(values(), [6, 15, toJoin(42, 0, 100), 2], way);
  }
  // each the same one whichever way it's laid out: one field text, as set
  const start = startOf(r);
  for (const call of ['picker', 'num', 'select']) assert.equal(new Set(start.match(new RegExp(`IvaUI\\.${call}\\("\\w+"`, 'g'))).size, 1, call);
  assert.deepEqual([/_tp_text$/, /_nf_text$/, /_ss_text$/].map((re) => p.joins[p.join('s', re)]), ['06:15', '42', 'Turku']);
  // its popup a dropdown one way (as wide as its field), a sheet the other
  assert.match(r.xml, /<subpage name="ui_nf_count_\w+_320" w="320"/);
  assert.match(r.xml, /<subpage name="ui_nf_count_\w+" w="800" h="1280"/);
});

test("turned: a Segmented the other layout numbers otherwise (another pill bar before it) keeps its pick, not its `value`", async () => {
  const r = await both('Segmented', `<Page name="S">
      {width < 1000 && <Segmented options={['A', 'B']} join="extra" />}
      <Segmented y={100} w={width / 3} options={['Low', 'Mid', 'High']} join="fan" value={1} />
    </Page>`);
  assert.ok(startOf(r).includes('IvaUI.group("fan#0"') && startOf(r).includes('IvaUI.group("fan#1"'));
  const p = runPanel(r);
  const fan = p.join('a', 'fan');
  assert.equal(p.joins[fan], 1);
  p.user(fan, 2);
  p.turn('portrait');
  assert.deepEqual([p.joins[fan], p.joins[p.join('d', 'ui_fan_2')], p.joins[p.join('d', 'ui_fan_1')]], [2, 1, 0]);
  assert.equal(p.joins[p.join('a', 'extra')], 0, 'the other one picked as it starts');
});

test('turned: an AlarmTable keeps its alarms (raised by a script, acked) and its banners follow them', async () => {
  const r = await both('AlarmTable, AlarmBanner, Toggle', `<Page name="Plant">
      <AlarmBanner alarms="plant" w={width - 100} />
      <AlarmTable name="plant" y={80} w={width - 100} h={400} conditions={[{ id: 'hot', join: d('hot'), above: 0.5, text: 'Too hot', source: 'B1' }]} />
      <Toggle y={500} label="Hot" join="hot" />
    </Page>`);
  // laid out otherwise each way: set up again once turned
  assert.equal(startOf(r).match(/IvaUI\.alarms\("plant"/g)!.length, 2);
  const p = runPanel(r);
  const rows = () => p.lists[p.join('l', 'ui_al_plant_tbl')].map((row) => `${row.s4} ${row.s5}`);
  const summary = () => p.joins[p.join('s', 'ui_al_plant_summary')];
  const banner = (w: number) => p.joins[p.join('s', `ui_ab_plant_${w}_52_text`)];
  p.IvaUI.alarmRaise('plant', { id: 'p1', text: 'Pump fault', source: 'P1' });
  p.user(p.join('d', 'hot'), 1);
  p.IvaUI.alarmAck('plant', 'hot');
  assert.deepEqual(rows(), ['Too hot Acked', 'Pump fault Active']);
  assert.equal(banner(1180), 'P1: Pump fault');
  p.turn('portrait');
  assert.deepEqual(rows(), ['Too hot Acked', 'Pump fault Active']);
  assert.equal(summary(), '2 alarms · 0 warnings · 1 unacked');
  assert.equal(banner(700), 'P1: Pump fault');
  // the banner shown follows what comes after the turn
  p.IvaUI.alarmRaise('plant', { id: 'p2', text: 'Valve stuck', source: 'V2' });
  assert.equal(banner(700), 'V2: Valve stuck');
  assert.equal(summary(), '3 alarms · 0 warnings · 2 unacked');
  // the condition's watcher once: back to normal, the acked alarm goes
  p.user(p.join('d', 'hot'), 0);
  assert.deepEqual(rows(), ['Valve stuck Active', 'Pump fault Active']);
  p.turn('landscape');
  assert.deepEqual([rows(), banner(1180)], [['Valve stuck Active', 'Pump fault Active'], 'V2: Valve stuck']);
});

test("turned: Screens' tabs keep the screen shown, and a screen's Pager pages show as its own join has them", async () => {
  const r = await both('Screens, Pager', `<Screens name="Rooms" screens={[
      { title: 'One', content: <Text y={140} w={200} h={30} text="one" /> },
      { title: 'Two', content: <Pager join="pg" x={16} y={140} w={width - 32} h={300}><Text w={100} h={30} text="a" /><Text w={100} h={30} text="b" /></Pager> },
    ]} />`);
  assert.equal(startOf(r).match(/IvaUI\.tabs\("Rooms"/g)!.length, 2);
  const p = runPanel(r);
  const mirrors = () => [p.joins[p.join('d', 'ui_tabs_Rooms_own0')], p.joins[p.join('d', 'ui_tabs_Rooms_own1')]];
  p.turn('portrait');
  p.IvaUI.tab('Rooms', 1);
  p.run();
  assert.deepEqual(mirrors(), [1, 0], "the pager's first page, with its screen");
  // swiped: its own joins change, the mirrors follow
  p.IvaUI.pagerGo('pg', 1);
  p.run();
  assert.deepEqual(mirrors(), [0, 1]);
  p.turn('landscape');
  p.IvaUI.pagerGo('pg', 0);
  p.run();
  assert.deepEqual(mirrors(), [1, 0]);
  p.IvaUI.tab('Rooms', 0);
  p.run();
  assert.deepEqual(mirrors(), [0, 0], 'away with its screen');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';
import { runPanel, type PanelOptions } from './ui-panel.ts';

async function build(page: string) {
  const dir = tmpDir('iva-ui-follow-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Stepper, WeekDays, AlarmCard } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">${page}</Page>
  </Project>
);
`);
  return compile(path.join(dir, 'app.jsx'));
}
const toJoin = (v: number, min: number, max: number) => Math.round(((v - min) / (max - min)) * 65535);
/** the panel started with joins the controller has set already (by the project's names) */
function started(r: Awaited<ReturnType<typeof build>>, before: Record<string, [kind: 'a' | 'd', value: number]>, opts: PanelOptions = {}) {
  const joins = Object.fromEntries(Object.entries(before).map(([name, [kind, v]]) => [`${kind}${r.joins[kind === 'a' ? 'analog' : 'digital'][name]}`, v]));
  return runPanel(r, { ...opts, joins });
}

for (const echo of ['change', 'always'] as const) {
  test(`Stepper: shows its join as the controller has it, and steps from there - a value set elsewhere too; no value written unless given (told: ${echo})`, async () => {
    const r = await build(`<Stepper join="setpoint" min={10} max={30} step={0.5} decimals={1} unit="°C" />
      <Stepper y={100} join="level" value={21.3} min={10} max={30} step={0.5} decimals={1} />`);
    const p = started(r, { setpoint: ['a', toJoin(20, 10, 30)] }, { echo });
    const [setpoint, text] = [p.join('a', 'setpoint'), p.join('s', 'ui_setpoint_value')];
    assert.deepEqual([p.joins[setpoint], p.joins[text]], [toJoin(20, 10, 30), '20.0°C']);
    // IvaUI.set, a feedback, a slider on the join
    p.IvaUI.set(setpoint, 25, 10, 30);
    p.run();
    assert.equal(p.joins[text], '25.0°C');
    p.IvaUI.step('setpoint', 1);
    p.run();
    assert.deepEqual([p.joins[setpoint], p.joins[text]], [toJoin(25.5, 10, 30), '25.5°C']);
    // a value given: written as it starts, on a step
    assert.deepEqual([p.joins[p.join('a', 'level')], p.joins[p.join('s', 'ui_level_value')]], [toJoin(21.5, 10, 30), '21.5']);
  });

  test(`WeekDays: the days lit as the mask has it, set elsewhere too; a tap sets the mask; no value written unless given (told: ${echo})`, async () => {
    const r = await build(`<WeekDays join="days" textJoin={s('daysText')} />
      <WeekDays y={100} join="other" value={65} />`);
    const p = started(r, { days: ['a', 96] }, { echo });
    const mask = p.join('a', 'days');
    const lit = () => [0, 1, 2, 3, 4, 5, 6].map((i) => p.joins[p.join('d', `ui_days_day${i}`)]).join('');
    assert.deepEqual([p.joins[mask], lit(), p.joins[p.join('s', 'daysText')]], [96, '0000011', 'Weekend']);
    p.user(mask, 31);
    assert.deepEqual([lit(), p.joins[p.join('s', 'daysText')]], ['1111100', 'Weekdays']);
    // a tap on Saturday (the button toggles its join)
    p.user(p.join('d', 'ui_days_day5'), 1);
    assert.deepEqual([p.joins[mask], lit(), p.joins[p.join('s', 'daysText')]], [63, '1111110', 'Mon, Tue, Wed, Thu, Fri, Sat']);
    assert.equal(p.joins[p.join('a', 'other')], 65);
  });
}

test('WeekDays on the device (what the script sets told back later): its value as it starts, quick taps - none undone by an old event', async () => {
  const r = await build(`<WeekDays join="days" value={31} textJoin={s('daysText')} />`);
  const p = runPanel(r, { lag: true });
  const mask = p.join('a', 'days');
  const day = (i: number) => p.join('d', `ui_days_day${i}`);
  const lit = () => [0, 1, 2, 3, 4, 5, 6].map((i) => p.joins[day(i)]).join('');
  assert.deepEqual([p.joins[mask], lit(), p.joins[p.join('s', 'daysText')]], [31, '1111100', 'Weekdays']);
  // two taps before either is told back
  p.CF.setJoin(day(0), 0);
  p.CF.setJoin(day(6), 1);
  p.run();
  assert.deepEqual([p.joins[mask], lit()], [94, '0111101']);
  assert.equal(p.pending(), 0);
});

test('AlarmCard: the time and the days as the controller has them - none written unless given', async () => {
  const r = await build(`<AlarmCard title="Wake up" on="wakeOn" hour="alarmH" minute="alarmM" days="wakeDays" />`);
  const p = started(r, { alarmH: ['a', 6], alarmM: ['a', 45], wakeDays: ['a', 96] });
  assert.deepEqual([p.joins[p.join('a', 'alarmH')], p.joins[p.join('a', 'alarmM')], p.joins[p.join('a', 'wakeDays')]], [6, 45, 96]);
  assert.deepEqual([p.joins[p.join('s', /_tp_text$/)], p.joins[p.join('s', 'ui_wakeDays_summary')]], ['06:45', 'Weekend']);
});

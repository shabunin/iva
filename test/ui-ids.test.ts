import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';
import { runPanel } from './ui-panel.ts';

async function build(app: string) {
  const dir = tmpDir('iva-ui-ids-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), app);
  return compile(path.join(dir, 'app.jsx'));
}
const pageOf = (xml: string, name: string) => new RegExp(`<page name="${name}"[\\s\\S]*?</page>`).exec(xml)![0];

test('PinPad: two laid out alike (the same place in cards alike, two pages) are two - each shows its own digits, OK runs its own onEnter', async () => {
  const r = await build(`import { Card, PinPad } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="Alarm"><Card x={40} y={100}><PinPad x={20} y={60} code={s('alarmCode')} onEnter="Alarm.arm(code)" /></Card></Page>
    <Page name="Door"><Card x={40} y={100}><PinPad x={20} y={60} onEnter="Door.unlock(code)" /></Card></Page>
  </Project>
);
`);
  // the pad an OK button on the page is for
  const pad = (page: string) => /js="IvaUI\.pinEnter\(&quot;(\w+)&quot;\)"/.exec(pageOf(r.xml, page))![1];
  const alarm = pad('Alarm');
  const door = pad('Door');
  const calls: string[] = [];
  const p = runPanel(r, { globals: { Alarm: { arm: (c: string) => calls.push(`arm ${c}`) }, Door: { unlock: (c: string) => calls.push(`unlock ${c}`) } } });
  const shown = (id: string) => p.joins[p.join('s', `ui_${id}_display`)];
  p.IvaUI.pinKey(alarm, '1');
  p.IvaUI.pinKey(alarm, '2');
  assert.deepEqual([shown(alarm), shown(door)], ['••', 'Enter code']);
  p.IvaUI.pinEnter(alarm);
  assert.deepEqual(calls, ['arm 12']);
  assert.equal(p.joins[p.join('s', 'alarmCode')], '12');
  p.IvaUI.pinKey(door, '7');
  p.IvaUI.pinEnter(door);
  assert.deepEqual(calls, ['arm 12', 'unlock 7']);
  assert.notEqual(alarm, door);
  // the same pad on two pages (what it does the same): one, set up once
  const twice = await build(`import { PinPad } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="A"><PinPad onEnter="Door.unlock(code)" /></Page>
    <Page name="B"><PinPad x={300} onEnter="Door.unlock(code)" /></Page>
  </Project>
);
`);
  assert.equal(twice.scripts.find((s) => s.name === 'iva-start.js')!.code!.match(/IvaUI\.pin\(/g)!.length, 1);
});

test('DataTable: two with the same columns and their own rows and onSelect are two - each list its rows, a tap its own onSelect', async () => {
  const r = await build(`import { DataTable } from 'iva/ui';
const columns = [{ key: 'name', title: 'Name' }, { key: 'state', title: 'State' }];
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="Rooms"><DataTable columns={columns} keyField="name" data={[{ name: 'Kitchen', state: 'On' }]} onSelect="Rooms.open(row.name)" /></Page>
    <Page name="Pumps"><DataTable columns={columns} keyField="name" data={[{ name: 'Pump 1', state: 'Running' }]} onSelect="Pumps.open(row.name)" /></Page>
  </Project>
);
`);
  // the table a header on the page sorts
  const table = (page: string) => /js="IvaUI\.tableSort\(&quot;(\w+)&quot;, 0\)"/.exec(pageOf(r.xml, page))![1];
  const rooms = table('Rooms');
  const pumps = table('Pumps');
  const opened: string[] = [];
  const p = runPanel(r, { globals: { Rooms: { open: (n: string) => opened.push(`room ${n}`) }, Pumps: { open: (n: string) => opened.push(`pump ${n}`) } } });
  const list = (id: string) => p.join('l', `ui_${id}_tbl`);
  assert.deepEqual(p.lists[list(rooms)].map((row) => row.s1), ['Kitchen']);
  assert.deepEqual(p.lists[list(pumps)].map((row) => row.s1), ['Pump 1']);
  p.IvaUI.rowDown(list(rooms));
  p.IvaUI.tableTap(list(rooms), 0);
  assert.deepEqual(opened, ['room Kitchen']);
  assert.notEqual(rooms, pumps);
});

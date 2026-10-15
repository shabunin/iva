import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { check } from '../src/check.ts';

const GALLERY = path.resolve(import.meta.dirname, '../examples/gallery/app.jsx');

test('the iva/ui gallery builds: one runtime script, the shared subpages once', async () => {
  const r = await compile(GALLERY);
  assert.deepEqual(r.scripts.map((s) => s.name), ['iva-joins.js', 'iva-ui.js', 'iva-themes.js', 'iva-start.js']);
  // every script the panel gets is valid JavaScript
  for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaUI\.menu\(/g)!.length, 1); // the side menu is on every page, set up once
  assert.equal(start.match(/IvaUI\.clock\(/g)!.length, 1);
  assert.equal((r.xml.match(/<subpage name="ui_menu" w=/g) ?? []).length, 1);
  // placed on every page
  assert.equal((r.xml.match(/<subpage name="ui_menu" x=/g) ?? []).length, (r.xml.match(/<page name=/g) ?? []).length);
  assert.deepEqual(r.warnings, []);
});

test('iva/ui props are checked in the editor', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-ui-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Tile } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P"><Tile icon="tv" titel="TV" /></Page>
  </Project>
);
`);
  const c = await check(path.join(dir, 'app.jsx'));
  assert.ok(c.problems.some((p) => /'titel' does not exist.*Did you mean 'title'\?/s.test(p)), c.problems.join('\n'));
});

test('Dial: a track with gestures, arc frames named for the look, a thumb, its setup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-dial-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Dial, Knob } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <Dial join="level" value={65} steps={10} size={200} />
      <Dial x={300} join="other" steps={10} size={200} />
      <Knob x={600} join="vol" min={-10} max={10} step={1} />
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const frames = r.assets.filter((x) => /^iva_dial_\w+_\d+\.png$/.test(x.name));
  assert.equal(frames.length, 11); // 0..10, shared by the two dials that look the same
  assert.equal(r.assets.filter((x) => /^iva_dial_\w+_\d+@2x\.png$/.test(x.name)).length, 11);
  assert.equal((r.xml.match(/<gesture /g) ?? []).length, 6); // tap + pan on each control's ring
  assert.match(r.xml, /js="IvaUI\.dialTouch\(&quot;level&quot;, gesture\.x, gesture\.y\)"/);
  // every frame named in the .gui (in a hidden subpage), so it ships with the project
  assert.equal((r.xml.match(/<subpage name="ui_frames_iva_dial_\w+_" w=/g) ?? []).length, 1);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaUI\.dial\(/g)!.length, 3);
  assert.match(start, /IvaUI\.set\(Joins\.a\["level"\], 65, 0, 100\)/);
});

test('forms, lists, schedule: popups last, list rows defined, icons drawn at their size', async () => {
  const r = await compile(GALLERY);
  const gui = r.xml;
  const forms = gui.slice(gui.indexOf('<page name="Forms"'), gui.indexOf('</page>', gui.indexOf('<page name="Forms"')));
  const placed = [...forms.matchAll(/<subpage name="([^"]+)" x=/g)].map((m) => m[1]);
  // the select sheets / dropdowns after the page's other subpages (the menu is placed by the Shell at the end too)
  assert.ok(placed.indexOf('ui_select_fan') > placed.indexOf('ui_menu'), placed.join(', '));
  assert.match(gui, /<subpage name="ui_dl_560_row" w="560"/);
  assert.doesNotMatch(gui, /<subpage name="ui_dl_560_row" x=/);
  const icon = r.assets.find((a) => /^iva_icon_\w+\.png$/.test(a.name))!;
  assert.equal(icon.data!.readUInt32BE(16), 26);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  for (const f of ['IvaUI.fill(', 'IvaUI.days(', 'IvaUI.pin(']) assert.ok(start.includes(f), f);
  // an alarm's time is a TimePicker
  assert.match(start, /IvaUI\.picker\("time_alarmH_\w+", \{ kind: 'time'/);
  assert.match(start, /IvaUI\.picker\("time_weekendH_\w+", \{ kind: 'time'[^\n]*step: 15, ampm: true/);
});

test('ColorPicker, TextField, SearchSelect: wheel and marker in a subpage, the swatch server once, inputs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-ui-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { ColorPicker, TextField, SearchSelect } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <ColorPicker r="r1" g="g1" b="b1" />
      <ColorPicker x={400} r="r2" g="g2" b="b2" value="#FF0000" swatches={false} />
      <TextField y={400} join="name" placeholder="Your name" />
      <SearchSelect y={500} options={['Oslo', 'Riga']} join="city" value={1} />
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  // one HTTP server for both pickers, answering requests that end in a blank line
  assert.equal((r.xml.match(/<system name="IvaUI HTTP 8890" /g) ?? []).length, 1);
  assert.match(r.xml, /<fb name="request" regex="\(\?msi\)\^\.\*\?\\r\\n\\r\\n"/);
  assert.match(r.xml, /<subpage name="ui_cp_r1" w="210" h="210"/);
  assert.match(r.xml, /<web [^>]*url="http:\/\/127\.0\.0\.1:8890\/iva-color\/000000"/);
  assert.ok(r.assets.some((a) => /^iva_wheel_\w+\.png$/.test(a.name)));
  assert.equal((r.xml.match(/<input /g) ?? []).length, 2);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  for (const f of ['IvaUI.color(', 'IvaUI.hint(', 'IvaUI.select(']) assert.ok(start.includes(f), f);
  for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  assert.deepEqual(r.warnings, []);
});

test('pickers: drum lists with their rows, popups last, a popup each for pickers that look different', async () => {
  const r = await compile(GALLERY);
  const pickers = r.xml.slice(r.xml.indexOf('<page name="Pickers"'), r.xml.indexOf('</page>', r.xml.indexOf('<page name="Pickers"')));
  // the drum rows: defined once per width, a tap is a release (a drag isn't a tap)
  assert.equal((r.xml.match(/<subpage name="ui_drum_84_48" w=/g) ?? []).length, 1);
  assert.match(r.xml, /<subpage name="ui_drum_84_48"[\s\S]*?<press [^>]*js="IvaUI.rowDown\(list\)"[\s\S]*?<release [^>]*js="IvaUI.drumTap\(list, listIndex\)"/);
  // two time pickers on the wake-up joins that look different: two popups
  assert.equal((pickers.match(/<subpage name="ui_tp_wakeH_\w+" x=/g) ?? []).length, 2);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  for (const f of ["kind: 'time'", "kind: 'date'", 'IvaUI.num(', 'IvaUI.select(']) assert.ok(start.includes(f), f);
  assert.deepEqual(r.warnings, []);
});

test('Tables and navigation: row subpages, tone images shipped, setup for each', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-tables-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { DataTable, AlarmTable, AlarmBanner, Breadcrumbs, Loader, Pager } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <DataTable name="plant" keyField="id" selected="equipment" toneKey="tone" w={800} h={300}
        columns={[{ key: 'id', title: 'ID', w: 80 }, { key: 'temp', title: 'Temp', align: 'right', decimals: 1 }, { key: 'state', title: 'State', badge: true }]}
        data={[{ id: 'P1', temp: 41.5, state: 'Running', tone: 'running' }]} />
      <AlarmTable name="plant_alarms" y={320} w={800} h={300} conditions={[{ id: 'hot', join: 'hot', above: 0.5, severity: 'alarm', text: 'Hot' }]} />
      <AlarmBanner alarms="plant_alarms" y={640} w={800} page="P" />
      <Breadcrumbs x={850} items={[{ label: 'Home', page: 'P' }, 'Kitchen']} back />
      <Loader join="busy" text="Working…" />
      <Pager join="pg" x={850} y={100} w={400} h={200}>
        <Text w={400} h={200} text="one" />
        <Text w={400} h={200} text="two" />
      </Pager>
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  assert.deepEqual(r.warnings, []);
  for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  for (const call of ['IvaUI.table(', 'IvaUI.alarms(', 'IvaUI.alarmBanner(', 'IvaUI.loader(', 'IvaUI.pager(']) assert.ok(start.includes(call), call);
  // rows come from a subpage of their own; each table's tone images ship in a hidden one
  for (const sp of ['ui_tbl_al_plant_alarms_row', 'ui_tbl_al_plant_alarms_images', 'ui_loader_busy', 'ui_pg_pg_0', 'ui_pg_pg_1']) {
    assert.match(r.xml, new RegExp(`<subpage name="${sp}" w=`), sp);
  }
  const rows = new Set([...start.matchAll(/iva_row_\w+\.png/g)].map((m) => m[0]));
  assert.ok(rows.size > 10);
  for (const f of rows) assert.ok(r.assets.some((a) => a.name === f), f);
  // the back arrow and the link are buttons to pages; the last crumb is text
  assert.match(r.xml, /<btn [^>]*flip="Return"/);
  assert.match(r.xml, /<btn [^>]*flip="P"[^>]*>\s*<inactive [^>]*>Home</);
  assert.match(r.xml, />Kitchen</);
});

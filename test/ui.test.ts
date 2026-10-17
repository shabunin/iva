import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { layoutGrid } from '../lib/ui/index.tsx';
import { check } from '../src/check.ts';
import { tmpDir } from './tmp.ts';

const GALLERY = path.resolve(import.meta.dirname, '../examples/gallery/app.jsx');

test('the iva/ui gallery builds: one runtime script, the shared subpages once', async () => {
  const r = await compile(GALLERY);
  assert.deepEqual(r.scripts.map((s) => s.name), ['iva-joins.js', 'iva-ui.js', 'iva-http.js', 'net.js', 'lists.js', 'plant.js', 'animations.js', 'gestures.js', 'network.js', 'iva-themes.js', 'iva-start.js']);
  // every script the panel gets is valid JavaScript
  for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaUI\.menu\(/g)!.length, 1); // the side menu is on every page, set up once
  assert.equal(start.match(/IvaUI\.clock\(/g)!.length, 1);
  assert.equal((r.xml.match(/<subpage name="ui_menu" w=/g) ?? []).length, 1);
  // placed on every page
  assert.equal((r.xml.match(/<subpage name="ui_menu" x=/g) ?? []).length, (r.xml.match(/<page name=/g) ?? []).length);
  // the live list: a row held 700 ms goes (a hold action on a button over the row), no swipe to delete
  const liveRow = /<subpage name="gallery_live_row" w="\d+" h="56"[\s\S]*?<\/subpage>/.exec(r.xml)![0];
  assert.match(liveRow, /<btn j="0" [^>]*>\s*<actions>\s*<action>\s*<press delay="0" hold="0" repeat="0" js="GalleryList\.tap\(\)" \/>\s*<press delay="0" hold="700" repeat="0" js="GalleryList\.arm\(list, listIndex\)" \/>/, 'the row: a tap, a hold');
  assert.match(liveRow, /<btn j="4" [^>]*>\s*<actions>\s*<action>\s*<press delay="0" hold="0" repeat="0" js="GalleryList\.del\(list, listIndex, value\)" \/>\s*<press delay="0" hold="700" repeat="0" js="GalleryList\.arm\(list, listIndex\)" \/>/, 'Delete: on the item\'s join 4');
  assert.match(r.xml, new RegExp(`<list [^>]*j="${r.joins.list.liveRooms}"[^>]*swipedelete="0"`));
  assert.deepEqual(r.warnings, []);
  // the phone: what a list can't hold on screens of their own - nothing in a list it can't show
  const phone = await compile(GALLERY, { size: '1400x1400@3x' });
  assert.deepEqual(phone.warnings, []);
  // a section's screens: subpages on its one page, not pages of their own
  assert.ok(phone.xml.includes('<subpage name="ui_screen_Lists_0" x="0" y="0"') && phone.xml.includes('<subpage name="ui_screen_Lists_1" x="0" y="0"'));
  assert.doesNotMatch(phone.xml, /<page name="Lists \//);
  // the colour picker's wheel (a subpage of its own, no join: it clips the marker) on the page, on its tab's join - not over every tab
  assert.match(phone.xml, new RegExp(`<subpage name="ui_cp_lampR" x="\\d+" y="\\d+" j="${phone.joins.digital.ui_tabs_Devices_1}" `));
});

test('iva/ui props are checked in the editor', async () => {
  const dir = tmpDir('iva-ui-');
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

test('Knob: ticks with gestures and a knob, drawn once per look and named for it; its setup; no Dial (its 51 arc frames) any more', async () => {
  const dir = tmpDir('iva-knob-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Knob } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <Knob join="level" value={65} size={200} label="Level" />
      <Knob x={300} join="other" size={200} />
      <Knob x={600} join="vol" min={-10} max={10} step={1} size={150} />
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  // a knob's two drawings in a folder of its own, named after it - one folder for the two that look the same
  // (named after the first); the smaller one's in its own. 1x and @2x each: eight images, not frames
  for (const f of ['knobs/level/ticks.png', 'knobs/level/knob.png', 'knobs/level/ticks@2x.png', 'knobs/vol/ticks.png', 'knobs/vol/knob.png']) assert.ok(r.assets.some((x) => x.name === f), f);
  assert.ok(!r.assets.some((x) => x.name.startsWith('knobs/other')));
  assert.equal(r.assets.filter((x) => x.name.startsWith('knobs/')).length, 8);
  assert.ok(!r.assets.some((x) => x.name.startsWith('dials/')));
  assert.equal((r.xml.match(/<gesture /g) ?? []).length, 6); // tap + pan on each knob
  assert.match(r.xml, /<gesture name="tap gesture" [^>]*>\s*<action phase="begin" js="IvaUI\.dialTouch\(&quot;level&quot;, gesture\.x, gesture\.y, &quot;tap&quot;\)"/);
  assert.match(r.xml, /js="IvaUI\.dialTouch\(&quot;level&quot;, gesture\.x, gesture\.y, &quot;pan&quot;\)"/);
  assert.doesNotMatch(r.xml, /ui_frames_/);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaUI\.dial\(/g)!.length, 3);
  assert.match(start, /IvaUI\.set\(Joins\.a\["level"\], 65, 0, 100\)/);
  assert.doesNotMatch(start, /prefix|steps|arc/);
  // Dial is gone from iva/ui
  fs.writeFileSync(path.join(dir, 'old.jsx'), `import { Dial } from 'iva/ui';
export default <Project name="T" width={100} height={100}><Page name="P"><Dial join="x" /></Page></Project>;
`);
  await assert.rejects(compile(path.join(dir, 'old.jsx')), /Dial/);
});

test('forms, lists, schedule: popups last, list rows defined, icons drawn at their size', async () => {
  const r = await compile(GALLERY);
  const gui = r.xml;
  const forms = gui.slice(gui.indexOf('<page name="Forms"'), gui.indexOf('</page>', gui.indexOf('<page name="Forms"')));
  const placed = [...forms.matchAll(/<subpage name="([^"]+)" x=/g)].map((m) => m[1]);
  // the select sheets / dropdowns after the page's other subpages (the menu is placed by the Shell at the end too)
  assert.ok(placed.indexOf('ui_select_fan') > placed.indexOf('ui_menu'), placed.join(', '));
  assert.match(gui, /<subpage name="ui_dl_360_row" w="360"/);
  assert.doesNotMatch(gui, /<subpage name="ui_dl_360_row" x=/);
  // a list's icons by name (else with their colour, their size): drawn at the size they're shown
  const icon = r.assets.find((a) => /^icons\/lightbulb-\w+-26\.png$/.test(a.name))!;
  assert.equal(icon.data!.readUInt32BE(16), 26);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  for (const f of ['IvaUI.fill(', 'IvaUI.days(', 'IvaUI.pin(']) assert.ok(start.includes(f), f);
  // an alarm's time is a TimePicker
  assert.match(start, /IvaUI\.picker\("time_alarmH_\w+", \{ kind: 'time'/);
  assert.match(start, /IvaUI\.picker\("time_weekendH_\w+", \{ kind: 'time'[^\n]*step: 15, ampm: true/);
});

test('ColorPicker, TextField, SearchSelect: wheel and marker in a subpage, swatches on the panel\'s web server, inputs', async () => {
  const dir = tmpDir('iva-ui-');
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
  // the panel's one web server for both swatches, answering requests that end in a blank line
  assert.equal((r.xml.match(/<system name="IvaWeb" [^>]*port="8900"/g) ?? []).length, 1);
  assert.match(r.xml, /<fb name="request" regex="\(\?msi\)\^\.\*\?\\r\\n\\r\\n"/);
  assert.match(r.xml, /<subpage name="ui_cp_r1" w="210" h="210"/);
  // the swatches' web views: their own URL joins, set once the server answers (the colour then)
  assert.equal((r.xml.match(/<web [^>]*j="\d+"[^>]*url=""/g) ?? []).length, 2);
  // its drawings in a folder of its own, named after it (its join): the wheel, the marker, the swatch's frame
  for (const f of ['pickers/r1/wheel.png', 'pickers/r1/marker.png', 'pickers/r1/frame.png']) assert.ok(r.assets.some((a) => a.name === f), f);
  assert.equal((r.xml.match(/<input /g) ?? []).length, 2);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  for (const f of ['IvaHttp.web("IvaWeb", 8900);', 'IvaUI.color(', 'IvaUI.hint(', 'IvaUI.select(']) assert.ok(start.includes(f), f);
  assert.equal(start.match(/IvaHttp\.view\(Joins\.s\["ui_\w+_cp_url"\], "iva-color\/000000"\);/g)!.length, 2);
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
  const dir = tmpDir('iva-tables-');
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
  const rows = new Set([...start.matchAll(/rows\/[\w-]+\.png/g)].map((m) => m[0]));
  assert.ok(rows.size > 10);
  for (const f of rows) assert.ok(r.assets.some((a) => a.name === f), f);
  // the back arrow and the link are buttons to pages; the last crumb is text
  assert.match(r.xml, /<btn [^>]*flip="Return"/);
  assert.match(r.xml, /<btn [^>]*flip="P"[^>]*>\s*<inactive [^>]*>Home</);
  assert.match(r.xml, />Kitchen</);
});

test('DragDrop: targets, then items over them, then the gesture layer over all; its setup', async () => {
  const dir = tmpDir('iva-dd-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { DragDrop } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <DragDrop name="audio" x={20} y={40} w={800} h={260} onDrop="go(item, target)"
                items={[{ id: 'tv', label: 'TV', icon: 'tv' }, { id: 'radio', label: 'Radio' }]}
                targets={[{ id: 'living', label: 'Living', value: s('zoneLiving') }, { id: 'bed', label: 'Bed', accept: ['radio'] }]} />
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  assert.deepEqual(r.warnings, []);
  const page = r.xml.slice(r.xml.indexOf('<page name="P"'));
  const at = (re: RegExp) => page.search(re);
  // targets (their buttons), the items' buttons after them, the layer with the pan last
  assert.ok(at(/<btn [^>]*x="20" y="164"/) < at(/<btn [^>]*x="20" y="40"/));
  assert.ok(at(/<btn [^>]*x="20" y="40"/) < at(/<img x="20" y="40" w="800" h="260"[^>]*>[^<]*<gesture [^>]*type="pan"/));
  assert.match(page, /<action phase="begin" js="IvaUI\.ddBegin\(&quot;audio&quot;, gesture\.startx, gesture\.starty\)"/);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.match(start, /IvaUI\.dragdrop\("audio", \{ area: Joins\.s\["ui_dd_audio"\], items: \[\{ id: "tv", join: Joins\.d\["ui_dd_audio_i_tv"\] \}/);
  assert.match(start, /\{ id: "bed", hover: Joins\.d\["ui_dd_audio_t_bed"\], accept: \["radio"\] \}/);
  assert.match(start, /function \(item, target\) \{ go\(item, target\) \}\);/);
});

test('ScrollBox with children: a list whose header subpage they are (no rows to fill, the page\'s own joins); sheets on the page; ScrollArea', async () => {
  const dir = tmpDir('iva-scroll-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { ScrollBox, ScrollArea, NavCard, SideMenu, SelectBox, Toggle } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <ScrollBox x={20} y={100} w={600} h={300}>
        <NavCard y={0} w={295} h={180} icon="tv" title="One" page="P" />
        <NavCard y={200} w={295} h={180} icon="tv" title="Two" page="P" />
      </ScrollBox>
      <SideMenu title="Menu" items={[{ icon: 'house', text: 'Home', page: 'P' }]} />
    </Page>
    <Page name="Q">
      <ScrollArea>
        <Toggle y={100} label="Lamp" join="lamp" />
        <SelectBox y={700} w={300} options={['a', 'b']} join="pick" />
        <Toggle y={1500} label="Fan" join="fan" />
      </ScrollArea>
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  assert.match(r.xml, /<subpage name="ui_scroll_\w+" w="600" h="380"/);
  assert.match(r.xml, /<list j="0" x="20" y="100" w="600" h="300" headerSub="ui_scroll_\w+" titleSub="" contentSub="" footerSub=""/);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.doesNotMatch(start, /IvaUI\.fill\(/);
  // the menu's items in a ScrollBox: lit by their own joins
  assert.match(start, /IvaUI\.menu\(\{ "P": Joins\.d\["ui_menu_P"\] \}\);/);
  // the page that goes further down than the panel: a list below the header, its content as on the page, the sheet on the page
  assert.match(r.xml, /<list j="0" x="0" y="72" w="1280" h="728" headerSub="(ui_scroll_\w+)"/);
  const area = /<list j="0" x="0" y="72" w="1280" h="728" headerSub="(ui_scroll_\w+)"/.exec(r.xml)![1];
  const content = new RegExp(`<subpage name="${area}" w="1280" h="(\\d+)"[^>]*>([\\s\\S]*?)</subpage>`).exec(r.xml)!;
  assert.equal(Number(content[1]), 1500 + 48 + 16 - 72);
  assert.match(content[2], /<txt [^>]*y="28"[^>]*>Lamp</);
  assert.doesNotMatch(content[2], /ui_select_pick/);
  assert.match(r.xml, /<page name="Q"[\s\S]*?<subpage [^>]*name="ui_select_pick"[\s\S]*?<\/page>/);
});

test('Screens: one page, a full-size subpage a tab on its join; transparent tabs over a pill that slides to the one tapped; subpages the content places go on the page, as the tab\'s own', async () => {
  const dir = tmpDir('iva-screens-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { ui } from 'iva/ui';
const A = ui.screenArea;
export default (
  <Project name="T" width={1280} height={800}>
    <ui.Screens name="Lists" shell={<ui.Header title="T" />} transition={{ type: 'push', from: 'right', time: 0.3 }} tabTransition={{ type: 'fade', time: 0.15 }} screens={[
      { title: 'Rows', content: <ui.DataList {...A} join="rows" items={[{ title: 'one' }]} /> },
      { title: 'Long', content: <><ui.Toggle y={A.y} label="Lamp" join="lamp" /><ui.Toggle y={1500} label="Fan" join="fan" /></> },
      { title: 'Pages', content: <ui.Pager {...A} join="page"><Group /><Group /></ui.Pager> },
    ]} />
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  // one page, with the section's own transition
  assert.deepEqual([...r.xml.matchAll(/<page name="([^"]+)"/g)].map((m) => m[1]), ['Lists']);
  assert.match(r.xml, /<page name="Lists" [^>]*transition="push"/);
  const page = /<page name="Lists"[\s\S]*?<\/page>/.exec(r.xml)![0];
  // a screen's definition, less its own tag: what's in it
  const def = (name: string) => (new RegExp(`<subpage name="${name}" w="1280" h="800"[^>]*>([\\s\\S]*?)</subpage>`).exec(r.xml)?.[1] ?? '').trim();
  const tabJ = (k: number) => r.joins.digital[`ui_tabs_Lists_${k}`];
  // a screen: a full-size subpage on its tab's join, the first one visible from the start, coming and going as tabTransition says
  for (const k of [0, 1, 2]) {
    assert.match(page, new RegExp(`<subpage name="ui_screen_Lists_${k}" x="0" y="0" j="${tabJ(k)}" transition1="fade" [^>]*time1="0.15"[^>]*transition2="fade" [^>]*v="${k ? 0 : 1}"`), `screen ${k} placed`);
    assert.ok(def(`ui_screen_Lists_${k}`), `screen ${k} defined`);
  }
  // the list on the first screen in its subpage; the long one scrolls in its; the pager's pages on the page (iViewer nests no
  // subpage), where the pager is, not in the third screen's subpage
  assert.match(def('ui_screen_Lists_0'), /<list j="\d+"/);
  assert.match(def('ui_screen_Lists_1'), /<list j="0" [^>]*headerSub="ui_scroll_\w+"/);
  assert.doesNotMatch(def('ui_screen_Lists_2'), /<subpage /);
  // on mirror joins of the section's (the script ANDs the pager's page join with the tab's); its own join held for the script
  assert.match(page, new RegExp(`<subpage name="ui_pg_page_0" x="16" y="132" j="${r.joins.digital.ui_tabs_Lists_own0}"`));
  assert.match(page, new RegExp(`<subpage name="ui_pg_page_1" x="16" y="132" j="${r.joins.digital.ui_tabs_Lists_own1}"`));
  assert.ok(r.joins.digital.ui_page_pg0 !== undefined && r.joins.digital.ui_page_pg0 !== r.joins.digital.ui_tabs_Lists_own0);
  // the tabs: transparent buttons on their joins, a tap tells the script; no page flips; the pill on its join under the first tab
  const tab = (k: number, title: string) => new RegExp(`<btn j="${tabJ(k)}" [^>]*js="IvaUI\\.tab\\(&quot;Lists&quot;, ${k}\\)"[^>]*>\\s*<inactive s="0">${title}<`).test(page);
  assert.ok(tab(0, 'Rows') && tab(1, 'Long') && tab(2, 'Pages'), 'the tab buttons');
  assert.doesNotMatch(page, /flip="Lists/);
  const bar = r.joins.serial.ui_tabs_Lists_bar;
  assert.match(page, new RegExp(`<img x="20" y="84" w="413" h="32" j="${bar}" clickthrough="1"`));
  // its setup: the tabs' joins, the pill, where the tabs are, and the pager's pages as the third screen's own
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.match(start, /IvaUI\.tabs\("Lists", \{ joins: \[Joins\.d\["ui_tabs_Lists_0"\], Joins\.d\["ui_tabs_Lists_1"\], Joins\.d\["ui_tabs_Lists_2"\]\], bar: Joins\.s\["ui_tabs_Lists_bar"\], xs: \[20,433,847\], time: 0\.18, owned: \[\[\], \[\], \[\[Joins\.d\["ui_page_pg0"\], Joins\.d\["ui_tabs_Lists_own0"\]\], \[Joins\.d\["ui_page_pg1"\], Joins\.d\["ui_tabs_Lists_own1"\]\]\]\] \}\);/);
  assert.equal(start.match(/IvaUI\.tabs\(/g)!.length, 1, 'set up once for the section');
  assert.deepEqual(r.warnings, []);
});

test('iva/ui at another screen size: the panel is screen() - the header and the side menu fit it', async () => {
  const dir = tmpDir('iva-ui-size-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Header, SideMenu } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <Header title="T" />
      <SideMenu title="Menu" items={[{ icon: 'house', text: 'Home', page: 'P' }]} />
    </Page>
  </Project>
);
`);
  const own = await compile(path.join(dir, 'app.jsx'));
  assert.match(own.xml, /<subpage name="ui_menu_scrim" w="1280" h="800"/);
  const r = await compile(path.join(dir, 'app.jsx'), { size: '1400x1400' });
  assert.match(r.xml, /<subpage name="ui_menu_scrim" w="1400" h="1400"/);
  assert.match(r.xml, /<subpage name="ui_menu" w="314" h="1400"/);
  // the clock at the header's right end
  assert.match(r.xml, /<txt j="\d+" x="1240" y="0" w="136" h="72"/);
});

test('grid(): rows stretched across, the height left to what grows (else to all), stacks, a row too wide wraps, taller than the area', () => {
  const area = { x: 16, y: 88, w: 1248, h: 696 };
  // laid out at this size already: as it is, the spare height shared by all rows
  const c = layoutGrid({ a: [392, 260], b: [408, 260], c: [416, 260], seg: [1248, 170], scenes: [1248, 210] }, [['a', 'b', 'c'], ['seg'], ['scenes']], area);
  assert.deepEqual([c.a, c.b, c.c].map((x) => [x.x, x.w]), [[16, 392], [424, 408], [848, 416]]);
  assert.deepEqual([c.a.y, c.seg.y, c.scenes.y], [88, 374, 566]);
  assert.equal(c.scenes.y + c.scenes.h, 88 + 696);
  assert.deepEqual([c.a.dy, c.seg.dy, c.scenes.dy], [5, 3, 4]);
  // a square panel: wider and taller; only the row with the pager takes the height
  const sq = layoutGrid({ m: [404, 240], cf: [404, 240], ld: [408, 240], crumbs: [404, 190], nav: [404, 214], pager: { w: 828, h: 420, grow: true } },
    [['m', 'cf', 'ld'], [['crumbs', 'nav'], 'pager']], { x: 16, y: 88, w: 1368, h: 1296 });
  assert.deepEqual([sq.m, sq.cf, sq.ld].map((x) => [x.x, x.w, x.h]), [[16, 444, 240], [476, 444, 240], [936, 448, 240]]);
  assert.deepEqual([sq.crumbs.y, sq.crumbs.x, sq.pager.x, sq.pager.y, sq.pager.h, sq.pager.dy], [344, 16, 475, 344, 1040, 0]);
  // the stack's items share its height (neither grows: both, by their size)
  assert.equal(sq.nav.y + sq.nav.h, sq.pager.y + sq.pager.h);
  assert.ok(sq.crumbs.dy > 0 && sq.nav.dy > 0);
  // narrower than a row: it wraps; a height for the width it gets; taller than the area: as tall as it is (it scrolls)
  const narrow = layoutGrid({ a: [600, 300], b: [600, (w) => (w < 600 ? 500 : 300)] }, [['a', 'b']], { x: 0, y: 0, w: 435, h: 400 });
  assert.deepEqual([narrow.a, narrow.b].map((x) => [x.x, x.y, x.w, x.h]), [[0, 0, 435, 300], [0, 316, 435, 500]]);
  assert.throws(() => layoutGrid<'a' | 'b'>({ a: [1, 1], b: [1, 1] }, [['a']], area), /b in no row/);
});

test('SideMenu: slides in and out from the left; a swipe from the left edge opens it, a swipe to the left (or a tap on the shade) closes it', async () => {
  const dir = tmpDir('iva-menu-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { SideMenu, Header } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <Header title="T" />
      <SideMenu title="T" items={[{ icon: 'house', text: 'Home', page: 'P' }]} />
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const xml = r.xml;
  // the panel: in and out from the left
  assert.match(xml, /<subpage name="ui_menu" x="0" y="0" j="(\d+)" transition1="moveIn" subtype1="fromLeft" time1="0.25" ease1="easeOut" transition2="moveIn" subtype2="fromLeft" time2="0.2" ease2="easeIn"/);
  // swipes only: nothing drags it (iViewer moves a subpage by its transitions, not under a finger)
  assert.doesNotMatch(xml, /type="pan"|menuDrag|tags="ui_menu/);
  // the left edge under the header: a swipe right opens it
  const edge = /<img x="0" y="72" w="16" h="728"[^>]*>[\s\S]*?<\/img>/.exec(xml)?.[0] ?? '';
  assert.match(edge, /<gesture name="swipe gesture" type="swipe" direction="right"[^>]*>\s*<action phase="begin" js="CF.setJoin\(Joins.d\[&quot;menu&quot;\], 1\)"/);
  // the shade: a tap closes it (a gesture, so a swipe there isn't one), a swipe to the left too
  const shade = xml.slice(xml.indexOf('<subpage name="ui_menu_scrim" w='), xml.indexOf('</subpage>', xml.indexOf('<subpage name="ui_menu_scrim" w=')));
  assert.match(shade, /<gesture name="tap gesture" type="tap"[^>]*>\s*<action phase="begin" js="IvaUI.off\(/);
  assert.match(shade, /<gesture name="swipe gesture" type="swipe" direction="left"[^>]*>\s*<action phase="begin" js="IvaUI.off\(/);
  assert.doesNotMatch(shade, /<btn /);
  // the panel: a swipe to the left closes it
  assert.equal(xml.match(/type="swipe" direction="left"[^>]*>\s*<action phase="begin" js="IvaUI.off\(/g)?.length, 2);
});

test('a ScrollBox named after what is in it, in every look the same: a knob drawn in each look\'s colours (knobs/vol, knobs/vol-light) is the same knob', async () => {
  const dir = tmpDir('iva-scroll-looks-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Knob, ScrollBox, Thermostat } from 'iva/ui';
export default (
  <Project name="T" width={400} height={700} themes={['dark', 'light']}>
    <Page name="P">
      <ScrollBox w={400} h={600}>
        <Knob join="vol" size={150} color={variant() === 'light' ? '#EEEEEE' : '#333333'} />
        <Thermostat y={260} size={160} setpoint="heat" value={21} current="20.5°" />
      </ScrollBox>
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  for (const f of ['knobs/vol/knob.png', 'knobs/vol-light/knob.png', 'knobs/now-20-5/knob.png']) assert.ok(r.assets.some((x) => x.name === f), f);
  assert.equal((r.xml.match(/<subpage name="ui_scroll_[0-9a-f]{8}" w=/g) ?? []).length, 1);
});

test("Screens: a subpage a screen's content places with no join of its own (a colour picker's wheel) goes on the page on the tab's join, so it shows with its screen only", async () => {
  const dir = tmpDir('iva-screens-clip-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { ui } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <ui.Screens name="S" tabTransition={{ type: 'fade', time: 0.15 }} screens={[
      { title: 'A', content: <Text x={16} y={140} w={100} h={30} text="a" /> },
      { title: 'B', content: <Group x={16} y={140}><Subpage name="wheel" w={100} h={100}><Image w={100} h={100} src={fa('house')} /></Subpage></Group> },
    ]} />
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const page = /<page name="S"[\s\S]*?<\/page>/.exec(r.xml)![0];
  assert.match(page, new RegExp(`<subpage name="wheel" x="16" y="140" j="${r.joins.digital.ui_tabs_S_1}" transition1="fade" [^>]*time1="0.15"[^>]*v="0"`));
  // the screen's own subpage holds nothing else: the wheel was all there was
  assert.match(r.xml, /<subpage name="ui_screen_S_1" w="1280" h="800" clip="1" \/>/);
  assert.match(r.scripts.find((x) => x.name === 'iva-start.js')!.code!, /owned: \[\[\], \[\]\]/);
  assert.deepEqual(r.warnings, []);
});

test('Segmented and SceneBar: transparent options over one accent pill on a join, placed under the one chosen; the group set up with where the pill goes', async () => {
  const dir = tmpDir('iva-oneof-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Segmented, SceneBar } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P">
      <Segmented x={10} y={10} w={332} h={48} options={['Heat', 'Cool', 'Auto']} join="mode" value={1} />
      <SceneBar x={10} y={100} w={742} h={120} scenes={[{ icon: 'sun', title: 'Morning' }, { icon: 'moon', title: 'Evening', cmd: 'Night' }]} join="scene" />
    </Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const page = /<page name="P"[\s\S]*?<\/page>/.exec(r.xml)![0];
  // the segmented: its pill (one image on its join) under the second option; the options on their joins, a tap picks
  const seg = (332 - 8) / 3;
  assert.match(page, new RegExp(`<img x="${10 + 4 + Math.round(seg)}" y="14" w="${Math.round(seg)}" h="40" j="${r.joins.serial.ui_mode_pill_0}" clickthrough="1"`), 'the pill under the second option (the group offset added)');
  for (const [i, text] of ['Heat', 'Cool', 'Auto'].entries()) {
    assert.match(page, new RegExp(`<btn j="${r.joins.digital[`ui_mode_${i}`]}" [^>]*js="IvaUI\\.pick\\(&quot;mode#0&quot;, ${i}\\)"[^>]*>\\s*<inactive s="0">${text}<`));
  }
  const themeOf = (join: number) => page.match(new RegExp(`<btn j="${join}" [^>]*t="(\\w+)"`))![1];
  const css = (name: string) => r.xml.match(new RegExp(`<theme type="button" name=".${name}\\[state='0'\\]"><!\\[CDATA\\[([^\\]]*)`))![1];
  assert.doesNotMatch(css(themeOf(r.joins.digital.ui_mode_0)), /background/);
  // the scene bar: a raised tile each, the pill (tile-sized) under the first, transparent buttons with their icons
  assert.match(page, new RegExp(`<img x="10" y="100" w="365" h="120" j="${r.joins.serial.ui_scene_pill_1}" clickthrough="1"`));
  assert.equal((page.match(/boxes\/365x120-r\d+-\w+\.png/g) ?? []).length, 2, 'a raised tile each');
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.match(start, new RegExp(`IvaUI\\.group\\("mode#0", Joins\\.a\\["mode"\\], \\[Joins\\.d\\["ui_mode_0"\\], Joins\\.d\\["ui_mode_1"\\], Joins\\.d\\["ui_mode_2"\\]\\], 1, undefined, undefined, \\{ join: Joins\\.s\\["ui_mode_pill_0"\\], xs: \\[4,${4 + Math.round(seg)},${4 + Math.round(2 * seg)}\\], at: 1, time: 0\\.18 \\}\\);`));
  assert.match(start, /IvaUI\.group\("scene#1", [^;]*xs: \[0,377\], at: 0, time: 0\.18 \}\);/);
  assert.deepEqual(r.warnings, []);
});

test('two one-of groups on one join (the same choice on two pages): the options\' joins shared, a pill and a group registration each', async () => {
  const dir = tmpDir('iva-oneof-shared-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Segmented } from 'iva/ui';
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="A"><Segmented x={10} y={10} options={['Heat', 'Cool']} join="mode" /></Page>
    <Page name="B"><Segmented x={400} y={300} options={['Heat', 'Cool']} join="mode" /></Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  assert.deepEqual(Object.keys(r.joins.digital).filter((k) => k.startsWith('ui_mode_')), ['ui_mode_0', 'ui_mode_1']);
  assert.deepEqual(Object.keys(r.joins.serial), ['ui_mode_pill_0', 'ui_mode_pill_1']);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.match(start, /IvaUI\.group\("mode#0", Joins\.a\["mode"\], \[Joins\.d\["ui_mode_0"\], Joins\.d\["ui_mode_1"\]\], 0, undefined, undefined, \{ join: Joins\.s\["ui_mode_pill_0"\]/);
  assert.match(start, /IvaUI\.group\("mode#1", Joins\.a\["mode"\], \[Joins\.d\["ui_mode_0"\], Joins\.d\["ui_mode_1"\]\], 0, undefined, undefined, \{ join: Joins\.s\["ui_mode_pill_1"\]/);
  assert.match(r.xml, new RegExp(`<page name="B"[\\s\\S]*<img x="404" y="304" [^>]*j="${r.joins.serial.ui_mode_pill_1}"`));
});

test('SceneBar columns: a grid of tiles, rows a gap apart; the pill placed under the one chosen and slid in x and y', async () => {
  const dir = tmpDir('iva-scenegrid-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { SceneBar } from 'iva/ui';
const scenes = ['sun', 'moon', 'film', 'music', 'right-from-bracket', 'utensils'].map((icon, i) => ({ icon, title: 'S' + i }));
export default (
  <Project name="T" width={1280} height={800}>
    <Page name="P"><SceneBar w={742} h={96} columns={3} scenes={scenes} join="scene" value={4} /></Page>
  </Project>
);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const page = /<page name="P"[\s\S]*?<\/page>/.exec(r.xml)![0];
  // (742 - 2 * 12) / 3 = 239.33: tiles at 0, 251, 503; the second row 96 + 12 down
  const tiles = [...page.matchAll(/<img x="(\d+)" y="(\d+)" w="239" h="96" j="0"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(tiles, [[0, 0], [251, 0], [503, 0], [0, 108], [251, 108], [503, 108]]);
  assert.match(page, new RegExp(`<img x="251" y="108" w="239" h="96" j="${r.joins.serial.ui_scene_pill_0}" clickthrough="1"`), 'the pill under the fifth');
  const buttons = [...page.matchAll(/<btn j="\d+" x="(\d+)" y="(\d+)" w="239" h="96"/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(buttons, tiles);
  assert.match(r.scripts.find((x) => x.name === 'iva-start.js')!.code!, /xs: \[0,251,503,0,251,503\], ys: \[0,0,0,108,108,108\], at: 4, time: 0\.18 \}/);
  assert.deepEqual(r.warnings, []);
});

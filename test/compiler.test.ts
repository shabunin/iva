import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import { compile, IvaError } from '../src/compiler/index.ts';
import { circle } from '../src/compiler/images.ts';
import { parseGUI } from '../src/runtime/cf/parser.ts';

(globalThis as any).DOMParser = DOMParser;

const HELLO = path.resolve(import.meta.dirname, '../examples/hello/app.jsx');

/** Compile a one-file project written inline. */
async function build(jsx: string, files: Record<string, string | Buffer> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-test-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);
  return compile(path.join(dir, 'app.jsx'));
}

async function fails(jsx: string, pattern: RegExp) {
  await assert.rejects(build(jsx), (e: any) => {
    assert.ok(e instanceof IvaError, `not an IvaError: ${e}`);
    assert.match(e.message, pattern);
    return true;
  });
}

const wrap = (body: string, extra = '') => `export default (
  <Project name="T" width={1024} height={768}>
    <Page name="Main">${body}</Page>${extra}
  </Project>
);`;

test('the hello example reads back through cf-runtime', async () => {
  const r = await compile(HELLO);
  const gui = await parseGUI(r.xml);
  assert.deepEqual(Object.keys(gui.pages), ['Home', 'Settings']);
  assert.equal(gui.startPage, ''); // no start page: the first one
  assert.deepEqual(gui.properties.landscape, { width: 1024, height: 768 });
  const home = gui.pages.Home.landscape!;
  const lights = home.find((n) => n.type === 'btn' && n.inactiveText === 'Lights')!;
  assert.equal(lights.j, String(r.joins.digital.lights));
  assert.equal(lights.sim, '2');
  // its theme exists with both states
  assert.ok(gui.themes[lights.t!].states['0']['background-color']);
  assert.equal(gui.themes[lights.t!].states['1']['background-color'], '#2f6fd6');
  // inline subpage: defined once, placed on the page
  assert.ok(gui.subpages.Toast);
  assert.ok(home.some((n) => n.type === 'subpage' && n.name === 'Toast'));
  // the system, its command and feedback target
  const sys = gui.systems[0];
  assert.equal(sys.attributes.connectionStatus, String(r.joins.digital.online));
  assert.equal(gui.commands.Ping.text, 'hello\\x0D');
  assert.equal(sys.children.find((c) => c.type === 'fb')!.children[0].attributes.target, `s${r.joins.serial.reply}`);
  // scripts: the joins map first
  assert.deepEqual(gui.scripts.map((s) => s.name), ['iva-joins.js', 'main.js']);
});

test('named joins skip numbers used explicitly', async () => {
  const r = await build(wrap(`
    <Button w={10} h={10} join={1000} />
    <Button w={10} h={10} join="a" />
    <Button w={10} h={10} join="b" />
    <Button w={10} h={10} join="a" />
    <Text w={10} h={10} join="a" />`));
  assert.deepEqual(r.joins, { digital: { a: 1001, b: 1002 }, serial: { a: 1000 } });
});

test('same style, one theme', async () => {
  const r = await build(wrap(`
    <Text w={10} h={10} color="#f00" />
    <Text x={20} w={10} h={10} color="#f00" />
    <Text x={40} w={10} h={10} color="#0f0" />`));
  assert.equal((r.xml.match(/<theme type="text"/g) ?? []).length, 2);
});

test('#rrggbbaa colours become rgba()', async () => {
  const r = await build(wrap(`<Button w={10} h={10} bg="#00000080" />`));
  assert.match(r.xml, /background-color: rgba\(0,0,0,0\.5\)/);
});

test('XML special characters are escaped', async () => {
  const r = await build(wrap(`<Button w={10} h={10} text={'a < b & "c"'} js={'if (a < b) x("&");'} />`));
  const gui = await parseGUI(r.xml);
  const btn = gui.pages.Main.landscape![0];
  assert.equal(btn.inactiveText, 'a < b & "c"');
  assert.equal(btn.js, 'if (a < b) x("&");');
});

test('one simple press action is the btn cmd attribute; anything more is <actions>', async () => {
  const r = await build(wrap(`
    <Button w={10} h={10} onPress={['Power']} />
    <Button w={10} h={10} onPress={[cmd('Up', { repeat: 200 })]} onRelease={[js('stop()')]} onHold={[macro('Long')]} />`));
  const gui = await parseGUI(r.xml);
  const [simple, full] = gui.pages.Main.landscape!;
  assert.equal(simple.cmd, 'Power');
  const action = full.children.find((c) => c.type === 'actions')!.children[0];
  assert.deepEqual(action.children.map((c) => [c.type, c.attributes]), [
    ['press', { delay: '0', hold: '0', repeat: '200', command: 'Up' }],
    ['press', { delay: '0', hold: '1000', repeat: '0', macro: 'Long' }],
    ['release', { delay: '0', js: 'stop()' }],
  ]);
});

test('a slider drawn from colours gets generated images', async () => {
  const r = await build(wrap(`<Slider w={200} h={20} bg="#333" fill="#08f" thumbColor="#fff" />`));
  const pngs = r.assets.filter((a) => a.data);
  assert.equal(pngs.length, 6); // track, fill, thumb - and their @2x for retina screens
  assert.equal(pngs.filter((a) => a.name.endsWith('@2x.png')).length, 3);
  for (const p of pngs) assert.deepEqual([...p.data!.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  const gui = await parseGUI(r.xml);
  const slider = gui.pages.Main.landscape![0];
  assert.match(gui.themes[slider.t!].states['1']['background-image'], /iva_fill_/);
});

test('images are copied by name; a missing one is a warning', async () => {
  const png = circle(8, '#fff');
  const r = await build(wrap(`<Image w={10} h={10} src="./logo.png" />`), { 'logo.png': png });
  assert.deepEqual(r.assets.map((a) => a.name), ['logo.png']);
  const missing = await build(wrap(`<Image w={10} h={10} src="./nope.png" />`));
  assert.match(missing.warnings.join('\n'), /image not found: \.\/nope\.png/);
  assert.match(missing.xml, />nope\.png<\/img>/);
});

test('mistakes are reported with a suggestion and the line', async () => {
  await fails(wrap(`<Button w={10} h={10} fontSise={12} />`), /unknown prop "fontSise" \(did you mean "fontSize"\?\)/);
  await fails(wrap(`<Button w={10} />`), /"h" is required/);
  await fails(wrap(`<div />`), /<div> is not an iva element/);
  await fails(wrap(`<SubpageRef name="Nope" />`, `<Subpage name="Menu" w={10} h={10} />`), /no subpage "Nope"/);
  await fails(wrap(`<SubpageRef name="Menuu" />`, `<Subpage name="Menu" w={10} h={10} />`), /did you mean "Menu"/);
  await fails(wrap(`<Text w={10} h={10} theme="X" color="#fff" />`, `<Theme name="X" type="text" />`), /either theme="X" or style props/);
  await fails(wrap(`<Button w={10} h={10} join={s(1)} />`), /expects a digital join/);
  await fails(wrap('', `<Page name="Main" />`), /page "Main" is defined twice/);
  await assert.rejects(build(wrap(`<Button w={10}\n h={10} fontSise={12} />`)), (e: IvaError) => e.line === 3);
});

test('a page in both orientations', async () => {
  const r = await build(`export default (
    <Project name="T" width={1024} height={768}>
      <Page name="Main">
        <Landscape bg="#111"><Text w={10} h={10}>wide</Text></Landscape>
        <Portrait bg="#222"><Text w={10} h={10}>tall</Text></Portrait>
      </Page>
    </Project>
  );`);
  const gui = await parseGUI(r.xml);
  assert.equal(gui.pages.Main.landscape![0].content, 'wide');
  assert.equal(gui.pages.Main.portrait![0].content, 'tall');
  assert.notEqual(gui.pages.Main.landscapeTheme, gui.pages.Main.portraitTheme);
});

test('radius / border: the background is drawn at the button\'s size, per state', async () => {
  const r = await build(wrap(`
    <Button w={200} h={60} radius={12} bg="#222" active={{ bg: '#06f' }} />
    <Button y={100} w={200} h={60} radius={12} borderWidth={2} borderColor="#06f" />`));
  const gui = await parseGUI(r.xml);
  const [filled, outline] = gui.pages.Main.landscape!;
  const t = gui.themes[filled.t!];
  assert.match(t.states['0']['background-image'], /url\(iva_btn_\w+\.png\)/);
  assert.notEqual(t.states['0']['background-image'], t.states['1']['background-image']);
  assert.equal(t.states['0']['background-color'], undefined);
  assert.match(gui.themes[outline.t!].states['0']['background-image'], /iva_btn_/);
  // 1x and the retina @2x, twice the size
  const png = (n: string) => r.assets.find((a) => a.name === n)!.data!;
  const name = /url\((.*)\)/.exec(t.states['0']['background-image'])![1];
  assert.equal(png(name).readUInt32BE(16), 200);
  assert.equal(png(name.replace('.png', '@2x.png')).readUInt32BE(16), 400);
  await fails(wrap(`<Button w={10} h={10} borderWidth={2} />`), /borderWidth needs borderColor/);
});

test('a subpage with radius gets a drawn background', async () => {
  const r = await build(wrap(`<Subpage name="Card" w={300} h={120} radius={16} bg="#222" />`));
  const gui = await parseGUI(r.xml);
  assert.match(gui.themes[gui.subpages.Card.theme!].states['0']['background-image'], /url\(iva_bg_\w+\.png\)/);
});

test('fa() icons: on buttons in the text colour (active too), as images, with "did you mean"', async () => {
  const r = await build(wrap(`
    <Button w={200} h={80} icon={fa('lightbulb')} iconAlign="left" text="Lamp" color="#ccc" active={{ color: '#fff' }} />
    <Image y={100} w={48} h={48} src={fa('brands:github')} />`));
  const gui = await parseGUI(r.xml);
  const [btn, img] = gui.pages.Main.landscape!;
  const off = btn.children.find((c) => c.type === 'inactive')!.children[0];
  const on = btn.children.find((c) => c.type === 'active')!.children[0];
  assert.match(off.text!, /^iva_fa_\w+\.png$/);
  assert.notEqual(off.text, on.text); // drawn in each state's colour
  assert.deepEqual([off.x, off.y, off.w, off.h], [20, 20, 40, 40]);
  assert.match(gui.themes[btn.t!].states['0'].padding, /^0px 20px 0px 75px$/);
  assert.equal(gui.themes[btn.t!].states['0']['text-align'], 'left');
  assert.match(img.content!, /^iva_fa_\w+\.png$/);
  await fails(wrap(`<Image w={10} h={10} src={fa('lightbulp')} />`), /no Font Awesome icon "lightbulp" \(did you mean "lightbulb"\?\)/);
});

test('<Box>: a drawn image touches go through; <Group>: moves its children', async () => {
  const r = await build(wrap(`
    <Group x={100} y={50}>
      <Box w={200} h={100} radius={12} bg="#222" />
      <Group x={10} y={10}><Button w={20} h={20} /></Group>
    </Group>`));
  const gui = await parseGUI(r.xml);
  const [box, btn] = gui.pages.Main.landscape!;
  assert.equal(box.type, 'img');
  assert.deepEqual([box.x, box.y, box.attributes.clickthrough], [100, 50, '1']);
  assert.match(box.content!, /^iva_box_\w+\.png$/);
  assert.deepEqual([btn.x, btn.y], [110, 60]);
});

test('<Script> and <OnStart> go anywhere: lifted to the project, once', async () => {
  const r = await build(wrap(`
    <Script name="lib.js" code="var A = 1;" />
    <Text w={10} h={10} />
    <Script name="lib.js" code="var A = 1;" />
    <OnStart js="start();" joins={[s('fromJs')]} />
    <OnStart js="start();" />`));
  assert.deepEqual(r.scripts.map((s) => s.name), ['iva-joins.js', 'lib.js', 'iva-start.js']);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/start\(\);/g)!.length, 1);
  assert.match(start, /CF\.modules\.push/);
  assert.deepEqual(r.joins, { serial: { fromJs: 1000 } });
  await fails(wrap(`<Script name="lib.js" code="a" /><Script name="lib.js" code="b" />`), /two different scripts named lib\.js/);
});

test('a subpage defined again the same way is fine; differently, an error', async () => {
  const sub = (text: string) => `<Subpage name="Pop" w={100} h={50} join="pop"><Text w={100} h={50} text="${text}" /></Subpage>`;
  const r = await build(`export default (
    <Project name="T" width={1024} height={768}>
      <Page name="A">${sub('hi')}</Page>
      <Page name="B">${sub('hi')}</Page>
    </Project>
  );`);
  assert.equal((r.xml.match(/<subpage name="Pop" w=/g) ?? []).length, 1);
  assert.equal((r.xml.match(/<subpage name="Pop" x=/g) ?? []).length, 2);
  await fails(`export default (
    <Project name="T" width={1024} height={768}>
      <Page name="A">${sub('hi')}</Page>
      <Page name="B">${sub('ho')}</Page>
    </Project>
  );`, /"Pop" is defined twice, differently/);
});

test('topmost placements go last; fixed ones ignore their group; define only defines', async () => {
  const r = await build(wrap(`
    <Group x={100} y={100}>
      <Subpage name="Pop" topmost fixed w={50} h={50} />
      <Subpage name="Row" define w={50} h={20}><Text w={50} h={20} join={1} /></Subpage>
      <Button w={10} h={10} />
    </Group>
    <Text w={10} h={10} />`));
  const gui = await parseGUI(r.xml);
  const items = gui.pages.Main.landscape!;
  assert.deepEqual(items.map((n) => n.type), ['btn', 'txt', 'subpage']);
  assert.deepEqual([items[2].x, items[2].y], [0, 0]); // fixed: not moved by the group
  assert.ok(gui.subpages.Row);
  assert.ok(!items.some((n) => n.name === 'Row'));
});

test('one <OnStart> failing does not stop the rest', async () => {
  const r = await build(wrap(`<OnStart js="boom();" /><OnStart js="fine();" />`));
  const code = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.match(code, /try \{ boom\(\); \} catch \(e\)/);
  assert.match(code, /try \{ fine\(\); \} catch \(e\)/);
});

test('<Input> actions, <Web> named joins, a <System> from a component: once', async () => {
  const sys = `<System name="Srv" protocol="tcp" accept host="0.0.0.0" port={8890}><Feedback name="req" regex="x" /></System>`;
  const r = await build(wrap(`
    <Input w={200} h={40} join="q" cmd="Search" changeCmd="Typing" />
    <Web y={50} w={300} h={200} url="page.html" join="url" titleJoin="title" backJoin="back" />
    <Group>${sys}</Group>${sys}`));
  assert.match(r.xml, /<input j="0" s="1000" [^>]*t="input_\w+" command="Search" changeCommand="Typing" l="0"/);
  assert.match(r.xml, /<web x="0" y="50" w="300" h="200" j="1001" title="1002" back="1000" forward="0" refresh="0" stop="0" url="page.html"/);
  assert.equal((r.xml.match(/<system name="Srv"/g) ?? []).length, 1);
  await fails(wrap(`${sys}<Group><System name="Srv" protocol="udp" host="0.0.0.0" port={1} /></Group>`), /two different systems named "Srv"/);
});

test('<Text bg>: a drawn box behind the text (iViewer draws no text backgrounds)', async () => {
  const r = await build(wrap(`<Group x={10}><Text x={20} y={30} w={200} h={40} text="Hi" bg="#336699" radius={8} /></Group>`));
  assert.match(r.xml, /<img x="30" y="30" w="200" h="40" j="0" clickthrough="1"[^>]*>iva_box_\w+\.png<\/img>\s*<txt j="0" x="30" y="30" w="200" h="40"/);
  assert.doesNotMatch(r.xml, /type="text"[^\]]*background-color/);
});


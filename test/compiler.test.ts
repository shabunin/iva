import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import { buildFilesAll, compile, IvaError, writeBuild, writeBuilds } from '../src/compiler/index.ts';
import { circle } from '../src/compiler/images.ts';
import { parseGUI } from '../src/runtime/cf/parser.ts';

(globalThis as any).DOMParser = DOMParser;

const HELLO = path.resolve(import.meta.dirname, '../examples/hello/app.jsx');

/** Compile a one-file project written inline. */
async function build(jsx: string, files: Record<string, string | Buffer> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-test-'));
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  for (const [name, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), data);
  }
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
  assert.deepEqual(gui.scripts.map((s) => s.name), ['scripts/iva-joins.js', 'scripts/main.js']);
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
  assert.match(t.states['0']['background-image'], /url\(backgrounds\/iva_btn_\w+\.png\)/);
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
  assert.match(gui.themes[gui.subpages.Card.theme!].states['0']['background-image'], /url\(backgrounds\/iva_bg_\w+\.png\)/);
});

test('fa() icons: on buttons in the text colour (active too), as images, with "did you mean"', async () => {
  const r = await build(wrap(`
    <Button w={200} h={80} icon={fa('lightbulb')} iconAlign="left" text="Lamp" color="#ccc" active={{ color: '#fff' }} />
    <Image y={100} w={48} h={48} src={fa('brands:github')} />`));
  const gui = await parseGUI(r.xml);
  const [btn, img] = gui.pages.Main.landscape!;
  const off = btn.children.find((c) => c.type === 'inactive')!.children[0];
  const on = btn.children.find((c) => c.type === 'active')!.children[0];
  assert.match(off.text!, /^icons\/iva_fa_\w+\.png$/);
  assert.notEqual(off.text, on.text); // drawn in each state's colour
  assert.deepEqual([off.x, off.y, off.w, off.h], [20, 20, 40, 40]);
  assert.match(gui.themes[btn.t!].states['0'].padding, /^0px 20px 0px 75px$/);
  assert.equal(gui.themes[btn.t!].states['0']['text-align'], 'left');
  assert.match(img.content!, /^icons\/iva_fa_\w+\.png$/);
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
  assert.match(box.content!, /^backgrounds\/iva_box_\w+\.png$/);
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
  assert.match(r.xml, /<img x="30" y="30" w="200" h="40" j="0" clickthrough="1"[^>]*>backgrounds\/iva_box_\w+\.png<\/img>\s*<txt j="0" x="30" y="30" w="200" h="40"/);
  assert.doesNotMatch(r.xml, /type="text"[^\]]*background-color/);
});

test('<Project themes>: one build per look, merged; tags, image joins, the theme script, the persisted look', async () => {
  const r = await build(`export default (
  <Project name="T" width={1024} height={768} themes={['dark', 'light']}>
    <Page name="Main" bg={variant() === 'light' ? '#FFFFFF' : '#000000'}>
      <Text w={100} h={30} text="Hi" color={variant() === 'light' ? '#000000' : '#FFFFFF'} />
      <Button y={40} w={100} h={40} icon={fa('house')} color={variant() === 'light' ? '#000000' : '#FFFFFF'} bg="#888888" radius={8} />
      <Text y={90} w={100} h={30} text="same in both" color="#FF0000" />
    </Page>
  </Project>
);`);
  // the page background: a drawn image on a join; the text and button: tagged
  assert.match(r.xml, /<landscape>\s*<img x="0" y="0" w="1024" h="768" j="(\d+)"/);
  const tagged = r.xml.match(/tags="iva_t_\w+"/g) ?? [];
  assert.equal(tagged.length, 2);
  // the button's icon is drawn into its background (a theme swaps both): no <img> in its states
  assert.doesNotMatch(r.xml, /<inactive[^>]*>\s*<img/);
  assert.match(r.xml, /<token name="\[iva_theme\]" value="dark" persist="1" \/>/);
  const names = r.scripts.map((s) => s.name);
  assert.ok(names.indexOf('iva-themes.js') >= 0 && names.indexOf('iva-themes.js') < names.indexOf('iva-start.js') || !names.includes('iva-start.js'));
  const code = r.scripts.find((s) => s.name === 'iva-themes.js')!.code!;
  const D = JSON.parse(code.match(/var D = (.*);\n/)![1]);
  assert.deepEqual(D.names, ['dark', 'light']);
  assert.equal(Object.keys(D.tags).length, 2);
  assert.equal(Object.keys(D.images).length, 1);
  // the light look's images ship too (named in the .gui)
  for (const [, light] of Object.values(D.images) as string[][]) assert.ok(r.xml.includes(`>${light}<`), light);
  assert.doesNotThrow(() => new Function(code));
});

test('<Project themes>: the looks must be the same elements', async () => {
  await fails(`export default (
  <Project name="T" width={1024} height={768} themes={['dark', 'light']} theme="light">
    <Page name="Main">{variant() === 'light' ? <Text w={10} h={10} text="x" /> : null}</Page>
  </Project>
);`, /the "dark" look differs from "light".*same elements/s);
});

test('<WebApp>: bundled into the build, a web view on the panel\'s one web server, its setup', async () => {
  const app = `import { panel } from 'iva/web';\nimport { look } from './look.js';\npanel.on('lamp', (v) => (document.body.style.background = look(v)));\n`;
  const r = await build(wrap(`
      <HttpServer name="api" port={8900} handler="myApi" />
      <WebApp entry="./app.js" w={400} h={300} joins={{ lamp: d('lamp'), temp: a(12) }} options={{ rooms: 2 }} />
      <Group x={500}><WebApp entry="./app.js" w={400} h={300} joins={{ lamp: d('lamp'), temp: a(12) }} options={{ rooms: 2 }} /></Group>
      <WebApp entry="iva:chart" name="energy" w={400} h={300} options={{ type: 'bar' }} />
      <Web y={320} w={160} h={72} url="panel:/iva-color/FFB000" />`),
  { 'app.js': app, 'look.js': `export const look = (v) => (v ? '#fff' : '#000');\n` });
  // the code, bundled with what it imports (iva/web too), ships as a project file
  const bundle = r.assets.find((x) => x.name === 'apps/iva_app_app.js')!;
  assert.ok(bundle.data && bundle.data.length > 1000);
  assert.doesNotThrow(() => new Function(bundle.data!.toString('utf8')));
  assert.ok(r.inputs.files.some((f) => f.endsWith('look.js')), 'its modules are watched');
  // one server for all of them: the first free port from 8900 (the HttpServer has 8900); an app at /<name>/
  assert.equal((r.xml.match(/<system name="IvaWeb" ip="0\.0\.0\.0" port="8901" origin="8901" protocol="tcp" alwayson="1" offlinequeue="0" accept="1"/g) ?? []).length, 1);
  assert.equal((r.xml.match(/<system /g) ?? []).length, 2);
  assert.equal((r.xml.match(/<web [^>]*url="http:\/\/127\.0\.0\.1:8901\/app\/"/g) ?? []).length, 2);
  assert.match(r.xml, /<web x="500" [^>]*url="http:\/\/127\.0\.0\.1:8901\/app\/"/);
  assert.match(r.xml, /<web [^>]*url="http:\/\/127\.0\.0\.1:8901\/energy\/"/);
  assert.match(r.xml, /<web [^>]*url="http:\/\/127\.0\.0\.1:8901\/iva-color\/FFB000"/);
  assert.match(r.xml, /<system name="api" [^>]*port="8900"[^>]*offlinequeue="0" accept="1"[\s\S]*?<fb name="request" regex="\(\?msi\)\^\.\*\?\\r\\n\\r\\n" \/>/);
  assert.deepEqual(r.scripts.map((x) => x.name), ['iva-joins.js', 'iva-http.js', 'iva-start.js']);
  for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  // the server first, then the apps
  assert.ok(start.indexOf('IvaHttp.web("IvaWeb", 8901);') < start.indexOf('IvaHttp.app('));
  assert.equal(start.match(/IvaHttp\.app\("app"/g)!.length, 1);
  assert.match(start, /joins: \{ "lamp": Joins\.d\["lamp"\], "temp": "a12" \}, options: \{"rooms":2\}/);
  assert.match(start, /IvaHttp\.serve\("api", myApi\);/);
  // <Project httpPort>
  const fixed = await build(`export default (
  <Project name="T" width={1024} height={768} httpPort={9100}>
    <Page name="Main"><WebApp entry="iva:chart" name="energy" w={400} h={300} /></Page>
  </Project>
);`);
  assert.match(fixed.xml, /<system name="IvaWeb" [^>]*port="9100"/);
  assert.match(fixed.xml, /url="http:\/\/127\.0\.0\.1:9100\/energy\/"/);
});

test('<WebApp>: one app per name; the entry must exist and build', async () => {
  await fails(wrap(`<WebApp entry="iva:chart" name="c" w={9} h={9} options={{ a: 1 }} /><WebApp entry="iva:chart" name="c" w={9} h={9} options={{ a: 2 }} />`),
    /two different web apps named "c"/);
  await fails(wrap(`<WebApp entry="./nope.js" w={9} h={9} />`), /entry not found: \.\/nope\.js/);
  await fails(wrap(`<WebApp entry="iva:nope" w={9} h={9} />`), /no built-in web app "iva:nope" \(iva has: iva:trend, iva:chart\)/);
});

test('the build: the .gui, images/ (its image folder: drawings by kind, sounds, web apps, scripts - iViewer looks for scripts there); folders={false}: all beside it', async () => {
  const files = { 'beep.mp3': 'mp3', 'main.js': 'CF.log(1);' };
  const jsx = (folders: string) => `export default (
  <Project name="T" width={1024} height={768}${folders}>
    <Script src="./main.js" />
    <Sound name="beep" src="./beep.mp3" />
    <Page name="Main"><Box w={100} h={50} bg="#123456" radius={8} /><Image x={200} w={32} h={32} src={fa('lightbulb')} /></Page>
  </Project>
);`;
  const tree = (dir: string) => (fs.readdirSync(dir, { recursive: true }) as string[]).map((f) => f.split(path.sep).join('/'))
    .filter((f) => fs.statSync(path.join(dir, f)).isFile()).map((f) => f.replace(/_[0-9a-f]{8}(@2x)?\.png$/, '_#$1.png')).sort();
  const r = await build(jsx(''), files);
  assert.match(r.xml, /<imagefolder>images<\/imagefolder>/);
  assert.match(r.xml, /<script name="scripts\/main\.js" \/>/);
  assert.match(r.xml, /<sound name="beep" [^>]*>sounds\/beep\.mp3<\/sound>/);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-dist-'));
  writeBuild(r, out);
  assert.deepEqual(tree(out), ['T.gui', 'images/backgrounds/iva_box_#.png', 'images/backgrounds/iva_box_#@2x.png', 'images/icons/iva_fa_#.png',
    'images/icons/iva_fa_#@2x.png', 'images/scripts/main.js', 'images/sounds/beep.mp3', 'joins.json'].sort());
  // as before: everything beside the .gui (a decompiled project keeps its own layout)
  const flat = await build(jsx(' folders={false}'), files);
  assert.match(flat.xml, /<imagefolder \/>/);
  assert.match(flat.xml, /<script name="main\.js" \/>/);
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-dist-'));
  writeBuild(flat, out2);
  assert.ok(tree(out2).includes('backgrounds/iva_box_#.png') && tree(out2).includes('main.js') && tree(out2).includes('beep.mp3'));
});

test('screen sizes: screen() is the <Project>\'s size or the one asked for; <Project sizes> each in its own folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-sizes-'));
  const entry = path.join(dir, 'app.jsx');
  fs.writeFileSync(entry, `const { width, height } = screen();
export default (
  <Project name="T" width={1024} height={768} sizes={['1400x1400', '768x1024']}>
    <Page name="Main"><Image x={16} y={16} w={width - 32} h={height - 32} src="bg.png" /></Page>
  </Project>
);`);
  fs.writeFileSync(path.join(dir, 'bg.png'), circle(8, '#336699'));
  // laid out from screen() before iva knew the size: built again with it
  const main = await compile(entry);
  assert.deepEqual([main.size, main.sizes], [{ width: 1024, height: 768 }, [{ width: 1400, height: 1400 }, { width: 768, height: 1024 }]]);
  assert.match(main.xml, /<portrait width="768" height="1024" \/>\s*<landscape width="1024" height="768" \/>/);
  assert.match(main.xml, /<img x="16" y="16" w="992" h="736"/);
  const square = await compile(entry, { size: '1400x1400' });
  assert.match(square.xml, /<portrait width="1400" height="1400" \/>\s*<landscape width="1400" height="1400" \/>/);
  assert.match(square.xml, /<img x="16" y="16" w="1368" h="1368"/);
  // taller than wide: portrait is the main orientation
  const tall = await compile(entry, { size: { width: 768, height: 1024 } });
  assert.match(tall.xml, /<portrait>\s*<img x="16" y="16" w="736" h="992"/);
  await assert.rejects(compile(entry, { size: 'big' }), /size: "big" isn't one/);
  // dist/: the project's own size, each other in its folder (as iViewer matches a screen); the archive: the main .gui first
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-sizes-dist-'));
  const guis = writeBuilds([main, square, tall], out);
  assert.deepEqual(guis.map((g) => path.relative(out, g).split(path.sep).join('/')), ['T.gui', '1400w1400h/T.gui', '768w1024h/T.gui']);
  assert.ok(fs.existsSync(path.join(out, '1400w1400h', 'images', 'bg.png')));
  const files = buildFilesAll([main, square, tall]).map(([f]) => f);
  assert.equal(files[0], 'T.gui');
  assert.ok(files.includes('1400w1400h/T.gui') && files.includes('768w1024h/images/bg.png'));
});

test('screen sizes: with runtime themes each look is built at the size; sizes are checked', async () => {
  const themed = await build(`const { width } = screen();
export default (
  <Project name="T" width={1024} height={768} themes={['dark', 'light']}>
    <Page name="Main"><Text w={width} h={30} text="Hi" color={variant() === 'light' ? '#000000' : '#FFFFFF'} /></Page>
  </Project>
);`);
  assert.match(themed.xml, /<txt [^>]*w="1024"/);
  await fails(`export default (<Project name="T" width={1024} height={768} sizes={['big']}><Page name="P" /></Project>);`, /sizes: "big" isn't a size/);
  await fails(`export default (<Project name="T" width={1024} height={768} sizes={['1024x768']}><Page name="P" /></Project>);`, /sizes: 1024x768 - a screen of that size is there twice/);
});

test('a phone\'s dense screen: 1400x1400@3x is laid out at 467x467 for iViewer to scale up, its drawings that sharp, in the screen\'s folder', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-dense-'));
  const entry = path.join(dir, 'app.jsx');
  fs.writeFileSync(entry, `const { width, scale } = screen();
export default (
  <Project name="T" width={1280} height={800} sizes={['1400x1400@3x']}>
    <Page name="Main"><Box x={16} y={16} w={width - 32} h={100} bg="#336699" radius={8} /><Text y={200} w={300} h={30} text={'x' + (scale ?? 1)} /></Page>
  </Project>
);`);
  const main = await compile(entry);
  assert.deepEqual(main.sizes, [{ width: 467, height: 467, scale: 3, device: { width: 1400, height: 1400 } }]);
  const phone = await compile(entry, { size: main.sizes[0] });
  assert.match(phone.xml, /<portrait width="467" height="467" \/>\s*<landscape width="467" height="467" \/>/);
  assert.match(phone.xml, /<size autoposition="scale">/);
  assert.match(phone.xml, />x3<\/txt>/);
  // the box drawn at 3x (435 wide -> 1305 px), no @2x besides
  const box = phone.assets.find((a) => /iva_box_/.test(a.name))!;
  assert.equal(box.data!.readUInt32BE(16), 435 * 3);
  assert.ok(!phone.assets.some((a) => a.name.includes('@2x')));
  assert.ok(main.assets.some((a) => a.name.includes('@2x')));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-dense-dist-'));
  assert.deepEqual(writeBuilds([main, phone], out).map((g) => path.relative(out, g).split(path.sep).join('/')), ['T.gui', '1400w1400h/T.gui']);
  await assert.rejects(compile(entry, { size: '1400x1400@9x' }), /size: "1400x1400@9x" isn't one/);
});

test('<Project licenses>: the devices licensed to run it, in <properties> as GUI Designer writes them', async () => {
  const r = await build(`export default (
  <Project name="T" width={1024} height={768} licenses={{ 'Kitchen iPad': '8437f51dccd3f92ea6898a980aca0259', 'Phone': 'B61C91A1867233DEC98FE9605E2AA91B' }}>
    <Page name="Main" />
  </Project>
);`);
  assert.match(r.xml, /<debug [^>]*\/>\s*<devices>\s*<device name="Kitchen iPad">8437F51DCCD3F92EA6898A980ACA0259<\/device>\s*<device name="Phone">B61C91A1867233DEC98FE9605E2AA91B<\/device>\s*<\/devices>\s*<\/properties>/);
  await fails(`export default (<Project name="T" width={1024} height={768} licenses={{ 'Phone': '12345' }}><Page name="P" /></Project>);`, /licenses: "Phone": "12345" isn't a device code/);
});

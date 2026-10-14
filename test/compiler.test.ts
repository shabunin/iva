import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import { compile, IvaError } from '../src/compiler/index.ts';
import { circle } from '../src/compiler/images.ts';
import { parseGUI } from '../../agapi/packages/cf-runtime/src/parser.ts';

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
  const r = await build(wrap(`<Text w={10} h={10} bg="#00000080" />`));
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
  assert.equal(pngs.length, 3);
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

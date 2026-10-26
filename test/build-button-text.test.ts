/**
 * A button state's text as iViewer reads it: every character, newlines too,
 * its lines centred. So iva writes the text and an icon's <img> on one line,
 * as GUI Designer does (whitespace between them would be lines of text), and
 * reads a state's text back to the character - Designer's '\n\nUNLOCK' puts
 * the word under its icon.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { compile } from '../src/compiler/index.ts';
import { circle } from '../src/compiler/images.ts';
import { decompile } from '../src/decompiler/index.ts';
import { compareGui } from '../src/decompiler/compare.ts';
import { tmpDir } from './tmp.ts';

const ECHO = path.resolve(import.meta.dirname, '../fixtures/local/echo-system/echo.gui');

async function build(jsx: string, files: Record<string, Buffer> = {}) {
  const dir = tmpDir('iva-btn-text-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), data);
  return compile(path.join(dir, 'app.jsx'));
}

const wrap = (body: string) => `export default (
  <Project name="T" width={1024} height={768}>
    <Page name="Main">${body}</Page>
  </Project>
);`;

/** each <inactive>'s text, all its text nodes as an XML reader gives them */
const states = (xml: string) => Array.from(new DOMParser().parseFromString(xml, 'text/xml').getElementsByTagName('inactive'))
  .map((s) => Array.from(s.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join(''));

test('text and an icon: on one line, as GUI Designer writes them - the text iViewer reads is the text given', async () => {
  const r = await build(wrap(`
    <Button w={200} h={80} icon={fa('lightbulb')} iconAlign="left" text="Lamp" />
    <Button y={100} w={92} h={70} icon={{ src: './unlock.png', x: 20, y: 0, w: 52, h: 52 }} text={'\\n\\nUNLOCK'} />
    <Button y={200} w={80} h={80} icon={fa('lightbulb')} />
    <Image y={300} w={52} h={52} src="./unlock.png"><Gesture type="tap" onBegin="x()" /></Image>`), { 'unlock.png': circle(52, '#fff') });
  assert.match(r.xml, /<inactive s="0">Lamp<img x="20" y="20" w="40" h="40">icons\/lightbulb\.png<\/img><\/inactive>/);
  assert.match(r.xml, /<active s="0">\n\nUNLOCK<img x="20" y="0" w="52" h="52">unlock\.png<\/img><\/active>/);
  assert.deepEqual(states(r.xml).slice(0, 2), ['Lamp', '\n\nUNLOCK']);
  // an image's file name and its gestures the same way (Designer's dial demo)
  assert.match(r.xml, /clearOnURLChange="0">unlock\.png<gesture[^>]*><action [^>]*\/><\/gesture><\/img>\r\n/);
  // an icon alone: one element a line, as before
  assert.match(r.xml, /<inactive s="0">\r\n\s+<img x="20" y="20" w="40" h="40">icons\/lightbulb\.png<\/img>\r\n\s+<\/inactive>/);
});

test("Designer's '\\n\\nUNLOCK' over an icon: decompiled to the character, built back the same", async () => {
  const dir = tmpDir('iva-unlock-');
  const icon = '<img x="20" y="0" w="52" h="52">unlock.png</img>';
  const gui = fs.readFileSync(ECHO, 'utf8')
    .replace('<inactive s="0">Send Ping</inactive>', `<inactive s="0">\r\n\r\nUNLOCK${icon}</inactive>`)
    .replace('<active s="0">Send Ping</active>', `<active s="0">\r\n\r\nUNLOCK${icon}</active>`);
  fs.writeFileSync(path.join(dir, 'unlock.gui'), gui);
  const out = tmpDir('iva-unlock-dec-');
  const d = await decompile(path.join(dir, 'unlock.gui'), out);
  assert.deepEqual([d.differences, d.raw], [[], {}]);
  assert.match(fs.readFileSync(path.join(out, 'pages/Main.jsx'), 'utf8'), /text=\{`\n\nUNLOCK`\}/);
  const r = await compile(d.entry);
  assert.equal(states(r.xml)[0], '\n\nUNLOCK');
  assert.deepEqual(compareGui(gui, r.xml), []);
  // and a state that says otherwise is a difference
  assert.match(compareGui(gui, r.xml.replace('\n\nUNLOCK', 'UNLOCK')).join('\n'), /inactive\[0\]\/text\(\): "\\n\\nUNLOCK" vs "UNLOCK"/);
});

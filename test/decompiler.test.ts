import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decompile } from '../src/decompiler/index.ts';
import { compareGui } from '../src/decompiler/compare.ts';
import { compile } from '../src/compiler/index.ts';
import { findGuis } from '../src/server/project.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEMOS = path.join(ROOT, 'fixtures/DemoUserInterfaces');

async function roundTrip(gui: string) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-dec-'));
  try {
    const d = await decompile(gui, out);
    const r = await compile(d.entry);
    return { d, diffs: compareGui(fs.readFileSync(gui, 'utf8'), r.xml), app: fs.readFileSync(d.entry, 'utf8'), out };
  } finally {
    // kept for the assertions on files; tmp is cleaned by the OS
  }
}

test('a hand-written .gui comes back the same', async () => {
  const { diffs, d } = await roundTrip(path.join(ROOT, 'fixtures/local/echo-system/echo.gui'));
  assert.deepEqual(diffs, []);
  assert.deepEqual(d.differences, []);
  assert.deepEqual(d.raw, {});
});

test('what iva does not know survives: attributes, elements, sections, number formats', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-odd-'));
  const gui = fs.readFileSync(path.join(ROOT, 'fixtures/local/echo-system/echo.gui'), 'utf8')
    .replace('<btn j="0" x="80" y="80"', '<btn j="0" x="080" y="80" futureAttr="yes"')
    .replace('t="Big" wrap="False"', 't="Big" wrap="Maybe"')
    .replace('</txt>', '</txt>\n      <sparkle j="3" x="1" y="2" w="3" h="4"><glow /></sparkle>')
    .replace('</gui>', '  <devices><device name="x" /></devices>\n</gui>');
  fs.writeFileSync(path.join(dir, 'odd.gui'), gui);
  const { diffs, d, out } = await roundTrip(path.join(dir, 'odd.gui'));
  assert.deepEqual(diffs, []);
  const page = fs.readFileSync(path.join(out, 'pages/Main.jsx'), 'utf8');
  assert.match(page, /futureAttr: "yes"/);
  assert.match(page, /x: "080"/);
  assert.match(page, /<Raw xml=\{`<sparkle/);
  assert.equal(d.raw.sparkle, 1);
});

test('the decompiled project reads like code', async () => {
  const { app, out } = await roundTrip(path.join(ROOT, 'fixtures/local/echo-system/echo.gui'));
  assert.match(app, /import MainPage from '\.\/pages\/Main\.jsx';/);
  const page = fs.readFileSync(path.join(out, 'pages/Main.jsx'), 'utf8');
  assert.match(page, /<Button x=\{80\} y=\{80\} w=\{240\} h=\{80\} theme="Btn" text="Send Ping" cmd="Ping" \/>/);
  const systems = fs.readFileSync(path.join(out, 'systems.jsx'), 'utf8');
  assert.match(systems, /<Capture join="s10" \/>/);
});

test('CommandFusion demos: every one compiles back to the same .gui', { skip: !fs.existsSync(DEMOS) && 'npm run fixtures' }, async () => {
  const failed: string[] = [];
  for (const g of findGuis(DEMOS)) {
    const { diffs } = await roundTrip(path.join(DEMOS, g.rel));
    if (diffs.length) failed.push(`${g.rel}: ${diffs[0]}`);
  }
  assert.deepEqual(failed, []);
});

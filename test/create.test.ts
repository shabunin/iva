import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { create, templates, writeDocs } from '../src/create.ts';
import { check } from '../src/check.ts';
import { tmpDir } from './tmp.ts';

const tmp = () => path.join(tmpDir('iva-create-'), 'panel');

for (const template of templates()) {
  test(`template ${template}: created, checks clean, builds`, async () => {
    const r = await create(tmp(), { template });
    for (const f of ['app.jsx', 'iva.d.ts', 'jsconfig.json', 'IVA.md', 'IVA-UI.md', 'IVA-WEB.md', 'AGENTS.md', 'CLAUDE.md', 'README.md', '.gitignore']) {
      assert.ok(fs.existsSync(path.join(r.dir, f)), f);
    }
    assert.deepEqual(r.warnings, []);
    const c = await check(path.join(r.dir, 'app.jsx'));
    assert.deepEqual(c.problems, []);
  });
}

test('a device sets the panel size', async () => {
  const r = await create(tmp(), { device: 'iPhone X' });
  assert.match(fs.readFileSync(path.join(r.dir, 'app.jsx'), 'utf8'), /device="iPhone X"/);
  await assert.rejects(create(tmp(), { device: 'iPhone Y' }), /no device "iPhone Y" \(did you mean "iPhone X"\?\)/);
});

test('check: what the editor underlines, and the build', async () => {
  const r = await create(tmp(), { template: 'blank' });
  const app = path.join(r.dir, 'app.jsx');
  fs.writeFileSync(app, fs.readFileSync(app, 'utf8').replace('fontSize={34}', 'fontSise={34}'));
  const c = await check(app);
  assert.equal(c.problems.length, 2); // the editor's and the build's
  assert.match(c.problems[0], /app\.jsx:4:\d+: .*'fontSise' does not exist .*Did you mean 'fontSize'\?/s);
  assert.match(c.problems[1], /unknown prop "fontSise" \(did you mean "fontSize"\?\)/);
});

test('from a .gui: decompiled, with the same extras', async () => {
  const r = await create(tmp(), { from: path.resolve(import.meta.dirname, '../fixtures/local/echo-system/echo.gui') });
  assert.ok(fs.existsSync(path.join(r.dir, 'pages/Main.jsx')));
  assert.ok(fs.existsSync(path.join(r.dir, 'iva.d.ts')));
  const c = await check(path.join(r.dir, 'app.jsx'));
  assert.deepEqual(c.problems, []);
});

test("the references in a project: iva's docs copied, their links to each other pointing at the copies; iva types writes them again", async () => {
  const r = await create(tmp(), { template: 'blank' });
  const ui = fs.readFileSync(path.join(r.dir, 'IVA-UI.md'), 'utf8');
  assert.match(ui, /^<!-- iva \S+: a copy of iva's docs\/ui\.md, written by `iva types` - don't edit\. -->\n/);
  assert.ok(ui.includes('](IVA-WEB.md)') && !ui.includes('](web.md)'), 'ui.md links to web.md as the copy');
  const main = fs.readFileSync(path.join(r.dir, 'IVA.md'), 'utf8');
  assert.ok(main.includes('](IVA-UI.md)') && main.includes('](IVA-WEB.md)') && !/\]\((ui|web)\.md\)/.test(main));
  assert.ok(!main.includes('docs/web.md'), 'the link text too');
  assert.match(main, /# iva base components/);
  // the notes point an assistant at them
  const agents = fs.readFileSync(path.join(r.dir, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('IVA-UI.md') && agents.includes('IVA-WEB.md') && !agents.includes("iva's docs/"));
  // written again (a newer iva): the same files
  fs.writeFileSync(path.join(r.dir, 'IVA-UI.md'), 'stale');
  assert.deepEqual(writeDocs(r.dir), ['IVA.md', 'IVA-UI.md', 'IVA-WEB.md']);
  assert.notEqual(fs.readFileSync(path.join(r.dir, 'IVA-UI.md'), 'utf8'), 'stale');
});

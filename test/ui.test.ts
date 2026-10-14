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
  assert.deepEqual(r.scripts.map((s) => s.name), ['iva-joins.js', 'iva-ui.js', 'iva-start.js']);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaUI\.menu\(/g)!.length, 1); // the side menu is on every page, set up once
  assert.equal(start.match(/IvaUI\.clock\(/g)!.length, 1);
  assert.equal((r.xml.match(/<subpage name="ui_menu" w=/g) ?? []).length, 1);
  assert.equal((r.xml.match(/<subpage name="ui_menu" x=/g) ?? []).length, 5);
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

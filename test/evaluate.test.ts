import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { compile, IvaError } from '../src/compiler/index.ts';
import { evaluate } from '../src/compiler/load.ts';
import { tmpDir } from './tmp.ts';

v8.setFlagsFromString('--expose-gc');
const gc: () => void = vm.runInNewContext('gc');

function project(jsx: string): string {
  const dir = tmpDir('iva-eval-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  return path.join(dir, 'app.jsx');
}

const APP = `export default (
  <Project name="T" width={1024} height={768}>
    <Page name="Main"><Button w={10} h={10} /></Page>
  </Project>
);`;

test('an evaluated project is freed with its tree (iva dev runs out of memory otherwise)', async () => {
  const entry = project(APP);
  // only a WeakRef leaves this function
  const refs = await (async () => {
    const out: WeakRef<object>[] = [];
    for (let i = 0; i < 3; i++) out.push(new WeakRef((await evaluate(entry)).tree as object));
    return out;
  })();
  // a WeakRef holds its target until the current job ends
  await new Promise((r) => setTimeout(r, 10));
  gc();
  assert.deepEqual(refs.map((r) => r.deref() === undefined), [true, true, true]);
});

test("an exception in the project's code points at its line", async () => {
  const entry = project(`function Broken() {
  const a = 1;
  throw new Error('no ' + a);
}
export default (
  <Project name="T" width={1024} height={768}>
    <Page name="Main"><Broken /></Page>
  </Project>
);`);
  await assert.rejects(compile(entry), (e: any) => {
    assert.ok(e instanceof IvaError, `not an IvaError: ${e}`);
    assert.equal(e.message, 'no 1');
    assert.equal(e.file, entry);
    assert.equal(e.line, 3);
    return true;
  });
});

test('a project with top-level await still evaluates', async () => {
  const entry = project(`const name = await Promise.resolve('Main');
export default (
  <Project name="T" width={1024} height={768}>
    <Page name={name}><Button w={10} h={10} /></Page>
  </Project>
);`);
  const r = await compile(entry);
  assert.match(r.xml, /<page name="Main"/);
});

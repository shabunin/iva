import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';

test('compile() run several times at once (iva serve: a save while a build runs) builds each as if alone - one at a time, the globals its own', async () => {
  const dir = tmpDir('iva-serial-');
  const entry = path.join(dir, 'app.jsx');
  fs.writeFileSync(entry, `const bg = variant() === 'light' ? '#eeeeee' : '#111111';
export default (
  <Project name="T" width={400} height={300} themes={['dark', 'light']}>
    <Page name="Home" bg={bg}><Box w={100} h={40} bg={bg} radius={8} /><Text x={0} y={0} w={100} h={40} text={'look ' + variant()} color={variant() === 'light' ? '#000000' : '#ffffff'} /></Page>
  </Project>
);`);
  const alone = await compile(entry);
  const names = (r: typeof alone) => r.assets.map((a) => a.name).sort();
  const results = await Promise.all([1, 2, 3, 4].map(() => compile(entry)));
  for (const r of results) {
    assert.equal(r.xml, alone.xml);
    assert.deepEqual(names(r), names(alone));
  }
  // one failing doesn't hold up the next
  const [failed, next] = await Promise.allSettled([compile(path.join(dir, 'missing.jsx')), compile(entry)]);
  assert.equal(failed.status, 'rejected');
  assert.equal(next.status === 'fulfilled' && next.value.xml, alone.xml);
});

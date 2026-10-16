import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { watchInputs } from '../src/server/watch.ts';
import { tmpDir } from './tmp.ts';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('watchInputs: the files a build read and the assets folder, nothing else', async () => {
  const dir = tmpDir('iva-watch-');
  const shared = tmpDir('iva-shared-');
  const app = path.join(dir, 'app.jsx');
  const comp = path.join(shared, 'Card.jsx');
  fs.mkdirSync(path.join(dir, 'assets'));
  for (const f of [app, comp]) fs.writeFileSync(f, 'x');
  const seen: string[] = [];
  const w = watchInputs((f) => seen.push(path.basename(f)));
  w.set({ files: [app, comp], dirs: [path.join(dir, 'assets')] });
  await wait(100);
  try {
    fs.writeFileSync(path.join(dir, 'dev.log'), 'log'); // next to the project: not an input
    await wait(400);
    assert.deepEqual(seen, []);
    fs.writeFileSync(comp, 'y'); // outside the project, imported
    await wait(400);
    assert.deepEqual(seen, ['Card.jsx']);
    fs.writeFileSync(`${app}.tmp`, 'z'); // an editor saving by rename
    fs.renameSync(`${app}.tmp`, app);
    await wait(400);
    assert.equal(seen.at(-1), 'app.jsx');
    fs.writeFileSync(path.join(dir, 'assets', 'new.png'), 'png'); // a new asset
    await wait(400);
    assert.equal(seen.at(-1), 'new.png');
  } finally {
    w.close();
  }
});

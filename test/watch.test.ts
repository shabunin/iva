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

test("watchInputs: what a build writes while it runs (and then reads) doesn't build again; a later edit of it does", async () => {
  const dir = tmpDir('iva-watch-');
  const app = path.join(dir, 'app.jsx');
  const drawn = path.join(dir, '.neu');
  const old = path.join(drawn, 'neu-a.png');
  const made = path.join(drawn, 'neu-b.png');
  fs.mkdirSync(drawn);
  fs.writeFileSync(app, 'x');
  fs.writeFileSync(old, 'a');
  let builds = 0;
  // a build as neu/paint.js runs in one: it draws a new picture into a folder already watched (synchronously, as the
  // build evaluates), and the picture is one of the files the build read
  const w = watchInputs(() => {
    builds++;
    if (!fs.existsSync(made)) {
      fs.writeFileSync(`${made}.tmp`, 'b');
      fs.renameSync(`${made}.tmp`, made);
    }
    w.set({ files: [app, old, made], dirs: [] });
  });
  w.set({ files: [app, old], dirs: [] });
  await wait(100);
  try {
    fs.writeFileSync(app, 'y');
    await wait(800);
    assert.equal(builds, 1);
    fs.writeFileSync(made, 'bb'); // the picture changed after the build: build again
    await wait(800);
    assert.equal(builds, 2);
  } finally {
    w.close();
  }
});

test('watchInputs: an edit while a build runs (after the build read the file) builds again after it', async () => {
  const dir = tmpDir('iva-watch-');
  const app = path.join(dir, 'app.jsx');
  fs.writeFileSync(app, 'x');
  let builds = 0;
  const w = watchInputs(() => {
    // the build reads app.jsx, then it's saved again before the build ends
    if (++builds === 1) fs.writeFileSync(app, 'zzz');
    w.set({ files: [app], dirs: [] });
  });
  w.set({ files: [app], dirs: [] });
  await wait(100);
  try {
    fs.writeFileSync(app, 'yy');
    await wait(1200);
    assert.equal(builds, 2);
  } finally {
    w.close();
  }
});

test('watchInputs: a drawing a build makes again, seen while the build runs (a look evaluated, then the next), builds once', async () => {
  const dir = tmpDir('iva-watch-');
  const app = path.join(dir, 'app.jsx');
  const drawn = path.join(dir, '.neu');
  const drawing = path.join(drawn, 'neu-knob-40x40-9dcc8e0d22.png');
  fs.mkdirSync(drawn);
  fs.writeFileSync(app, 'x');
  fs.writeFileSync(drawing, 'a');
  let builds = 0;
  // as a project with themes builds: neu/paint.js draws what's missing as the first look evaluates, and fs.watch
  // tells of it before the build is over (the second look is evaluated after an await)
  const w = watchInputs(async () => {
    builds++;
    if (!fs.existsSync(drawing)) {
      fs.writeFileSync(`${drawing}.tmp`, 'b');
      fs.renameSync(`${drawing}.tmp`, drawing);
    }
    await wait(500);
    w.set({ files: [app, drawing], dirs: [] });
  });
  w.set({ files: [app, drawing], dirs: [] });
  await wait(100);
  try {
    fs.rmSync(drawing); // a drawing the last build read, removed: drawn again by the build it starts
    await wait(1500);
    assert.equal(builds, 1);
    fs.writeFileSync(drawing, 'bb'); // changed after the build: build again
    await wait(1100);
    assert.equal(builds, 2);
  } finally {
    w.close();
  }
});

test('watchInputs: a save seen while a build runs builds again once that build is over, not alongside it', async () => {
  const dir = tmpDir('iva-watch-');
  const app = path.join(dir, 'app.jsx');
  fs.writeFileSync(app, 'x');
  let builds = 0;
  let running = 0;
  let most = 0;
  const w = watchInputs(async () => {
    builds++;
    most = Math.max(most, ++running);
    // the build reads app.jsx, then it's saved again and fs.watch tells of it before the build ends
    if (builds === 1) fs.writeFileSync(app, 'zzz');
    await wait(500);
    w.set({ files: [app], dirs: [] });
    running--;
  });
  w.set({ files: [app], dirs: [] });
  await wait(100);
  try {
    fs.writeFileSync(app, 'yy');
    await wait(2000);
    assert.equal(builds, 2);
    assert.equal(most, 1);
  } finally {
    w.close();
  }
});

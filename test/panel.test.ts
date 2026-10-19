import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip } from '../src/server/zip.ts';
import { folderManifest, loadManifest, savedManifest, toSave, unpackPlan, unzip, useFetch } from '../panel/loader.ts';

const GUI = '<gui><properties><project>Kept</project><imagefolder>images</imagefolder></properties><scripts><script name="scripts/main.js" /></scripts></gui>';
const MAIN = 'var answer = 42;\n'.repeat(40);

test("the panel reads iva's zips: deflated, a thousand files and more (iva serve's whole build)", async () => {
  const icons = Array.from({ length: 1500 }, (_, i): [string, Buffer] => [`images/icons/i${i}.png`, Buffer.from(`png ${i} `.repeat(30))]);
  const zip = writeZip([['app.gui', Buffer.from(GUI)], ['images/scripts/main.js', Buffer.from(MAIN)], ...icons]);
  const files = await unzip(new Uint8Array(zip));
  assert.equal(files.size, 1502);
  assert.equal(new TextDecoder().decode(files.get('images/scripts/main.js')), MAIN);
  assert.equal(new TextDecoder().decode(files.get('images/icons/i1499.png')), 'png 1499 '.repeat(30));
});

test('a GUI runs from its copy on the device: an archive, or a .gui and the files beside it - the images it names', async () => {
  const gui = GUI.replace('</scripts>', '</scripts><pages><page name="P"><img>icons/a.png</img></page></pages>');
  // beside the one it names: its @2x (iViewer's retina screens) and another size's - not its images
  const extra = { 'images/icons/a@2x.png': 'png2x', '1400w1400h/images/icons/b.png': 'other' };
  const zip = writeZip([['app.gui', Buffer.from(gui)], ['images/scripts/main.js', Buffer.from(MAIN)], ['images/icons/a.png', Buffer.from('png')],
    ...Object.entries(extra).map(([n, s]): [string, Buffer] => [n, Buffer.from(s)])]);
  const fromZip = await savedManifest({ url: 'http://10.0.0.2:8019', zip: new Uint8Array(zip), savedAt: 0, bytes: zip.length });
  const enc = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
  const fromFiles = await savedManifest({
    url: 'http://10.0.0.2/gui/app.gui',
    files: { 'app.gui': enc(gui), 'images/scripts/main.js': enc(MAIN), 'images/icons/a.png': enc('png'), ...Object.fromEntries(Object.entries(extra).map(([n, s]) => [n, enc(s)])) },
    gui,
    savedAt: 0,
    bytes: 0,
  });
  for (const m of [fromZip, fromFiles]) {
    assert.equal(m.title, 'Kept');
    assert.equal(m.scriptMap['scripts/main.js'], MAIN);
    assert.deepEqual(m.missingScripts, []);
    // its images by their path in the image folder, and by name - the ones it names only
    assert.match(m.imageMap['icons/a.png'], /^blob:/);
    assert.equal(m.imageMap['a.png'], m.imageMap['icons/a.png']);
    assert.deepEqual(Object.keys(m.imageMap).sort(), ['a.png', 'icons/a.png']);
    assert.match(m.fileUrl('icons/a.png') ?? '', /^blob:/);
  }
});

test("a GUI's images in sheets (iva-atlas/ beside the .gui, as the app packs them): each sheet a file, each image's frame - the size run's own; none without", async () => {
  const gui = GUI.replace('</scripts>', '</scripts><pages><page name="P"><img>icons/a.png</img></page></pages>');
  const map = (n: number) => Buffer.from(JSON.stringify({ version: 1, sheets: [{ file: 'sheet-0.png', w: 64, h: 64, group: 'page:P' }], frames: { 'icons/a.png': [0, 2, 2, n, n] } }));
  const files: [string, Buffer][] = [
    ['app.gui', Buffer.from(gui)], ['images/scripts/main.js', Buffer.from(MAIN)], ['images/icons/a.png', Buffer.from('png')],
    ['iva-atlas/atlas.json', map(10)], ['iva-atlas/sheet-0.png', Buffer.from('sheet')],
  ];
  const zip = new Uint8Array(writeZip(files));
  const m = await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip, savedAt: 0, bytes: zip.length });
  assert.ok(m.atlas);
  assert.match(m.atlas.sheets[0], /^blob:/);
  assert.deepEqual(m.atlas.files, ['sheet-0.png']);
  assert.deepEqual(m.atlas.frames['icons/a.png'], [0, 2, 2, 10, 10]);
  // the image on its own still there (if a sheet doesn't come)
  assert.match(m.imageMap['icons/a.png'], /^blob:/);
  // a sheet missing, or no map: the images one by one
  const noSheet = new Uint8Array(writeZip(files.filter(([n]) => n !== 'iva-atlas/sheet-0.png')));
  assert.equal((await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip: noSheet, savedAt: 0, bytes: 0 })).atlas, undefined);
  const noMap = new Uint8Array(writeZip(files.filter(([n]) => !n.startsWith('iva-atlas/'))));
  assert.equal((await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip: noMap, savedAt: 0, bytes: 0 })).atlas, undefined);
  // in several sizes: the map beside the .gui run
  const sized = (w: number, h: number) => Buffer.from(gui.replace('<imagefolder>', `<size><portrait width="${h}" height="${w}" /><landscape width="${w}" height="${h}" /></size><imagefolder>`));
  const both = new Uint8Array(writeZip([
    ['app.gui', sized(1280, 800)], ['iva-atlas/atlas.json', map(10)], ['iva-atlas/sheet-0.png', Buffer.from('a')],
    ['1400w1400h/app.gui', sized(467, 467)], ['1400w1400h/iva-atlas/atlas.json', map(30)], ['1400w1400h/iva-atlas/sheet-0.png', Buffer.from('b')],
  ]));
  const g = globalThis as { screen?: { width: number; height: number } };
  try {
    g.screen = { width: 1440, height: 1440 };
    const square = await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip: both, savedAt: 0, bytes: 0 });
    assert.deepEqual(square.atlas?.frames['icons/a.png'], [0, 2, 2, 30, 30]);
  } finally {
    delete g.screen;
  }
});

test("a zipped GUI's size run, for the app to unpack and pack (not another size's files, not the @2x ones, not sheets of its own; its PNGs by group, in their sheets' order); the next start from the folder, its sheets in", async () => {
  const sized = (w: number, h: number) => GUI.replace('<imagefolder>', `<size><portrait width="${h}" height="${w}" /><landscape width="${w}" height="${h}" /></size><imagefolder>`)
    .replace('</scripts>', '</scripts><pages><page name="P"><img>icons/a.png</img><img>icons/b.png</img><img>Shared.png</img></page><page name="Q"><img>shared.png</img><img>photo.jpg</img></page></pages><web url="page.html" />');
  const zip = new Uint8Array(writeZip([
    ['app.gui', Buffer.from(sized(1280, 800))], ['images/scripts/main.js', Buffer.from(MAIN)], ['images/icons/a.png', Buffer.from('png a')],
    ['images/icons/b.png', Buffer.from('png b')], ['images/Shared.png', Buffer.from('png s')], ['images/photo.jpg', Buffer.from('jpg')],
    ['images/icons/a@2x.png', Buffer.from('retina')], ['images/page.html', Buffer.from('<p>hi</p>'.repeat(20))],
    ['iva-atlas/atlas.json', Buffer.from('{}')],
    ['1400w1400h/app.gui', Buffer.from(sized(467, 467))], ['1400w1400h/images/scripts/main.js', Buffer.from(MAIN)], ['1400w1400h/images/icons/a.png', Buffer.from('square a')],
  ]));
  const g = globalThis as { screen?: { width: number; height: number }; window?: unknown };
  g.screen = { width: 1920, height: 1080 };
  try {
    const plan = await unpackPlan(zip, 'http://10.0.0.2/app.gui.zip');
    assert.deepEqual([...plan.files].sort(), ['app.gui', 'images/Shared.png', 'images/icons/a.png', 'images/icons/b.png', 'images/page.html', 'images/photo.jpg', 'images/scripts/main.js']);
    assert.equal(plan.atlas, 'iva-atlas');
    // its images to pack: the shared one first; no JPEG
    const m = await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip, savedAt: 0, bytes: zip.length });
    assert.deepEqual(m.toPack!(), [['images/Shared.png', 'shared.png', 'shared'], ['images/icons/a.png', 'icons/a.png', 'page:P'], ['images/icons/b.png', 'icons/b.png', 'page:P']]);
    // the next start: from the folder the app unpacked it into (each file by its URL: the asset protocol), its sheets beside the .gui
    const disk = new Map<string, string>([...plan.files.map((n): [string, string] => [n, n === 'images/scripts/main.js' ? MAIN : n === 'app.gui' ? sized(1280, 800) : `file ${n}`]),
      ['iva-atlas/atlas.json', JSON.stringify({ version: 1, sheets: [{ file: 's1-0.png', w: 8, h: 8, group: 'page:P' }], frames: { 'icons/b.png': [0, 2, 2, 4, 4] } })], ['iva-atlas/s1-0.png', 'sheet']]);
    const urls = new Map([...disk].map(([n, text]) => [`/data/gui/${n}`, URL.createObjectURL(new Blob([text]))]));
    g.window = { __TAURI_INTERNALS__: { convertFileSrc: (path: string) => urls.get(path) ?? 'missing' } };
    const next = await folderManifest({ root: '/data/gui', files: [...disk.keys()] }, 'http://10.0.0.2/app.gui.zip');
    assert.equal(next.title, 'Kept');
    assert.equal(next.scriptMap['scripts/main.js'], MAIN);
    assert.equal(next.imageMap['icons/a.png'], urls.get('/data/gui/images/icons/a.png'));
    assert.equal(next.imageMap['a.png'], next.imageMap['icons/a.png']);
    assert.deepEqual(next.atlas?.sheets, [urls.get('/data/gui/iva-atlas/s1-0.png')]);
    assert.deepEqual(next.atlas?.frames['icons/b.png'], [0, 2, 2, 4, 4]);
    assert.equal(await (await fetch(next.fileUrl('page.html')!)).text(), 'file images/page.html');
    assert.equal(next.toPack?.().length, 3);
  } finally {
    delete g.screen;
    delete g.window;
  }
});

test("a zipped GUI in several sizes (iva build's <Project sizes>): the one shaped like the screen", async () => {
  const sized = (w: number, h: number) => Buffer.from(`<gui><properties><project>${w}x${h}</project><size><portrait width="${h}" height="${w}" /><landscape width="${w}" height="${h}" /></size></properties></gui>`);
  const zip = new Uint8Array(writeZip([['app.gui', sized(1280, 800)], ['1400w1400h/app.gui', sized(467, 467)]]));
  const g = globalThis as { screen?: { width: number; height: number } };
  try {
    for (const [w, h, title] of [[1440, 1440, '467x467'], [1080, 1920, '1280x800'], [2560, 1600, '1280x800']] as const) {
      g.screen = { width: w, height: h };
      const m = await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip, savedAt: 0, bytes: zip.length });
      assert.equal(m.title, title, `a ${w}x${h} screen`);
    }
  } finally {
    delete g.screen;
  }
});

test("a GUI from its server: its scripts fetched a few at a time, a failed one asked for again, then in rounds; one that never comes is missing, with why", async () => {
  const names = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'flaky.js', 'slow.js', 'gone.js'];
  const gui = `<gui><properties><project>Live</project><imagefolder>assets</imagefolder></properties><scripts>${names.map((n) => `<script name="scripts/${n}" />`).join('')}</scripts></gui>`;
  let inFlight = 0;
  let most = 0;
  const tries: Record<string, number> = {};
  const answer = (text: string, server?: string) => ({
    ok: true, status: 200, headers: { get: (h: string) => (h === 'server' ? server ?? null : null) },
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  });
  useFetch((async (url: string) => {
    inFlight++;
    most = Math.max(most, inFlight);
    await new Promise((r) => setTimeout(r, 2));
    inFlight--;
    if (url === 'http://10.0.0.2:8019/') return answer(gui, 'iva');
    const name = url.split('/').pop()!;
    tries[name] = (tries[name] ?? 0) + 1;
    // flaky: the second try; slow: the fourth (a round after the first pass); gone: never
    if (name === 'gone.js' || (name === 'flaky.js' && tries[name] === 1) || (name === 'slow.js' && tries[name] < 4)) throw new Error('connection reset');
    return answer(`// ${name}`);
  }) as any);
  const { manifest: m } = await loadManifest('http://10.0.0.2:8019/');
  assert.equal(m.scriptMap['scripts/flaky.js'], '// flaky.js');
  assert.equal(tries['flaky.js'], 2);
  assert.equal(m.scriptMap['scripts/slow.js'], '// slow.js');
  assert.equal(tries['slow.js'], 4);
  assert.equal(tries['gone.js'], 5);
  assert.equal(Object.keys(m.scriptMap).length, 7);
  assert.deepEqual(m.missingScripts, ['scripts/gone.js']);
  assert.deepEqual(m.problems, ['scripts/gone.js: connection reset (after 5 tries)']);
  assert.ok(most <= 4, `${most} fetches at once`);
  // the scripts' URLs: in the image folder, as iViewer asks for them
  assert.equal(tries['a.js'], 1);
});

test("the copy kept is whole: iva serve's archive asked for twice, else the files - a script the load lost fetched again for it; one still missing: no copy", async () => {
  const names = ['a.js', 'gone.js', 'dead.js'];
  const gui = `<gui><properties><project>Live</project><imagefolder>assets</imagefolder></properties><scripts>${names.map((n) => `<script name="scripts/${n}" />`).join('')}</scripts></gui>`;
  const answer = (text: string, server?: string) => ({
    ok: true, status: 200, headers: { get: (h: string) => (h === 'server' ? server ?? null : null) },
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  });
  const scenario = (fails: Record<string, number>) => {
    const asked: string[] = [];
    useFetch((async (url: string) => {
      const name = url.split('/').pop()!;
      asked.push(name);
      if (url === 'http://10.0.0.2:8019/') return answer(gui, 'iva');
      if ((fails[name] ?? 0) > 0) {
        fails[name]--;
        throw new Error('connection reset');
      }
      return answer(`// ${name}`);
    }) as any);
    return asked;
  };
  // the archive fails both times; gone.js failed every one of the load's five tries and comes the sixth time, for the copy: kept, whole
  let asked = scenario({ 'gui.zip': 2, 'gone.js': 5 });
  let { manifest, got } = await loadManifest('http://10.0.0.2:8019/');
  assert.deepEqual(manifest.missingScripts, ['scripts/gone.js']);
  const saved = await toSave(got, manifest);
  assert.equal(asked.filter((n) => n === 'gui.zip').length, 2);
  assert.ok(saved.gui && !saved.zip, 'the files, not an archive');
  assert.equal(new TextDecoder().decode(saved.files!['assets/scripts/gone.js']), '// gone.js');
  assert.equal(new TextDecoder().decode(saved.files!['assets/scripts/a.js']), '// a.js');
  assert.deepEqual((await savedManifest(saved)).missingScripts, []);
  // dead.js never comes: no copy kept
  asked = scenario({ 'gui.zip': 2, 'dead.js': 99 });
  ({ manifest, got } = await loadManifest('http://10.0.0.2:8019/'));
  await assert.rejects(toSave(got, manifest), /not kept - scripts missing: scripts\/dead\.js/);
});

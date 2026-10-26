import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip } from '../src/server/zip.ts';
import { PARSED_STAMP, appArchive, asTheAppKeeps, fetchGui, folderManifest, layoutOf, loadManifest, manifestOf, newerInApp, newerVersion, savedManifest, toSave, unpackPlan, unzip, useArchives, useFetch, useTurn, type AppKept, type Fetched } from '../panel/loader.ts';

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
    // a start after: the parse and the index kept beside the files (this build's) - its images in sheets, the .gui not read
    const project = { pages: { P: { name: 'P' } } };
    urls.set('/data/parsed.json', URL.createObjectURL(new Blob([JSON.stringify({ stamp: PARSED_STAMP, project, index: next.index })])));
    urls.delete('/data/gui/app.gui');
    const kept = await folderManifest({ root: '/data/gui', files: [...disk.keys()], packed: true, parsed: '/data/parsed.json' }, 'http://10.0.0.2/app.gui.zip');
    assert.deepEqual(kept.project, project);
    assert.equal(kept.guiXml, '');
    assert.equal(kept.title, 'Kept');
    assert.deepEqual(kept.imageMap, next.imageMap);
    assert.deepEqual(kept.scriptMap, next.scriptMap);
    assert.deepEqual(kept.atlas, next.atlas);
    assert.equal(kept.toPack, undefined);
    // another build's: parsed afresh, from the .gui
    urls.set('/data/gui/app.gui', URL.createObjectURL(new Blob([sized(1280, 800)])));
    urls.set('/data/parsed.json', URL.createObjectURL(new Blob([JSON.stringify({ stamp: 'another build', project, index: next.index })])));
    const other = await folderManifest({ root: '/data/gui', files: [...disk.keys()], packed: true, parsed: '/data/parsed.json' }, 'http://10.0.0.2/app.gui.zip');
    assert.equal(other.project, undefined);
    assert.equal(other.guiXml, sized(1280, 800));
    assert.deepEqual(other.imageMap, next.imageMap);
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

test("iva serve's archive is the GUI's own: asked for beside its .gui - another size of the project (at /1080w1920h/) its own path's", async () => {
  const gui = '<gui><properties><project>Live</project><imagefolder>assets</imagefolder></properties><scripts><script name="scripts/a.js" /></scripts></gui>';
  const asked: string[] = [];
  useFetch((async (url: string) => {
    asked.push(url);
    if (url.endsWith('/gui.zip')) throw new Error('connection reset');
    return {
      ok: true, status: 200, headers: { get: (h: string) => (h === 'server' && !url.endsWith('.js') ? 'iva' : null) },
      arrayBuffer: async () => new TextEncoder().encode(url.endsWith('.js') ? '// a' : gui).buffer,
    };
  }) as any);
  for (const at of ['http://10.0.0.2:8019/1080w1920h/', 'http://10.0.0.2:8019/']) {
    asked.length = 0;
    const { manifest, got } = await loadManifest(at);
    await toSave(got, manifest);
    assert.deepEqual(asked.filter((u) => u.endsWith('/gui.zip')), [`${at}__iva/gui.zip`, `${at}__iva/gui.zip`]);
    // its files beside it too
    assert.ok(asked.includes(`${at}assets/scripts/a.js`), asked.join('\n'));
  }
});

test("a GUI in sizes laid out each one way (iva build's: 1080x1920 portrait, 1280x800 landscape): the one for the way the screen is turned, and which for each", async () => {
  // a size's pages in one orientation (the other written empty, as GUI Designer does)
  const sized = (w: number, h: number, turn: 'landscape' | 'portrait') => {
    const page = turn === 'landscape' ? '<landscape><img>a.png</img></landscape><portrait />' : '<portrait><img>a.png</img></portrait><landscape />';
    return Buffer.from(`<gui><properties><project>${w}x${h}</project><size><portrait width="${Math.min(w, h)}" height="${Math.max(w, h)}" /><landscape width="${Math.max(w, h)}" height="${Math.min(w, h)}" /></size></properties><pages><page name="P">${page}</page></pages></gui>`);
  };
  const zip = new Uint8Array(writeZip([
    ['app.gui', sized(1280, 800, 'landscape')], ['1400w1400h/app.gui', sized(467, 467, 'landscape')], ['1080w1920h/app.gui', sized(432, 768, 'portrait')],
  ]));
  const g = globalThis as { screen?: { width: number; height: number } };
  try {
    // a phone, its screen as it reports it (portrait), turned either way
    g.screen = { width: 1080, height: 1920 };
    useTurn('portrait');
    const up = await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip, savedAt: 0, bytes: zip.length });
    assert.equal(up.title, '432x768');
    assert.equal(up.size, '1080w1920h/');
    assert.deepEqual(up.sizes, { landscape: '', portrait: '1080w1920h/' });
    useTurn('landscape');
    const side = await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip, savedAt: 0, bytes: zip.length });
    assert.equal(side.title, '1280x800');
    assert.equal(side.size, '');
    // what the app unpacks: that size's files
    const plan = await unpackPlan(zip, 'http://10.0.0.2/app.gui.zip');
    assert.deepEqual([plan.size, plan.files], ['', ['app.gui']]);
    useTurn('portrait');
    assert.deepEqual((await unpackPlan(zip, 'http://10.0.0.2/app.gui.zip')).files, ['1080w1920h/app.gui']);
    // a square screen: the square size, either way
    g.screen = { width: 1440, height: 1440 };
    useTurn('landscape');
    assert.equal((await savedManifest({ url: 'http://10.0.0.2/app.gui.zip', zip, savedAt: 0, bytes: zip.length })).title, '467x467');
  } finally {
    delete g.screen;
    useTurn(undefined);
  }
});

test('the orientations a .gui is laid out in: a page with something in its <portrait>, its <landscape>; its sizes each way', () => {
  const both = layoutOf('<gui><properties><size><portrait width="768" height="1024" /><landscape width="1024" height="768" /></size></properties><pages><page name="P"><portrait><btn /></portrait><landscape><btn /></landscape></page></pages></gui>');
  assert.deepEqual([...both.has].sort(), ['landscape', 'portrait']);
  assert.deepEqual([both.landscape, both.portrait], [[1024, 768], [768, 1024]]);
  const one = layoutOf('<gui><pages><page name="P"><portrait></portrait><landscape><img>a.png</img></landscape></page></pages></gui>');
  assert.deepEqual([...one.has], ['landscape']);
  // no page laid out either way (none yet): either way
  assert.deepEqual([...layoutOf('<gui />').has].sort(), ['landscape', 'portrait']);
});

test("in the app a zip never comes to the page: the app downloads and keeps it, says what's in it; its next version asked for by ETag, the same bytes not newer", async () => {
  const sized = (w: number, h: number) => `<gui><properties><project>${w}x${h}</project><size><portrait width="${h}" height="${w}" /><landscape width="${w}" height="${h}" /></size></properties></gui>`;
  const asked: string[] = [];
  let answer: Fetched = { status: 200, etag: '"v1"', archive: { savedAt: 100, bytes: 30_000_000 } };
  useArchives({
    async fetch(id, url, known) {
      asked.push(`fetch ${id} ${url} ${known?.etag ?? '-'}`);
      if (url.endsWith(':8019/')) return { status: 200, text: GUI, server: 'iva' };
      return known?.etag && known.etag === answer.etag ? { status: 304 } : answer;
    },
    kept: async () => null,
    async names(id, savedAt) {
      asked.push(`names ${id} ${savedAt}`);
      return ['app.gui', 'images/a.png', 'images/scripts/main.js', '1400w1400h/app.gui', '1400w1400h/images/a.png', 'iva-atlas/atlas.json'];
    },
    async text(_, savedAt, name) {
      asked.push(`text ${name} ${savedAt}`);
      return name.startsWith('1400w1400h/') ? sized(467, 467) : sized(1280, 800);
    },
  });
  // through the page: a script, and a zip only when the app couldn't unpack it
  const zip = writeZip([['app.gui', Buffer.from(GUI)], ['images/scripts/main.js', Buffer.from(MAIN)]]);
  const page: string[] = [];
  useFetch((async (url: string) => {
    page.push(url);
    const body = url.endsWith('.js') ? new TextEncoder().encode(MAIN) : new Uint8Array(zip);
    return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => body.buffer };
  }) as any);
  const g = globalThis as { screen?: { width: number; height: number } };
  g.screen = { width: 1920, height: 1080 };
  const url = 'http://10.0.0.2/app.gui.zip';
  try {
    const got = await fetchGui(url);
    assert.equal(got.bytes, undefined, 'no bytes in the page');
    const saved = await toSave(got);
    assert.deepEqual(saved, { url, etag: '"v1"', lastModified: undefined, savedAt: 100, appZip: true, bytes: 30_000_000 });
    // the plan from what the app reads of its copy: the names, the .gui of each size (the one shaped like the screen)
    const plan = await unpackPlan(await appArchive(url, 100), url);
    assert.equal(plan.size, '');
    assert.deepEqual([...plan.files].sort(), ['app.gui', 'images/a.png', 'images/scripts/main.js']);
    assert.ok(asked.includes('text 1400w1400h/app.gui 100') && asked.includes('text app.gui 100'), asked.join('\n'));
    await assert.rejects(savedManifest(saved), /the app's/);
    // its next version: asked with its ETag (304: none); the same bytes under another ETag: none either
    asked.length = 0;
    assert.equal(await newerVersion(saved), null);
    assert.deepEqual(asked, [`fetch ${url} ${url} "v1"`]);
    answer = { ...answer, etag: '"v2"', same: true };
    assert.equal(await newerVersion(saved), null);
    // ... unless the copy the app has isn't the one the page knew (a reload cut a check short): that one
    assert.equal((await newerVersion({ ...saved, savedAt: 99 }))?.savedAt, 100);
    // a new one: kept by the app, its version the app's
    answer = { status: 200, etag: '"v3"', archive: { savedAt: 200, bytes: 31_000_000 } };
    assert.deepEqual(await newerVersion(saved), { url, etag: '"v3"', lastModified: undefined, savedAt: 200, appZip: true, bytes: 31_000_000 });
    // a copy an older panel kept in the page (its zip there): the app's own from the server, once - no If-None-Match
    asked.length = 0;
    const older = await newerVersion({ url, zip: new Uint8Array(zip), etag: '"v3"', savedAt: 5, bytes: zip.length });
    assert.deepEqual(asked, [`fetch ${url} ${url} -`]);
    assert.equal(older?.appZip, true);
    assert.equal(older?.zip, undefined);
    // iva serve: its .gui comes as text, its whole build's archive is kept by the app as that GUI's copy
    asked.length = 0;
    const live = await fetchGui('http://10.0.0.2:8019/');
    const m = await manifestOf(live);
    assert.equal(m.scriptMap['scripts/main.js'], MAIN);
    const copy = await toSave(live, m);
    assert.deepEqual(asked, ['fetch http://10.0.0.2:8019/ http://10.0.0.2:8019/ -', 'fetch http://10.0.0.2:8019/ http://10.0.0.2:8019/__iva/gui.zip -']);
    assert.equal(copy.gui, GUI);
    assert.equal(copy.appZip, true);
    assert.equal(copy.savedAt, 200);
    assert.ok(!page.some((u) => u.endsWith('.zip')), `no zip through the page: ${page.join(', ')}`);
    // an archive the app couldn't unpack, read here after all: from its server again, through the page
    const here = await manifestOf(got);
    assert.equal(here.scriptMap['scripts/main.js'], MAIN);
    assert.deepEqual(page.filter((u) => u.endsWith('.zip')), [url]);
  } finally {
    useArchives(undefined);
    delete g.screen;
  }
});

test("a download that went on past the page that asked for it (iva serve's live reload mid-check): the app's copy, newer than the one noted, is the copy - by its version, not 'another now'", async () => {
  const url = 'http://10.0.0.2:8019/';
  // the app: the archive a check asked for came in after its page reloaded - kept.json says 200, the page noted 100
  let inApp: AppKept | null = { url: `${url}__iva/gui.zip`, etag: '"v2"', savedAt: 200, bytes: 31_000_000 };
  const asked: string[] = [];
  useArchives({
    async fetch(id, at) {
      asked.push(`fetch ${id} ${at}`);
      // the archive that comes with the server's .gui: the very bytes kept (its version stays the app's)
      return { status: 200, etag: '"v2"', server: 'iva', archive: { savedAt: inApp!.savedAt, bytes: inApp!.bytes }, same: true };
    },
    async kept(id) {
      asked.push(`kept ${id}`);
      return id === url ? inApp : null;
    },
    async names(id, savedAt) {
      asked.push(`names ${id} ${savedAt}`);
      // the copy kept is another now than any the page asks for but the app's
      if (savedAt !== inApp?.savedAt) throw new Error('the copy kept is another now');
      return ['app.gui', 'images/scripts/main.js'];
    },
    async text() {
      return GUI;
    },
  });
  const GUI2 = GUI.replace('<project>Kept</project>', '<project>Kept 2</project>');
  useFetch((async (at: string, init?: { headers?: Record<string, string> }) => {
    asked.push(`get ${at} ${init?.headers?.['If-None-Match'] ?? '-'}`);
    const body = new TextEncoder().encode(at.endsWith('.js') ? MAIN : GUI2);
    return { ok: true, status: 200, headers: { get: (h: string) => (h === 'server' ? 'iva' : h === 'etag' ? '"v2"' : null) }, arrayBuffer: async () => body.buffer };
  }) as any);
  try {
    // iva serve's copy, as the page noted it: its .gui, its ETag, the app's archive of then
    const noted = { url, gui: GUI, etag: '"v1"', appZip: true as const, savedAt: 100, bytes: 30_000_000 };
    // the page's note of it no use to the app (what v0.1.0 ran into: no GUI, the copy before that ran instead)
    await assert.rejects(appArchive(url, noted.savedAt), /another now/);
    const k = await newerInApp(url, noted.savedAt);
    assert.deepEqual(k, inApp);
    const now = asTheAppKeeps(noted, k!);
    // its .gui and its ETag the ones noted (the next check asks for the .gui); the archive the app's
    assert.deepEqual(now, { url, gui: GUI, etag: '"v1"', appZip: true, savedAt: 200, bytes: 31_000_000 });
    assert.deepEqual((await unpackPlan(await appArchive(url, now.savedAt), url)).files.sort(), ['app.gui', 'images/scripts/main.js']);
    // the app's copy the one noted, an older one, none, an app that can't say: nothing newer
    assert.equal(await newerInApp(url, 200), undefined);
    assert.equal(await newerInApp(url, 300), undefined, 'a copy of files noted after the archive the app kept last');
    assert.equal(await newerInApp('http://10.0.0.3/', 0), undefined);
    inApp = null;
    assert.equal(await newerInApp(url, 0), undefined);
    useArchives({ fetch: async () => ({ status: 304 }), kept: async () => Promise.reject(new Error('no such command')), names: async () => [], text: async () => '' });
    assert.equal(await newerInApp(url, 0), undefined);
    inApp = { url, etag: '"v2"', lastModified: 'Sun, 25 Oct 2026 10:00:00 GMT', savedAt: 200, bytes: 31_000_000 };
    // a zipped GUI's copy: its ETag and Last-Modified the app's archive's too (no 200 for the bytes kept, next check)
    assert.deepEqual(asTheAppKeeps({ url, etag: '"v1"', appZip: true, savedAt: 100, bytes: 1 }, inApp), { url, etag: '"v2"', lastModified: 'Sun, 25 Oct 2026 10:00:00 GMT', appZip: true, savedAt: 200, bytes: 31_000_000 });
    // a copy an older panel kept in the page (its zip there), or the files of a load whose archive came short: the app's archive now
    const older = asTheAppKeeps({ url, gui: GUI, zip: new Uint8Array(4), files: { 'app.gui': new Uint8Array(2) }, savedAt: 100, bytes: 6 }, inApp);
    assert.deepEqual([older.zip, older.files, older.appZip, older.savedAt], [undefined, undefined, true, 200]);
    assert.ok(!('zip' in older) && !('files' in older), 'not kept as nothing');
    // the next check of the copy picked up: the server's .gui by the ETag noted, then the archive with it - the
    // app's, the very one running (its version: 200), so the copy is noted anew and nothing reloads (main.ts checkServer)
    asked.length = 0;
    useArchives({
      fetch: async (id, at) => (asked.push(`fetch ${id} ${at}`), { status: 200, etag: '"v2"', server: 'iva', archive: { savedAt: 200, bytes: 31_000_000 }, same: true }),
      kept: async () => inApp,
      names: async () => [],
      text: async () => '',
    });
    const newer = await newerVersion(now);
    assert.deepEqual(asked.filter((a) => !a.endsWith('.js -')), [`get ${url} "v1"`, `fetch ${url} ${url}__iva/gui.zip`]);
    assert.deepEqual(newer, { url, gui: GUI2, etag: '"v2"', lastModified: undefined, appZip: true, savedAt: 200, bytes: 31_000_000 });
  } finally {
    useArchives(undefined);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip } from '../src/server/zip.ts';
import { savedManifest, unzip } from '../panel/loader.ts';

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

test('a GUI runs from its copy on the device: an archive, or a .gui and the files beside it', async () => {
  const zip = writeZip([['app.gui', Buffer.from(GUI)], ['images/scripts/main.js', Buffer.from(MAIN)], ['images/icons/a.png', Buffer.from('png')]]);
  const fromZip = await savedManifest({ url: 'http://10.0.0.2:8019', zip: new Uint8Array(zip), savedAt: 0, bytes: zip.length });
  const enc = (s: string) => new TextEncoder().encode(s) as Uint8Array<ArrayBuffer>;
  const fromFiles = await savedManifest({
    url: 'http://10.0.0.2/gui/app.gui',
    files: { 'app.gui': enc(GUI), 'images/scripts/main.js': enc(MAIN), 'images/icons/a.png': enc('png') },
    gui: GUI,
    savedAt: 0,
    bytes: 0,
  });
  for (const m of [fromZip, fromFiles]) {
    assert.equal(m.title, 'Kept');
    assert.equal(m.scriptMap['scripts/main.js'], MAIN);
    assert.deepEqual(m.missingScripts, []);
    // its images by their path in the image folder, and by name
    assert.match(m.imageMap['icons/a.png'], /^blob:/);
    assert.equal(m.imageMap['a.png'], m.imageMap['icons/a.png']);
    assert.match(m.fileUrl('icons/a.png') ?? '', /^blob:/);
  }
});

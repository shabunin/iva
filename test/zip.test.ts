import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readZip, writeZip, zipHasGui } from '../src/server/zip.ts';
import { resolveGuiLink, zipManifest } from '../src/server/project.ts';

const gui = (body: string, folder = '') => Buffer.from(`﻿<gui><properties><project>Zipped</project><imagefolder>${folder}</imagefolder></properties>
<scripts><script name="scripts/main.js" /><script name="lib.js" /><script name="gone.js" /></scripts>${body}</gui>`);

test('zip: what iva writes reads back (deflated, stored, folders, UTF-8 names); a GUI is an archive with a .gui', () => {
  const files: [string, Buffer][] = [
    ['clock.gui', gui('<page name="P" />')],
    ['images/backgrounds/bg.png', Buffer.alloc(4000, 7)],
    ['scripts/main.js', Buffer.from('CF.log("héllo");')],
    ['ß/tiny.txt', Buffer.from('x')],
  ];
  const zip = writeZip(files);
  assert.deepEqual([...readZip(zip)].map(([n, d]) => [n, d.toString('hex')]), files.map(([n, d]) => [n, d.toString('hex')]));
  assert.ok(zip.length < 3000, 'deflated');
  assert.equal(zipHasGui(zip), true);
  assert.equal(zipHasGui(writeZip([['data.json', Buffer.from('{}')]])), false);
  assert.throws(() => readZip(Buffer.from('not a zip at all, really, not at all')), /not a zip archive/);
});

test('a zipped GUI: its .gui (named after the archive, else the shallowest), images by path in the image folder and by name, scripts', () => {
  const files = readZip(writeZip([
    ['extra/other.gui', gui('')],
    ['app/clock.gui', gui('<page name="P"><portrait><img>icons/sub.png</img></portrait></page>', 'images')],
    ['app/images/icons/sub.png', Buffer.from('png')],
    ['app/images/flat.png', Buffer.from('png')],
    ['app/scripts/main.js', Buffer.from('CF.log(1);')],
    ['app/lib.js', Buffer.from('var lib;')],
  ]));
  const m = zipManifest(files, 'Clock/clock.gui.zip', (p) => `/z/${p}`);
  assert.equal(m.title, 'Zipped');
  assert.match(m.guiXml, /icons\/sub\.png/);
  assert.equal(m.imageMap['icons/sub.png'], '/z/app/images/icons/sub.png');
  assert.equal(m.imageMap['sub.png'], '/z/app/images/icons/sub.png');
  assert.equal(m.imageMap['flat.png'], '/z/app/images/flat.png');
  assert.deepEqual([m.scriptMap['scripts/main.js'], m.scriptMap['lib.js'], m.missingScripts], ['CF.log(1);', 'var lib;', ['gone.js']]);
  assert.equal(m.fileBase, '/z/app/');
  // no .gui named after it: the shallowest
  const plain = readZip(writeZip([['deep/one.gui', gui('<page name="One" />')], ['two.gui', gui('<page name="Two" />')]]));
  assert.match(zipManifest(plain, 'http://host/bundle.zip', (p) => `/z/${p}`).guiXml, /name="Two"/);
  assert.throws(() => zipManifest(readZip(writeZip([['a.txt', Buffer.from('a')]])), 'x.zip', (p) => p), /no \.gui in the archive/);
});

test('a link to a zipped GUI: the project\'s own by name, else the URL', () => {
  const guis = [{ rel: 'Clock/clock.gui.zip', name: 'Clock/clock.gui.zip' }, { rel: 'Clock/clock.gui', name: 'Clock/clock.gui' }];
  assert.deepEqual(resolveGuiLink(guis, 'Clock/clock.gui', 'cf://192.168.0.10:8019/clock.gui.zip').gui, 'Clock/clock.gui.zip');
  assert.deepEqual(resolveGuiLink(guis, 'Clock/clock.gui', 'http://host/far.gui.zip'), { gui: 'http://host/far.gui.zip' });
});

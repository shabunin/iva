// The panel's built-in demo: the iva/ui gallery as a zipped GUI (every size in it) in public/demo/ -
// among the app's own files, so it runs with no server (the settings' Demo button).
//   node panel/scripts/demo.mjs   (panel:build and panel:dev run it)
// The build's archive for the iva panel (iva-ui-gallery.iva.zip: its images in sheets), kept under the name
// the app has always loaded it by (demo/iva-ui-gallery.gui.zip): a phone remembers the demo's URL.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'examples/gallery/dist');
const r = spawnSync(process.execPath, [path.join(root, 'bin/iva.mjs'), 'build', path.join(root, 'examples/gallery/app.jsx'), '--zip', '-o', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
const demo = path.join(root, 'panel/public/demo');
fs.mkdirSync(demo, { recursive: true });
fs.copyFileSync(path.join(out, 'iva-ui-gallery.iva.zip'), path.join(demo, 'iva-ui-gallery.gui.zip'));
console.log('demo: panel/public/demo/iva-ui-gallery.gui.zip (the iva panel\'s archive)');

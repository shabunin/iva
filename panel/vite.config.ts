// The panel's page: iva's runtime (../src/runtime) with the real Tauri in place
// of the stand-ins its host classes import (the preview's link to iva dev).
//   npm run panel:build    -> panel/dist (what the app ships)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = path.resolve(here, '../src/runtime/host/bridge');
// the built-in demo's version (scripts/demo.mjs made it just before): what the app unpacked it as tells it from the next
const demo = path.resolve(here, 'public/demo/iva-ui-gallery.gui.zip');
const demoVersion = fs.existsSync(demo) ? createHash('sha1').update(fs.readFileSync(demo)).digest('hex').slice(0, 16) : '';
const real: Record<string, string> = {
  'tauri-core': '@tauri-apps/api/core',
  'tauri-event': '@tauri-apps/api/event',
  'tauri-plugin-http': '@tauri-apps/plugin-http',
  'tauri-plugin-websocket': '@tauri-apps/plugin-websocket',
};

export default defineConfig({
  root: here,
  base: './',
  clearScreen: false,
  define: { __IVA_DEMO__: JSON.stringify(demoVersion) },
  server: { port: 5190, strictPort: true, host: process.env.TAURI_DEV_HOST || false },
  build: { outDir: path.resolve(here, 'dist'), emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 4000 },
  plugins: [{
    name: 'iva-panel-tauri',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const stand = path.relative(bridge, path.resolve(path.dirname(importer), source)).replace(/\.ts$/, '');
      return real[stand] ? this.resolve(real[stand], importer, { skipSelf: true }) : null;
    },
  }],
});

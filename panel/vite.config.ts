// The panel's page: iva's runtime (../src/runtime) with the real Tauri in place
// of the stand-ins its host classes import (the preview's link to iva dev).
//   npm run panel:build    -> panel/dist (what the app ships)
import path from 'node:path';
import { defineConfig } from 'vite';

const here = path.dirname(new URL(import.meta.url).pathname);
const bridge = path.resolve(here, '../src/runtime/host/bridge');
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

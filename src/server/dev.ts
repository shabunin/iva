/**
 * `iva dev`: one Node process serving
 *   - the preview page (Vite, middleware mode) running agapi's cf-runtime,
 *   - the backend the runtime talks to (/__iva/host WebSocket: real TCP / UDP /
 *     TLS / DNS / HTTP from this machine),
 *   - the project's files (/__iva/guis, /__iva/manifest, /__iva/files/...),
 * and reloading the page whenever a project file changes.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createVite, type Alias } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { HostSession } from './host/session.js';
import { findGuis, loadManifest, rootDir, safeJoin } from './project.js';

const IVA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_DIR = path.join(IVA_ROOT, 'src', 'preview');
const BRIDGE_DIR = path.join(PREVIEW_DIR, 'bridge');

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export interface DevOptions {
  /** A .gui file, or a folder searched for .gui files. */
  target: string;
  port: number;
  host: string;
  /** agapi checkout (its packages/ are used from source). */
  agapi: string;
  verbose?: boolean;
}

/** Locate the agapi checkout: --agapi, $IVA_AGAPI, or ../agapi next to iva. */
export function resolveAgapi(explicit?: string): string {
  const candidates = [explicit, process.env.IVA_AGAPI, path.resolve(IVA_ROOT, '..', 'agapi')].filter(Boolean) as string[];
  for (const c of candidates) {
    const dir = path.resolve(c);
    if (fs.existsSync(path.join(dir, 'packages', 'cf-runtime', 'package.json'))) return dir;
  }
  throw new Error(
    `agapi not found (looked in: ${candidates.join(', ')}). ` +
      'Clone it next to iva, or pass --agapi <dir> / set IVA_AGAPI.',
  );
}

/** `@agapi/<pkg>[/sub]` -> agapi source, from each package's own exports map. */
function agapiAliases(agapi: string): Alias[] {
  const aliases: Alias[] = [];
  for (const pkg of ['cf-runtime', 'stdlib', 'host-protocol']) {
    const dir = path.join(agapi, 'packages', pkg);
    const { name, exports } = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const map: Record<string, string> = typeof exports === 'string' ? { '.': exports } : exports;
    for (const [sub, file] of Object.entries(map)) {
      const spec = sub === '.' ? name : `${name}/${sub.slice(2)}`;
      aliases.push({ find: new RegExp(`^${spec.replace(/[/.@-]/g, '\\$&')}$`), replacement: path.join(dir, file) });
    }
  }
  // agapi files by path (iva's preview reuses host-tauri's socket classes)
  aliases.push({ find: /^@agapi-src\/(.*)$/, replacement: path.join(agapi, 'packages') + '/$1' });
  // no Tauri: its IPC goes to the iva backend instead
  aliases.push(
    { find: /^@tauri-apps\/api\/core$/, replacement: path.join(BRIDGE_DIR, 'tauri-core.ts') },
    { find: /^@tauri-apps\/api\/event$/, replacement: path.join(BRIDGE_DIR, 'tauri-event.ts') },
    { find: /^@tauri-apps\/plugin-http$/, replacement: path.join(BRIDGE_DIR, 'tauri-plugin-http.ts') },
    { find: /^@tauri-apps\/plugin-websocket$/, replacement: path.join(BRIDGE_DIR, 'tauri-plugin-websocket.ts') },
  );
  return aliases;
}

const encodePath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');

function send(res: http.ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

export async function startDev(opts: DevOptions) {
  const target = path.resolve(opts.target);
  if (!fs.existsSync(target)) throw new Error(`not found: ${opts.target}`);
  const base = rootDir(target);
  const log = (msg: string) => console.log(`[iva] ${msg}`);
  const debug = opts.verbose ? log : () => {};

  const httpServer = http.createServer();
  const vite = await createVite({
    configFile: false,
    root: PREVIEW_DIR,
    logLevel: opts.verbose ? 'info' : 'warn',
    clearScreen: false,
    appType: 'spa',
    resolve: {
      alias: agapiAliases(opts.agapi),
      // agapi sources live outside this package: take its libraries from iva's node_modules
      dedupe: ['pixi.js', '@pixi/ui', 'motion'],
    },
    optimizeDeps: { include: ['pixi.js', '@pixi/ui', 'motion'] },
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
      fs: { allow: [IVA_ROOT, opts.agapi] },
    },
  });

  httpServer.on('request', (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      if (url.pathname === '/__iva/guis') {
        return send(res, 200, JSON.stringify(findGuis(target)), 'application/json');
      }
      if (url.pathname === '/__iva/manifest') {
        const gui = url.searchParams.get('gui') ?? '';
        const manifest = loadManifest(base, gui, (rel) => `/__iva/files/${encodePath(rel)}`);
        if (manifest.missingScripts.length) log(`${gui}: missing scripts ${manifest.missingScripts.join(', ')}`);
        return send(res, 200, JSON.stringify(manifest), 'application/json');
      }
      if (url.pathname.startsWith('/__iva/files/')) {
        const rel = decodeURIComponent(url.pathname.slice('/__iva/files/'.length));
        const file = safeJoin(base, rel);
        if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found');
        return send(res, 200, fs.readFileSync(file), MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
      }
    } catch (e: any) {
      return send(res, 500, String(e?.message ?? e));
    }
    vite.middlewares(req, res);
  });

  // ── the backend: one HostSession per preview page ──
  const pages = new Set<WebSocket>();
  const wss = new WebSocketServer({ noServer: true });
  httpServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/__iva/host') return; // Vite's HMR socket
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });
  wss.on('connection', (ws) => {
    pages.add(ws);
    const session = new HostSession((name, payload) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: 'event', name, payload }));
    }, debug);
    ws.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t !== 'invoke') return;
      try {
        const value = await session.invoke(msg.cmd, msg.args ?? {});
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: true, value: value ?? null }));
      } catch (e: any) {
        debug(`${msg.cmd} failed: ${e?.message ?? e}`);
        ws.send(JSON.stringify({ t: 'result', id: msg.id, ok: false, error: String(e?.message ?? e) }));
      }
    });
    ws.on('close', () => {
      pages.delete(ws);
      session.dispose();
    });
  });

  // ── reload on change ──
  let timer: NodeJS.Timeout | undefined;
  const watcher = fs.watch(base, { recursive: true }, (_ev, file) => {
    if (!file || /(^|[\\/])(\.|node_modules)/.test(String(file))) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      log(`changed: ${file} - reloading`);
      for (const ws of pages) ws.send(JSON.stringify({ t: 'reload' }));
    }, 150);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, opts.host, resolve);
  });
  const shown = opts.host === '0.0.0.0' || opts.host === '::' ? 'localhost' : opts.host;
  const guis = findGuis(target);
  log(`agapi:   ${opts.agapi}`);
  log(`project: ${target} (${guis.length} .gui)`);
  log(`preview: http://${shown}:${opts.port}/`);

  return {
    url: `http://${shown}:${opts.port}/`,
    async close() {
      watcher.close();
      for (const ws of pages) ws.terminate();
      wss.close();
      await vite.close();
      await new Promise((r) => httpServer.close(r));
    },
  };
}

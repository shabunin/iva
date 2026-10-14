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
import { watchTree } from './watch.js';
import { findGuis, loadManifest, rootDir, safeJoin, type GuiEntry, type ProjectManifest } from './project.js';
import { compile, IvaError, slug, type CompileResult } from '../compiler/index.js';

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
  /** A .gui file, a folder searched for .gui files, or a JSX entry (app.jsx). */
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

export const isEntry = (file: string) => /\.(jsx|tsx|js|ts|mjs)$/i.test(file);

/** What the preview shows: .gui files on disk, or a JSX project compiled in memory. */
interface ProjectSource {
  /** the folder to watch */
  dir: string;
  guis(): GuiEntry[];
  manifest(gui: string): ProjectManifest;
  /** a file the manifest points at: its path, or its content (images iva drew) */
  file(rel: string): string | Buffer | null;
  /** after a change; resolves to an error message, or null when it's fine to reload */
  refresh(): Promise<string | null>;
}

function guiSource(target: string): ProjectSource {
  const base = rootDir(target);
  return {
    dir: base,
    guis: () => findGuis(target),
    manifest: (gui) => loadManifest(base, gui, (rel) => `/__iva/files/${encodePath(rel)}`),
    file: (rel) => safeJoin(base, rel),
    refresh: async () => null,
  };
}

async function jsxSource(entry: string, log: (m: string) => void): Promise<ProjectSource> {
  let result: CompileResult | null = null;
  let error: IvaError | null = null;
  const build = async () => {
    const t0 = Date.now();
    try {
      result = await compile(entry);
      error = null;
      for (const w of result.warnings) log(`warning: ${w}`);
      log(`built ${path.basename(entry)} in ${Date.now() - t0} ms`);
      return null;
    } catch (e: any) {
      error = e instanceof IvaError ? e : new IvaError(String(e?.stack ?? e));
      const text = error.format(path.dirname(entry));
      log(`build failed:\n${text}`);
      return text;
    }
  };
  await build();
  return {
    dir: path.dirname(entry),
    guis: () => [{ rel: `${slug(result?.name ?? path.basename(entry))}.gui`, name: path.basename(entry) }],
    manifest: () => {
      if (error || !result) throw Object.assign(new Error(error?.format(path.dirname(entry)) ?? 'not built'), { status: 422 });
      const r: CompileResult = result;
      const imageMap: Record<string, string> = {};
      for (const a of r.assets) if (IMAGE_RE.test(a.name)) imageMap[a.name] = `/__iva/files/${encodeURIComponent(a.name)}`;
      const scriptMap: Record<string, string> = {};
      for (const sc of r.scripts) scriptMap[sc.name] = sc.code ?? fs.readFileSync(sc.file!, 'utf8');
      return { gui: `${slug(r.name)}.gui`, title: r.name, guiXml: r.xml, imageMap, scriptMap, missingScripts: [], fileBase: '/__iva/files/' };
    },
    file: (rel) => {
      const a = (result as CompileResult | null)?.assets.find((x) => x.name === rel);
      return a ? (a.data ?? a.file ?? null) : null;
    },
    refresh: build,
  };
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

export async function startDev(opts: DevOptions) {
  const target = path.resolve(opts.target);
  if (!fs.existsSync(target)) throw new Error(`not found: ${opts.target}`);
  const log = (msg: string) => console.log(`[iva] ${msg}`);
  const debug = opts.verbose ? log : () => {};
  const source = isEntry(target) ? await jsxSource(target, log) : guiSource(target);

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
        return send(res, 200, JSON.stringify(source.guis()), 'application/json');
      }
      if (url.pathname === '/__iva/manifest') {
        const gui = url.searchParams.get('gui') ?? '';
        const manifest = source.manifest(gui);
        if (manifest.missingScripts.length) log(`${gui}: missing scripts ${manifest.missingScripts.join(', ')}`);
        return send(res, 200, JSON.stringify(manifest), 'application/json');
      }
      if (url.pathname.startsWith('/__iva/files/')) {
        const rel = decodeURIComponent(url.pathname.slice('/__iva/files/'.length));
        const file = source.file(rel);
        const type = MIME[path.extname(rel).toLowerCase()] ?? 'application/octet-stream';
        if (Buffer.isBuffer(file)) return send(res, 200, file, type);
        if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found');
        return send(res, 200, fs.readFileSync(file), type);
      }
    } catch (e: any) {
      return send(res, e?.status ?? 500, String(e?.message ?? e));
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
  const watcher = watchTree(source.dir, true, async (file) => {
    log(`changed: ${file}`);
    const error = await source.refresh();
    const msg = error ? { t: 'error', text: error } : { t: 'reload' };
    for (const ws of pages) ws.send(JSON.stringify(msg));
  }, log);

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, opts.host, resolve);
  });
  const shown = opts.host === '0.0.0.0' || opts.host === '::' ? 'localhost' : opts.host;
  log(`agapi:   ${opts.agapi}`);
  log(`project: ${target}${isEntry(target) ? '' : ` (${source.guis().length} .gui)`}`);
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

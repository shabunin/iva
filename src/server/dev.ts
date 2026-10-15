/**
 * `iva dev`: one Node process serving
 *   - the preview page (Vite, middleware mode) running iva's CF runtime (src/runtime),
 *   - the backend the runtime talks to (/__iva/host WebSocket: real TCP / UDP /
 *     TLS / DNS / HTTP from this machine),
 *   - the project's files (/__iva/guis, /__iva/manifest, /__iva/files/...),
 * and reloading the page whenever a project file changes.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createVite } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import { HostSession } from './host/session.js';
import { watchInputs, watchTree } from './watch.js';
import { findGuis, guiUrl, isUrl, isZip, loadManifest, loadRemoteManifest, resolveGuiLink, rootDir, safeJoin, zipManifest, type GuiEntry, type ProjectManifest } from './project.js';
import { readZip } from './zip.js';
import { compile, IvaError, slug, type CompileResult } from '../compiler/index.js';

const IVA_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREVIEW_DIR = path.join(IVA_ROOT, 'src', 'preview');

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.html': 'text/html',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

export interface DevOptions {
  /** A .gui file, a folder searched for .gui files, a JSX entry (app.jsx), or a .gui's URL (http://, cf://). */
  target: string;
  port: number;
  host: string;
  verbose?: boolean;
}

const encodePath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');

function send(res: http.ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

export const isEntry = (file: string) => /\.(jsx|tsx|js|ts|mjs)$/i.test(file);

/** What the preview shows: .gui files on disk, a JSX project compiled in memory, or a .gui on a web server. */
interface ProjectSource {
  /** the folder to watch (none: a .gui on a web server) */
  dir: string | null;
  guis(): GuiEntry[];
  manifest(gui: string): ProjectManifest;
  /** a file the manifest points at: its path, or its content (images iva drew) */
  file(rel: string): string | Buffer | null;
  /** after a change; resolves to an error message, or null when it's fine to reload */
  refresh(): Promise<string | null>;
  /** the files the last good build read (watched instead of the whole folder), if there was one */
  inputs?(): { files: string[]; dirs: string[] } | null;
}

/** Zipped GUIs' files, by an id (a project path, a URL), read once: served at /__iva/zip/<id>/<path in the archive>. */
class ZipStore {
  private zips = new Map<string, { files: Map<string, Buffer>; stamp: string }>();

  /** the archive's files, read again when `stamp` changes (a file's mtime) */
  files(id: string, stamp: string, read: () => Buffer): Map<string, Buffer> {
    const had = this.zips.get(id);
    if (had && had.stamp === stamp) return had.files;
    const files = readZip(read());
    this.zips.set(id, { files, stamp });
    return files;
  }

  url(id: string): (inZip: string) => string {
    return (inZip) => `/__iva/zip/${Buffer.from(id).toString('base64url')}/${encodePath(inZip)}`;
  }

  /** a request for /__iva/zip/<id>/<path> */
  file(pathname: string): Buffer | null {
    const m = /^\/__iva\/zip\/([\w-]+)\/(.*)$/.exec(pathname);
    if (!m) return null;
    const files = this.zips.get(Buffer.from(m[1], 'base64url').toString())?.files;
    return files?.get(decodeURIComponent(m[2])) ?? null;
  }
}

function guiSource(target: string, zips: ZipStore): ProjectSource {
  const base = rootDir(target);
  return {
    dir: base,
    guis: () => findGuis(target),
    manifest: (gui) => {
      if (!isZip(gui)) return loadManifest(base, gui, (rel) => `/__iva/files/${encodePath(rel)}`);
      // a zipped GUI: its files from the archive, as iViewer loads one
      const file = safeJoin(base, gui);
      if (!file || !fs.existsSync(file)) throw Object.assign(new Error(`no such .zip: ${gui}`), { status: 404 });
      const files = zips.files(gui, String(fs.statSync(file).mtimeMs), () => fs.readFileSync(file));
      return zipManifest(files, gui, zips.url(gui));
    },
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
      const r = result as CompileResult | null;
      // a web view's page of the project: images/page.html, as the .gui names it
      const name = r?.layout.images && rel.startsWith(`${r.layout.images}/`) ? rel.slice(r.layout.images.length + 1) : rel;
      const a = r?.assets.find((x) => x.name === name || x.name === rel);
      return a ? (a.data ?? a.file ?? null) : null;
    },
    refresh: build,
    inputs: () => (result as CompileResult | null)?.inputs ?? null,
  };
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

/** A .gui on a web server (iva dev http://host/x.gui): loaded as iViewer would, nothing to watch. */
function urlSource(url: string): ProjectSource {
  return {
    dir: null,
    guis: () => [{ rel: url, name: url }],
    manifest: () => {
      throw new Error('remote');
    },
    file: () => null,
    refresh: async () => null,
  };
}

export async function startDev(opts: DevOptions) {
  const remoteTarget = isUrl(opts.target);
  const target = remoteTarget ? opts.target : path.resolve(opts.target);
  if (!remoteTarget && !fs.existsSync(target)) throw new Error(`not found: ${opts.target}`);
  const log = (msg: string) => console.log(`[iva] ${msg}`);
  const debug = opts.verbose ? log : () => {};
  const zips = new ZipStore();
  const source = remoteTarget ? urlSource(target) : isEntry(target) ? await jsxSource(target, log) : guiSource(target, zips);

  // ── GUIs on web servers (CF.loadGUI, cf:// links, iva dev <url>) ──
  /** the folders of the remote GUIs loaded: their files go through /__iva/remote/ */
  const remoteBases = new Set<string>();
  const remotePath = (abs: string) => {
    const u = new URL(abs);
    return `/__iva/remote/${u.protocol.replace(':', '')}/${u.host}${u.pathname}${u.search}`;
  };
  const remoteManifest = async (gui: string): Promise<ProjectManifest> => {
    // a zipped GUI on a server: the archive, then everything from it
    if (isZip(new URL(guiUrl(gui)).pathname)) {
      const res = await fetch(guiUrl(gui), { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`${gui}: HTTP ${res.status}`);
      const data = Buffer.from(await res.arrayBuffer());
      return zipManifest(zips.files(gui, String(Date.now()), () => data), gui, zips.url(gui));
    }
    const m = await loadRemoteManifest(gui, (abs) => {
      if (abs.endsWith('/')) remoteBases.add(abs);
      return remotePath(abs);
    });
    remoteBases.add(new URL('.', guiUrl(gui)).href);
    return m;
  };
  /** A file of a remote GUI (an image, a page): fetched here (the browser can't from another site). */
  async function remote(res: http.ServerResponse, url: URL) {
    const m = /^\/__iva\/remote\/(https?)\/([^/]+)(\/.*)?$/.exec(url.pathname);
    const abs = m ? `${m[1]}://${m[2]}${m[3] ?? '/'}${url.search}` : '';
    if (!m || ![...remoteBases].some((b) => abs.startsWith(b))) return send(res, 403, 'not a file of a GUI the preview loaded');
    try {
      const r = await fetch(abs, { signal: AbortSignal.timeout(15000) });
      const type = r.headers.get('content-type') ?? MIME[path.extname(new URL(abs).pathname).toLowerCase()] ?? 'application/octet-stream';
      send(res, r.status, Buffer.from(await r.arrayBuffer()), type);
    } catch (e: any) {
      send(res, 502, `${abs}: ${e?.message ?? e}`);
    }
  }
  const httpServer = http.createServer();
  const vite = await createVite({
    configFile: false,
    root: PREVIEW_DIR,
    logLevel: opts.verbose ? 'info' : 'warn',
    clearScreen: false,
    appType: 'spa',
    optimizeDeps: { include: ['pixi.js', '@pixi/ui', 'motion'] },
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
      fs: { allow: [IVA_ROOT] },
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
        const done = (manifest: ProjectManifest) => {
          if (manifest.missingScripts.length) log(`${gui}: missing scripts ${manifest.missingScripts.join(', ')}`);
          send(res, 200, JSON.stringify(manifest), 'application/json');
        };
        if (isUrl(gui)) {
          remoteManifest(gui).then(done, (e) => send(res, 502, `can't load ${gui}: ${e?.cause?.message ?? e?.message ?? e}`));
          return;
        }
        return done(source.manifest(gui));
      }
      if (url.pathname === '/__iva/resolve') {
        const link = resolveGuiLink(source.guis(), url.searchParams.get('from') ?? '', url.searchParams.get('url') ?? '');
        return send(res, 200, JSON.stringify(link), 'application/json');
      }
      if (url.pathname.startsWith('/__iva/remote/')) {
        remote(res, url);
        return;
      }
      if (url.pathname.startsWith('/__iva/zip/')) {
        const data = zips.file(url.pathname);
        return data ? send(res, 200, data, MIME[path.extname(url.pathname).toLowerCase()] ?? 'application/octet-stream') : send(res, 404, 'not found');
      }
      if (url.pathname.startsWith('/__iva/loop/')) return loop(req, res, url);
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

  /**
   * A web view's http://127.0.0.1:<port>/ is the panel itself (a server the
   * GUI runs): the preview loads it through here, from wherever it's opened.
   * Only ports a preview page listens on.
   */
  function loop(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    const m = /^\/__iva\/loop\/(\d+)(\/.*)?$/.exec(url.pathname);
    const port = Number(m?.[1]);
    if (!m || ![...sessions].some((s) => s.listening(port))) return send(res, 404, `no server of the panel's on port ${m?.[1] ?? '?'}`);
    let answer: http.IncomingMessage | null = null;
    const upstream = http.request({
      host: '127.0.0.1', port, method: req.method, path: (m[2] ?? '/') + url.search, agent: false,
      headers: { ...req.headers, host: `127.0.0.1:${port}`, connection: 'close' },
    }, (a) => {
      answer = a;
      res.writeHead(a.statusCode ?? 502, a.headers);
      a.pipe(res);
    });
    upstream.on('error', (e) => {
      // bytes after a whole answer: another client's (iViewer sends a server's answers to every client) - a browser ignores them
      if (answer?.complete) return;
      if (res.headersSent) res.destroy();
      else send(res, 502, e.message);
    });
    // the page gave up (an aborted request): so does the panel's client
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  }

  // ── the backend: one HostSession per preview page ──
  const pages = new Set<WebSocket>();
  const sessions = new Set<HostSession>();
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
    sessions.add(session);
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
      sessions.delete(session);
      session.dispose();
    });
  });

  // ── reload on change: a JSX project's own inputs (wherever they are); a .gui's folder ──
  const changed = async (file: string) => {
    log(`changed: ${file}`);
    const error = await source.refresh();
    follow();
    const msg = error ? { t: 'error', text: error } : { t: 'reload' };
    for (const ws of pages) ws.send(JSON.stringify(msg));
  };
  const inputs = source.inputs ? watchInputs(changed, log) : null;
  let folder: { close(): void } | null = null;
  const follow = () => {
    const now = source.inputs?.();
    if (inputs && now) {
      inputs.set(now);
      folder?.close();
      folder = null;
    } else if (!folder && source.dir) {
      // nothing built yet (or a .gui): the whole folder
      folder = watchTree(source.dir, true, changed, log);
    }
  };
  follow();
  const watcher = { close: () => { inputs?.close(); folder?.close(); } };

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(opts.port, opts.host, resolve);
  });
  const shown = opts.host === '0.0.0.0' || opts.host === '::' ? 'localhost' : opts.host;
  log(`project: ${target}${remoteTarget || isEntry(target) ? '' : ` (${source.guis().length} .gui)`}`);
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

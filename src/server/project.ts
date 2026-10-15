/**
 * A CommandFusion project on disk: a folder holding a `.gui` plus its images
 * and scripts (the layout GUI Designer saves). Builds what
 * cf-runtime's loadProject() needs - the XML, image name -> URL, and the
 * scripts the .gui lists.
 */

import fs from 'node:fs';
import path from 'node:path';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

export interface GuiEntry {
  /** Path relative to the dev root, with forward slashes. */
  rel: string;
  name: string;
}

export interface ProjectManifest {
  gui: string;
  title: string;
  guiXml: string;
  /** image file name (leaf, as the .gui refers to it) -> URL the browser loads */
  imageMap: Record<string, string>;
  /** script name as listed in <scripts> -> source */
  scriptMap: Record<string, string>;
  missingScripts: string[];
  /** URL of the project's folder: other files (a web view's `page.html`) by their path in it */
  fileBase: string;
}

const toPosix = (p: string) => p.split(path.sep).join('/');

function walk(dir: string, visit: (file: string) => void, depth = 0) {
  if (depth > 8) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(full, visit, depth + 1);
    } else if (e.isFile()) {
      visit(full);
    }
  }
}

/** Every .gui under the root (or the root itself, if it is a .gui file). */
export function findGuis(root: string): GuiEntry[] {
  const st = fs.statSync(root);
  if (st.isFile()) return [{ rel: path.basename(root), name: path.basename(root) }];
  const out: GuiEntry[] = [];
  walk(root, (f) => {
    if (f.toLowerCase().endsWith('.gui')) {
      const rel = toPosix(path.relative(root, f));
      out.push({ rel, name: rel });
    }
  });
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

/** The directory that files are served from: the root, or a .gui file's folder. */
export function rootDir(root: string): string {
  return fs.statSync(root).isFile() ? path.dirname(root) : root;
}

/** Resolve a request-relative path inside the root; null if it escapes it. */
export function safeJoin(base: string, rel: string): string | null {
  const full = path.resolve(base, rel);
  return full === base || full.startsWith(base + path.sep) ? full : null;
}

function scriptNames(xml: string): string[] {
  const block = xml.match(/<scripts\b[^>]*>([\s\S]*?)<\/scripts>/i);
  if (!block) return [];
  return [...block[1].matchAll(/<script\b[^>]*\bname\s*=\s*"([^"]*)"/gi)].map((m) => m[1].trim()).filter(Boolean);
}

function decodeXml(buf: Buffer): string {
  // GUI Designer writes UTF-8 with a BOM; tolerate UTF-16 too
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  const s = buf.toString('utf8');
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/**
 * The manifest for one .gui. Images and scripts are looked up in the .gui's
 * own folder (and below), by file name - the way iViewer resolves them.
 */
export function loadManifest(base: string, guiRel: string, assetUrl: (rel: string) => string): ProjectManifest {
  const guiPath = safeJoin(base, guiRel);
  if (!guiPath || !fs.existsSync(guiPath)) throw new Error(`no such .gui: ${guiRel}`);
  const guiXml = decodeXml(fs.readFileSync(guiPath));
  const projectDir = path.dirname(guiPath);

  const imageMap: Record<string, string> = {};
  const files: string[] = [];
  walk(projectDir, (f) => {
    files.push(f);
    const leaf = path.basename(f);
    // the shallowest file wins when two folders hold the same name
    if (IMAGE_RE.test(leaf) && !imageMap[leaf]) imageMap[leaf] = assetUrl(toPosix(path.relative(base, f)));
  });

  const scriptMap: Record<string, string> = {};
  const missingScripts: string[] = [];
  for (const name of scriptNames(guiXml)) {
    const want = toPosix(name.replace(/\\/g, '/')).toLowerCase();
    const leaf = want.split('/').pop()!;
    const exact = files.find((f) => toPosix(path.relative(projectDir, f)).toLowerCase() === want);
    const byLeaf = exact ?? files.find((f) => path.basename(f).toLowerCase() === leaf);
    if (byLeaf) scriptMap[name] = fs.readFileSync(byLeaf, 'utf8');
    else missingScripts.push(name);
  }

  const title = guiXml.match(/<project>([^<]*)<\/project>/)?.[1]?.trim() || path.basename(guiRel, '.gui');
  const dirRel = toPosix(path.relative(base, projectDir));
  const fileBase = dirRel ? `${assetUrl(dirRel)}/` : assetUrl('');
  return { gui: guiRel, title, guiXml, imageMap, scriptMap, missingScripts, fileBase };
}

/** cf://host/file.gui is http://host/file.gui (iViewer's GUI links). */
export const guiUrl = (url: string) => url.replace(/^cf:\/\//i, 'http://');
export const isUrl = (s: string) => /^(https?|cf):\/\//i.test(s);

/** The image files a .gui names: <img>file.png</img>, url(file.png) in its themes, ... */
function imageNames(xml: string): string[] {
  const names = new Set<string>();
  for (const m of xml.matchAll(/>\s*([^<>"]+?\.(?:png|jpe?g|gif|webp|bmp|svg))\s*</gi)) names.add(m[1].trim());
  for (const m of xml.matchAll(/url\(\s*['"]?([^'")]+?\.(?:png|jpe?g|gif|webp|bmp|svg))['"]?\s*\)/gi)) names.add(m[1].trim());
  return [...names].filter((n) => !/^[a-z][a-z0-9+.-]*:/i.test(n));
}

/**
 * The manifest for a .gui on a web server (http://, https://, cf://): its
 * images and scripts next to it, as iViewer fetches them - through `proxy`
 * (the dev server: the browser can't fetch other sites' files itself).
 */
export async function loadRemoteManifest(url: string, proxy: (abs: string) => string): Promise<ProjectManifest> {
  const at = guiUrl(url);
  const get = async (u: string) => {
    const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  };
  const guiXml = decodeXml(await get(at));
  const base = new URL('.', at).href;
  const imageMap: Record<string, string> = {};
  for (const name of imageNames(guiXml)) imageMap[name.replace(/\\/g, '/').split('/').pop()!] = proxy(new URL(name.replace(/\\/g, '/'), base).href);
  const scriptMap: Record<string, string> = {};
  const missingScripts: string[] = [];
  await Promise.all(scriptNames(guiXml).map(async (name) => {
    try {
      scriptMap[name] = (await get(new URL(name.replace(/\\/g, '/'), base).href)).toString('utf8');
    } catch {
      missingScripts.push(name);
    }
  }));
  const title = guiXml.match(/<project>([^<]*)<\/project>/)?.[1]?.trim() || decodeURIComponent(at.split('/').pop() ?? at);
  return { gui: url, title, guiXml, imageMap, scriptMap, missingScripts, fileBase: proxy(base) };
}

/**
 * Where a GUI link goes (CF.loadGUI(url), href="cf://host/x.gui") from the
 * GUI shown: a .gui of the previewed project of that file name (its own
 * folder first) - what you're working on; else the URL, to be fetched.
 */
export function resolveGuiLink(guis: GuiEntry[], from: string, url: string): { gui: string; note?: string } {
  const fromUrl = isUrl(from);
  let abs: string | null = null;
  if (isUrl(url)) abs = guiUrl(url);
  else if (fromUrl) abs = new URL(url, guiUrl(from)).href;
  else {
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(from), url.replace(/\\/g, '/')));
    if (guis.some((g) => g.rel === rel)) return { gui: rel };
  }
  const leaf = decodeURIComponent((abs ? new URL(abs).pathname : url).split('/').pop() ?? '').toLowerCase();
  const local = guis.filter((g) => !isUrl(g.rel) && g.rel.split('/').pop()!.toLowerCase() === leaf);
  if (local.length) {
    const dir = fromUrl ? null : path.posix.dirname(from);
    const pick = local.find((g) => path.posix.dirname(g.rel) === dir) ?? local[0];
    return { gui: pick.rel, note: abs ? `${url} - this machine's ${pick.rel}` : undefined };
  }
  if (!abs) throw Object.assign(new Error(`no ${url} next to ${from}`), { status: 404 });
  return { gui: abs };
}


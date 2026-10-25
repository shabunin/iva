/**
 * A GUI to run, from where it is - a web server (http://, https://, cf://):
 * a .gui, a zipped GUI, iva serve's address - the way iViewer fetches it:
 * its images and scripts in its image folder. Files come through the app's
 * HTTP client (Rust: no CORS); images load from their server (it must allow
 * other origins - iva serve does), or from the archive (blob URLs). In the
 * app a zip never comes here: the app downloads it to the device and keeps
 * it there (useArchives). src/server/project.ts does the same for iva dev,
 * on the server side.
 */
import { convertFileSrc } from '@tauri-apps/api/core';
import { fetch as hostFetch } from '@tauri-apps/plugin-http';
import { atlasGroups, groupRank } from '../src/runtime/cf/atlas';
import type { SavedGui } from './store';
import type { CFProject } from '../src/runtime/cf/parser';

/** what a kept parse is good for: this build of the panel's (its parser, its runtime) - another build parses again */
export const PARSED_STAMP = new URL(import.meta.url).pathname;

/**
 * What a zipped GUI's .gui names, found among its files: its title, its image
 * folder, each image's file by its name, each script's (none: missing) in the
 * order they run. Kept with its parse, so a start after reads neither the
 * .gui nor its names (a slow phone: a second).
 */
export interface GuiIndex {
  title: string;
  folder: string;
  images: Record<string, string>;
  scripts: [string, string | null][];
}

/** what the app keeps beside a GUI's unpacked files (gui_keep_parsed): its parse and its index, by this build */
export interface KeptParse {
  stamp: string;
  project: CFProject;
  index?: GuiIndex;
}

export interface Manifest {
  /** where it came from: CF.loadGUI's links resolve against it */
  url: string;
  title: string;
  guiXml: string;
  imageMap: Record<string, string>;
  scriptMap: Record<string, string>;
  missingScripts: string[];
  /** why each missing script is missing (its fetch's error), for the log */
  problems: string[];
  /** a file of the GUI by its name (a web view's url="page.html") */
  fileUrl: (name: string) => string | undefined;
  /** its images packed in sheets (iva-atlas/ beside the .gui: the app packed them, a start before), when it has them */
  atlas?: Atlas;
  /** from an archive: the size run - its folder in the archive ('' the first size's, '1080w1920h/') */
  size?: string;
  /** from an archive in several sizes: the one for each orientation (the device turned: the other, if it's another) */
  sizes?: Record<Turn, string>;
  /** the GUI parsed before (kept by the app beside its unpacked files): not parsed again */
  project?: CFProject;
  /** the GUI as parsed now: for the app to keep beside its unpacked files */
  keepParsed?: (project: CFProject) => void;
  /** from an archive: what its .gui names, found among its files - kept with its parse, for a start after */
  index?: GuiIndex;
  /**
   * from an archive: its images as the app packs them in sheets
   * (src-tauri/src/atlas.rs) - [file, name in the .gui, group], the groups
   * in their sheets' order (atlasGroups)
   */
  toPack?: () => [string, string, string][];
}

/**
 * A GUI's images packed in sheets (iva-atlas/ beside the .gui, which the
 * .gui doesn't name: the app packs them, src-tauri/src/atlas.rs): each
 * sheet's URL and file, each image's frame by its name in the .gui -
 * [sheet, x, y, w, h].
 */
export interface Atlas {
  sheets: string[];
  files: string[];
  frames: Record<string, [number, number, number, number, number]>;
}

export const ATLAS_DIR = 'iva-atlas/';

/** The map an atlas.json is, its sheets where `url` has them - none if it isn't one, or a sheet is missing. */
function atlasOf(json: string, url: (file: string) => string | undefined): Atlas | undefined {
  try {
    const m = JSON.parse(json);
    if (m?.version !== 1 || !Array.isArray(m.sheets) || !m.frames || typeof m.frames !== 'object') return undefined;
    const files: string[] = m.sheets.map((sh: { file?: unknown }) => String(sh?.file ?? ''));
    const sheets = files.map((file) => (/^[\w.-]+\.png$/i.test(file) ? url(file) : undefined));
    if (sheets.some((u) => !u)) return undefined;
    return { sheets: sheets as string[], files, frames: m.frames };
  } catch {
    return undefined;
  }
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  html: 'text/html', htm: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json',
};
const mimeOf = (name: string) => MIME[name.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream';

/** cf://host/file.gui is http://host/file.gui (iViewer's GUI links); a bare address is http:// */
export const guiUrl = (url: string) => {
  const u = url.trim().replace(/^cf:\/\//i, 'http://');
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `http://${u}`;
};

/** A zip the app downloaded and keeps on the device as a GUI's copy (src-tauri/src/unpack.rs): when it came - its version - and how large. */
export interface AppArchive {
  savedAt: number;
  bytes: number;
}

/** What a server gave: the bytes, and what tells this version from its next one. */
export interface Download {
  url: string;
  /** what came - but a zip the app kept (`archive`): not here */
  bytes?: Uint8Array<ArrayBuffer>;
  /** a zip, downloaded by the app and kept by it as the GUI's copy (no bytes here) ... */
  archive?: AppArchive;
  /** ... the very bytes of the copy it kept before (that one stays, its version too) */
  same?: boolean;
  etag?: string;
  lastModified?: string;
  /** its Server header (iva serve has the whole build in one archive) */
  server?: string;
}

/** A GUI's copy as the app keeps it now (gui_kept: its kept.json): where it came from, what tells its next version. */
export interface AppKept extends AppArchive {
  url: string;
  etag?: string;
  lastModified?: string;
}

/** What the app's download answers (gui_fetch). */
export interface Fetched {
  status: number;
  etag?: string;
  lastModified?: string;
  server?: string;
  /** not a zip: what came, as text (a .gui; a web page) */
  text?: string;
  /** a zip: the GUI's copy now */
  archive?: AppArchive;
  /** that zip the very bytes of the copy kept before (it stays, its version too) */
  same?: boolean;
}

/**
 * The app's side of a GUI's zip (src-tauri/src/unpack.rs): downloaded
 * straight to the device and kept there as the GUI's copy (`id`'s) - none
 * of it through the page - and what's in it read there. A browser has none.
 */
export interface Archives {
  /** GET url (a GUI's own file), with the copy's ETag and Last-Modified if it's only wanted when another */
  fetch(id: string, url: string, known?: { etag?: string; lastModified?: string }): Promise<Fetched>;
  /** the GUI's copy as the app keeps it now, if it keeps one */
  kept(id: string): Promise<AppKept | null>;
  /** the names in the GUI's copy - that copy (when it came) */
  names(id: string, savedAt: number): Promise<string[]>;
  /** a file of the GUI's copy as text (a .gui) */
  text(id: string, savedAt: number, name: string): Promise<string>;
}
let archives: Archives | undefined;
/** the app's side, where there is one (the panel's page sets it); a test's stand-in */
export const useArchives = (a: Archives | undefined) => {
  archives = a;
};

/** what fetches: the app's HTTP client (Rust); a test's stand-in through useFetch */
let fetching: typeof hostFetch = hostFetch;
export const useFetch = (f: typeof hostFetch) => {
  fetching = f;
};

/** the app's own files (the built-in demo): the page's fetch has them, no server does */
export const ownFile = (url: string) => {
  if (typeof location === 'undefined') return false;
  const u = new URL(url);
  return u.protocol === location.protocol && u.host === location.host;
};

/**
 * GET url - with `known` (a saved copy's ETag, Last-Modified): null when the
 * server says it's the same. `id`: a GUI's own file (its .gui or zip, iva
 * serve's archive) - in the app a zip goes straight to the device, kept as
 * that GUI's copy.
 */
async function download(url: string, known?: { etag?: string; lastModified?: string }, id?: string): Promise<Download | null> {
  if (id !== undefined && archives && !ownFile(url)) {
    const r = await archives.fetch(id, url, known && { etag: known.etag, lastModified: known.lastModified });
    if (r.status === 304) return null;
    const bytes = r.text === undefined ? undefined : (new TextEncoder().encode(r.text) as Uint8Array<ArrayBuffer>);
    return { url, bytes, archive: r.archive, same: r.same, etag: r.etag, lastModified: r.lastModified, server: r.server };
  }
  const headers: Record<string, string> = {};
  if (known?.etag) headers['If-None-Match'] = known.etag;
  if (known?.lastModified) headers['If-Modified-Since'] = known.lastModified;
  // the app's own: past the web view's cache - an app updated keeps the file's URL, and the cache its old bytes
  const res = ownFile(url) ? await fetch(url, { headers, cache: 'no-store' }) : await fetching(url, { method: 'GET', headers, connectTimeout: 15000 });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const header = (name: string) => res.headers.get(name) ?? undefined;
  return { url, bytes: new Uint8Array(await res.arrayBuffer()), etag: header('etag'), lastModified: header('last-modified'), server: header('server') };
}

const get = async (url: string) => (await download(url))!.bytes!;
export const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
/** what came is a zipped GUI: kept by the app, or here */
export const zipped = (got: Download) => !!got.archive || (!!got.bytes && isZip(got.bytes));

function decodeXml(b: Uint8Array): string {
  // GUI Designer writes UTF-8 with a BOM; tolerate UTF-16 too
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  const s = new TextDecoder().decode(b);
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** The image files a .gui names: <img>file.png</img>, url(file.png) in its themes, ... */
function imageNames(xml: string): string[] {
  const names = new Set<string>();
  for (const m of xml.matchAll(/>\s*([^<>"]+?\.(?:png|jpe?g|gif|webp|bmp|svg))\s*</gi)) names.add(m[1].trim());
  for (const m of xml.matchAll(/url\(\s*['"]?([^'")]+?\.(?:png|jpe?g|gif|webp|bmp|svg))['"]?\s*\)/gi)) names.add(m[1].trim());
  return [...names].filter((n) => !/^[a-z][a-z0-9+.-]*:/i.test(n));
}

function scriptNames(xml: string): string[] {
  const block = xml.match(/<scripts\b[^>]*>([\s\S]*?)<\/scripts>/i);
  if (!block) return [];
  return [...block[1].matchAll(/<script\b[^>]*\bname\s*=\s*"([^"]*)"/gi)].map((m) => m[1].trim()).filter(Boolean);
}

const folderOf = (xml: string) => (xml.match(/<imagefolder>([^<]*)<\/imagefolder>/)?.[1] ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
const titleOf = (xml: string, fallback: string) => xml.match(/<project>([^<]*)<\/project>/)?.[1]?.trim() || fallback;

/** The GUI at `url` from its server, as it came: a .gui, or a zip (by what comes, whatever the URL says) - in the app, a zip kept by it. */
export const fetchGui = async (url: string) => (await download(guiUrl(url), undefined, guiUrl(url)))!;

/** The GUI at `url` from its server - a .gui, or a zip (by what comes, whatever the URL says) - and what came. */
export async function loadManifest(url: string): Promise<{ manifest: Manifest; got: Download }> {
  const got = await fetchGui(url);
  return { manifest: await manifestOf(got), got };
}

/** The GUI that came from its server (fetchGui). */
export async function manifestOf(got: Download): Promise<Manifest> {
  // a zip the app kept, read here after all (the app couldn't unpack it): its bytes from the server again
  const bytes = got.bytes ?? (await download(got.url))!.bytes!;
  if (isZip(bytes)) return zipManifest(openZip(bytes), got.url);
  const xml = decodeXml(bytes);
  // a web page, a wrong address: say so, not an empty screen
  if (!/<gui[\s>]/.test(xml)) throw new Error(`${got.url}: not a GUI (a .gui, a zipped GUI or iva serve's address)`);
  return remoteManifest(got.url, xml);
}

/** A GUI from its copy on the device, read here (not a zip the app keeps: the app unpacks that, src-tauri/src/unpack.rs). */
export async function savedManifest(saved: SavedGui): Promise<Manifest> {
  if (saved.appZip && !saved.zip) throw new Error("the copy is the app's, and it couldn't unpack it");
  return zipManifest(saved.zip ? openZip(saved.zip) : filesArchive(new Map(Object.entries(saved.files ?? {}))), saved.url);
}

/** a web view's page in the GUI's files (url="page.html"), not one on the web */
const webPages = (xml: string) =>
  [...xml.matchAll(/<web\b[^>]*\burl\s*=\s*"([^"]+)"/gi)].map((m) => m[1].trim()).filter((u) => u && !/^[a-z][a-z0-9+.-]*:/i.test(u) && !u.startsWith('//'));

/** `work` on each, `n` at a time */
async function each<T>(items: T[], n: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  }));
}

/**
 * What to keep of a GUI that came from its server: a zip as it came; iva
 * serve's whole build (its web pages, the assets its scripts load); or the
 * files a .gui names - its images, scripts and web pages - beside it. A copy
 * kept is whole: a script the load lost is asked for again, and one still
 * missing means no copy (the one kept before stays) - a copy without the
 * start script would run nothing, every start.
 */
export async function toSave(got: Download, m?: Manifest): Promise<SavedGui> {
  const base = { url: got.url, etag: got.etag, lastModified: got.lastModified, savedAt: Date.now() };
  // a zip the app keeps: its version the app's (when it came)
  if (got.archive) return { ...base, appZip: true, savedAt: got.archive.savedAt, bytes: got.archive.bytes };
  const bytes = got.bytes!;
  if (isZip(bytes)) return { ...base, zip: bytes, bytes: bytes.length };
  m ??= await manifestOf(got);
  const gui = decodeXml(bytes);
  if (got.server?.startsWith('iva')) {
    // the whole build in one archive (asked for twice: a flaky link) - in the app, kept by it as this GUI's copy
    const at = new URL('/__iva/gui.zip', got.url).href;
    const zip = await download(at, undefined, got.url).catch(() => download(at, undefined, got.url)).catch(() => null);
    if (zip?.archive) return { ...base, gui, appZip: true, savedAt: zip.archive.savedAt, bytes: zip.archive.bytes };
    if (zip?.bytes && isZip(zip.bytes)) return { ...base, gui, zip: zip.bytes, bytes: zip.bytes.length };
  }
  const folder = folderOf(gui);
  const inFolder = (name: string) => (folder ? `${folder}/` : '') + name.replace(/\\/g, '/');
  const own = decodeURIComponent(new URL(got.url).pathname.split('/').pop() ?? '');
  const files: Record<string, Uint8Array<ArrayBuffer>> = { [/\.gui$/i.test(own) ? own : 'gui.gui']: bytes };
  const names = [...new Set([...imageNames(gui), ...webPages(gui)].map((n) => n.replace(/\\/g, '/')))];
  await each(names, 6, async (name) => {
    const href = m.fileUrl(name);
    if (!href) return;
    try {
      files[inFolder(name)] = await get(href);
    } catch {
      // not on the server: missing when it runs from there too
    }
  });
  for (const [name, code] of Object.entries(m.scriptMap)) files[inFolder(name)] = new TextEncoder().encode(code);
  // the scripts the load lost: once more, for the copy
  const lost: string[] = [];
  await each(m.missingScripts, 2, async (name) => {
    const href = m.fileUrl(name);
    try {
      if (!href) throw new Error('nowhere to ask');
      files[inFolder(name)] = await get(href);
    } catch {
      lost.push(name);
    }
  });
  if (lost.length) throw new Error(`not kept - scripts missing: ${lost.join(', ')}`);
  return { ...base, gui, files, bytes: Object.values(files).reduce((n, f) => n + f.length, 0) };
}

/**
 * The server's version of a saved GUI, to keep - null if it's the one saved
 * (or the same bytes again). A zipped GUI's copy in the app: asked for by the
 * app, a new one kept by it. A copy an older panel kept here, its zip in the
 * page's storage: the app's own from the server, once (no If-None-Match).
 */
export async function newerVersion(saved: SavedGui): Promise<SavedGui | null> {
  const older = !!archives && !!saved.zip;
  const got = await download(saved.url, older ? undefined : saved, archives && !saved.gui ? saved.url : undefined);
  if (!got) return null;
  // the bytes kept already: not newer - unless the copy kept isn't the one this page knew (a reload cut its check short)
  if (got.archive) return got.same && got.archive.savedAt === saved.savedAt ? null : toSave(got);
  const bytes = got.bytes!;
  if (!older && (isZip(bytes) ? !saved.gui && !!saved.zip && same(saved.zip, bytes) : saved.gui === decodeXml(bytes))) return null;
  return toSave(got, await manifestOf(got));
}

/**
 * The app's copy of a GUI (`id`'s), if it keeps one newer than the copy the
 * page noted (`savedAt`, when that one came): a download goes on past the page
 * that asked for it - iva serve's live reload in the middle of a check for a
 * newer version - and the page after never heard how it ended.
 */
export async function newerInApp(id: string, savedAt: number): Promise<AppKept | undefined> {
  const k = await archives?.kept(id).catch(() => null);
  return k && k.savedAt > savedAt ? k : undefined;
}

/**
 * A copy noted, as the app keeps it now (newerInApp's): its zip the copy, by
 * the app's version of it. A .gui's text and ETag (iva serve's, beside its
 * archive) stay the ones noted: the next check asks for the .gui, and the
 * archive that comes with it is the one the app keeps.
 */
export function asTheAppKeeps(saved: SavedGui, k: AppKept): SavedGui {
  const { zip: _zip, files: _files, ...noted } = saved;
  return { ...noted, ...(saved.gui ? {} : { etag: k.etag, lastModified: k.lastModified }), appZip: true, savedAt: k.savedAt, bytes: k.bytes };
}

function same(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function remoteManifest(at: string, guiXml: string): Promise<Manifest> {
  const base = new URL('.', at).href;
  // images and scripts: in its image folder, as iViewer fetches them
  const folder = folderOf(guiXml);
  const files = folder ? new URL(`${folder.split('/').map(encodeURIComponent).join('/')}/`, base).href : base;
  const imageMap: Record<string, string> = {};
  for (const name of imageNames(guiXml)) {
    const n = name.replace(/\\/g, '/');
    const href = new URL(n, files).href;
    imageMap[n] ??= href;
    imageMap[n.split('/').pop()!] ??= href;
  }
  const scriptMap: Record<string, string> = {};
  const missingScripts: string[] = [];
  const problems: string[] = [];
  // a few at a time (a dozen at once and a flaky link - ZeroTier - drops one now and then), a failed one asked
  // for once more; the ones still missing after that again, in rounds a little apart, two at a time - a GUI
  // without its start script or its web server's runs nothing
  const failed = new Map<string, unknown>();
  const fetchScript = async (name: string) => {
    try {
      scriptMap[name] = new TextDecoder().decode(await get(new URL(name.replace(/\\/g, '/'), files).href));
      failed.delete(name);
    } catch (e) {
      failed.set(name, e);
    }
  };
  await each(scriptNames(guiXml), 4, async (name) => {
    await fetchScript(name);
    if (failed.has(name)) await fetchScript(name);
  });
  for (let round = 1; round <= 3 && failed.size; round++) {
    await new Promise((r) => setTimeout(r, 300 * round));
    await each([...failed.keys()], 2, fetchScript);
  }
  for (const [name, error] of failed) {
    missingScripts.push(name);
    problems.push(`${name}: ${error instanceof Error ? error.message : String(error)} (after 5 tries)`);
  }
  const path = new URL(at).pathname;
  const title = titleOf(guiXml, decodeURIComponent(path.split('/').pop() || new URL(at).host));
  // a project file (CF.loadAsset, a web view's page): in the image folder, where iViewer keeps them
  return { url: at, title, guiXml, imageMap, scriptMap, missingScripts, problems, fileUrl: (name) => new URL(name.replace(/\\/g, '/'), files).href };
}

/** the way the screen is turned */
export type Turn = 'landscape' | 'portrait';
/** how the screen is turned now (the panel says; else by the window's shape) */
let turnNow: Turn | undefined;
export const useTurn = (t: Turn | undefined) => {
  turnNow = t;
};
const turn = (): Turn | undefined => turnNow ?? (typeof innerWidth === 'number' && innerWidth && innerHeight ? (innerHeight > innerWidth ? 'portrait' : 'landscape') : undefined);

/** A .gui's sizes in each orientation (its <size>), and the orientations its pages are laid out in. */
interface Layout {
  landscape?: [number, number];
  portrait?: [number, number];
  has: Set<Turn>;
}

export function layoutOf(xml: string): Layout {
  const dims = (t: Turn): [number, number] | undefined => {
    const tag = new RegExp(`<${t}\\b[^>]*\\bwidth="[^"]*"[^>]*>`).exec(xml)?.[0] ?? '';
    const w = Number(/width="(\d+)"/.exec(tag)?.[1]);
    const h = Number(/height="(\d+)"/.exec(tag)?.[1]);
    return w && h ? [w, h] : undefined;
  };
  // a page's layout in an orientation: <portrait> with something in it (GUI Designer writes the other one empty)
  const has = new Set<Turn>((['landscape', 'portrait'] as Turn[]).filter((t) => new RegExp(`<${t}>\\s*<(?!/${t}>)`).test(xml)));
  return { landscape: dims('landscape'), portrait: dims('portrait'), has: has.size ? has : new Set<Turn>(['landscape', 'portrait']) };
}

/**
 * Of one GUI's sizes, the one for the screen: turned `t`, one laid out that
 * way (iva build's <Project sizes>: 1080x1920's pages portrait, 1280x800's
 * landscape), shaped most like the screen turned so; without `t`, or no
 * size laid out that way, the one shaped most like the screen turned either
 * way.
 */
export function shapedLike(sizes: string[], layouts: Map<string, Layout>, w: number, h: number, t?: Turn): string {
  const long = (a: number, b: number) => Math.max(a, b) / Math.min(a, b);
  const pool = t ? sizes.filter((n) => layouts.get(n)?.has.has(t)) : [];
  const off = (pool.length ? pool : sizes).map((n) => {
    const l = layouts.get(n);
    let d: number;
    if (pool.length && t && l?.[t]) {
      const [gw, gh] = l[t]!;
      const [sw, sh] = t === 'landscape' ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
      d = Math.abs(Math.log(gw / gh / (sw / sh)));
    } else {
      const [gw, gh] = l?.landscape ?? [0, 0];
      d = gw && gh ? Math.abs(Math.log(long(gw, gh) / long(w, h))) : Infinity;
    }
    // a screen with no size yet (0 x 0): no shape to go by
    return Number.isNaN(d) ? Infinity : d;
  });
  const from = pool.length ? pool : sizes;
  return from[Math.max(0, off.indexOf(Math.min(...off)))];
}

/**
 * A zip archive's files, read as they're asked for: its entries' names at
 * once (its central directory), an entry's bytes when wanted - a stored one
 * (iva's PNGs) a view of the archive as it lies, a deflated one inflated
 * then. A GUI's archive holds every size's files, and one size is all that
 * runs: unzipping the whole of it is what a slow phone can't afford.
 */
export interface Archive {
  names: string[];
  /** a stored entry's bytes as they lie in the archive (no copy); undefined for a deflated one */
  stored(name: string): Uint8Array<ArrayBuffer> | undefined;
  read(name: string): Promise<Uint8Array<ArrayBuffer>>;
  /** a file's own URL, where it has one (a folder's files: no Blob made of it) */
  url?(name: string): string;
}

/** A zip archive opened: stored or deflated entries (no zip64, no encryption). */
export function openZip(z: Uint8Array<ArrayBuffer>): Archive {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  // the end of central directory record: the last PK\5\6 (after it, at most a comment)
  let end = -1;
  for (let i = z.length - 22; i >= Math.max(0, z.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip archive');
  const count = dv.getUint16(end + 10, true);
  let at = dv.getUint32(end + 16, true);
  const text = new TextDecoder();
  const entries = new Map<string, { method: number; start: number; size: number }>();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(at, true) !== 0x02014b50) throw new Error('a broken zip archive');
    const method = dv.getUint16(at + 10, true);
    const size = dv.getUint32(at + 20, true);
    const nameLen = dv.getUint16(at + 28, true);
    const local = dv.getUint32(at + 42, true);
    const name = text.decode(z.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + dv.getUint16(at + 30, true) + dv.getUint16(at + 32, true);
    if (name.endsWith('/')) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    entries.set(name, { method, start, size });
  }
  return {
    names: [...entries.keys()],
    stored: (name) => {
      const e = entries.get(name);
      return e && e.method === 0 ? z.subarray(e.start, e.start + e.size) : undefined;
    },
    async read(name) {
      const e = entries.get(name);
      if (!e) throw new Error(`${name}: not in the archive`);
      const data = z.subarray(e.start, e.start + e.size);
      if (e.method === 0) return data;
      if (e.method === 8) return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      throw new Error(`${name}: zip compression ${e.method} isn't supported`);
    },
  };
}

/**
 * A GUI's copy the app keeps (a zip it downloaded, `id`'s, from `savedAt`)
 * as an Archive: its names, and a file read by the app - as text, re-encoded
 * (what a plan reads of it: its .gui).
 */
export async function appArchive(id: string, savedAt: number): Promise<Archive> {
  const a = archives;
  if (!a) throw new Error('no app to keep an archive');
  const names = await a.names(id, savedAt);
  return {
    names,
    stored: () => undefined,
    read: async (name) => new TextEncoder().encode(await a.text(id, savedAt, name)) as Uint8Array<ArrayBuffer>,
  };
}

/** Files by their path (a copy kept as files beside its .gui) as an Archive. */
function filesArchive(files: Map<string, Uint8Array<ArrayBuffer>>): Archive {
  return {
    names: [...files.keys()],
    stored: (name) => files.get(name),
    async read(name) {
      const f = files.get(name);
      if (!f) throw new Error(`${name}: not in the copy`);
      return f;
    },
  };
}

/** A zip archive's files by their path in it - every one of them read (a test's; the panel reads what it needs). */
export async function unzip(z: Uint8Array<ArrayBuffer>): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const a = openZip(z);
  const out = new Map<string, Uint8Array<ArrayBuffer>>();
  // a few at a time: a thousand inflating streams at once fail ("Failed to fetch")
  await each(a.names, 8, async (name) => void out.set(name, await a.read(name)));
  return out;
}

/** iva build's other sizes, each in a folder of its own (1400w1400h/) */
const SIZE_DIR = /^\d+w\d+h\//i;
/** the images iViewer's retina screens take: not a panel's */
const RETINA = /@2x\.(png|jpe?g|gif)$/i;

/**
 * What the app unpacks of a zipped GUI (src-tauri/src/unpack.rs): the size
 * run's files - but for sheets of its own (the app's go there) - the folder
 * its sheets go in, beside its .gui, and which size it is (the one for each
 * orientation, of several). From its bytes, or the app's copy (appArchive).
 */
export async function unpackPlan(zip: Uint8Array<ArrayBuffer> | Archive, id: string): Promise<{ files: string[]; atlas: string; size: string; sizes?: Record<Turn, string> }> {
  const { dir, names, sizes } = await sizeRun(zip instanceof Uint8Array ? openZip(zip) : zip, id);
  const sheets = `${dir}${ATLAS_DIR}`;
  return { files: names.filter((n) => !n.toLowerCase().startsWith(sheets.toLowerCase())), atlas: sheets.replace(/\/$/, ''), size: dir, sizes };
}

/**
 * A zipped GUI's files: its .gui and that size's images, scripts and
 * sheets, read as they're needed (as src/server/project.ts zipManifest).
 * With it, how the app packs its images (toPack).
 */
async function zipManifest(a: Archive, id: string, kept?: GuiIndex): Promise<Manifest> {
  const { entry, dir, names, sizes } = await sizeRun(a, id);
  const leaf = (n: string) => n.split('/').pop()!.toLowerCase();
  // the index kept: no .gui to read (nor to pack from - its images are in sheets)
  const guiXml = kept ? '' : decodeXml(await a.read(entry));
  const folder = kept ? kept.folder : folderOf(guiXml);
  const imageRoot = dir + (folder ? `${folder}/` : '');
  const lower = new Map(names.map((n) => [n.toLowerCase(), n]));
  const blobs = new Map<string, string>();
  const blobOf = (name: string, bytes: Uint8Array<ArrayBuffer>) => {
    let u = blobs.get(name);
    if (!u) {
      u = URL.createObjectURL(new Blob([bytes], { type: mimeOf(name) }));
      blobs.set(name, u);
    }
    return u;
  };
  const urlOf = async (name: string) => a.url?.(name) ?? blobs.get(name) ?? blobOf(name, a.stored(name) ?? (await a.read(name)));
  /** a file's URL at once: its own, one made already, or a stored one's */
  const urlNow = (name: string) => {
    if (a.url) return a.url(name);
    if (blobs.has(name)) return blobs.get(name);
    const b = a.stored(name);
    return b ? blobOf(name, b) : undefined;
  };
  // its images in sheets, beside its .gui (the app packed them)
  const inAtlas = (file: string) => lower.get(`${dir}${ATLAS_DIR}${file}`.toLowerCase());
  const mapFile = inAtlas('atlas.json');
  const mapped = mapFile ? atlasOf(decodeXml(await a.read(mapFile)), (file) => inAtlas(file)) : undefined;
  const atlas = mapped?.sheets.length ? { ...mapped, sheets: await Promise.all(mapped.sheets.map(urlOf)) } : undefined;
  // the images the .gui names (as remoteManifest maps them), by their path in the image folder and by bare
  // name: found in the image folder, then by the .gui, then by name (the shallowest of that name - sorted
  // once it's asked for: a .gui read afresh, not the index kept)
  const byLeaf = new Map<string, string>();
  const byLeafOf = () => {
    if (byLeaf.size) return byLeaf;
    for (const n of [...names].sort((x, y) => x.split('/').length - y.split('/').length)) {
      if (IMAGE_RE.test(n) && !byLeaf.has(leaf(n))) byLeaf.set(leaf(n), n);
    }
    return byLeaf;
  };
  const fileOf = (n: string) => lower.get((imageRoot + n).toLowerCase()) ?? lower.get((dir + n).toLowerCase()) ?? byLeafOf().get(leaf(n));
  let images: Record<string, string> = {};
  if (kept) images = kept.images;
  else {
    for (const named of imageNames(guiXml)) {
      const n = named.replace(/\\/g, '/');
      const file = fileOf(n);
      if (!file) continue;
      images[n] ??= file;
      images[n.split('/').pop()!] ??= file;
    }
  }
  const imageMap: Record<string, string> = {};
  // files with URLs of their own (a folder's): at once
  if (a.url) for (const [n, file] of Object.entries(images)) imageMap[n] = a.url(file);
  else await each(Object.entries(images), 8, async ([n, file]) => void (imageMap[n] = await urlOf(file)));
  // in the image folder, where iViewer looks for it; then by the .gui, then by name
  const scriptFiles: [string, string | null][] = kept?.scripts ?? scriptNames(guiXml).map((name) => {
    const want = name.replace(/\\/g, '/').toLowerCase();
    return [name, lower.get(imageRoot.toLowerCase() + want) ?? lower.get(dir.toLowerCase() + want) ?? names.find((n) => leaf(n) === want.split('/').pop()) ?? null];
  });
  const scriptMap: Record<string, string> = {};
  const missingScripts = scriptFiles.filter(([, file]) => !file).map(([name]) => name);
  await each(scriptFiles.filter(([, file]) => file), a.url ? 16 : 4, async ([name, file]) => void (scriptMap[name] = new TextDecoder().decode(await a.read(file!))));
  // the order the .gui has them in (they run in it)
  const ordered = Object.fromEntries(scriptFiles.filter(([n]) => n in scriptMap).map(([n]) => [n, scriptMap[n]]));
  // the size's other files a deflated archive holds (a web view's page, a script's data): ready for fileUrl, which
  // answers at once
  if (!a.url) await each(names.filter((n) => !a.stored(n) && !IMAGE_RE.test(n) && !/\.gui$/i.test(n)), 4, async (n) => void (await urlOf(n)));
  const title = kept ? kept.title : titleOf(guiXml, entry.split('/').pop()!.replace(/\.gui$/i, ''));
  return {
    url: id, title, guiXml, imageMap, scriptMap: ordered, missingScripts, problems: missingScripts.map((n) => `${n}: not in the archive`), atlas, size: dir, sizes,
    index: { title, folder, images, scripts: scriptFiles },
    // a project file (CF.loadAsset, a web view's page): in the image folder, else beside the .gui
    fileUrl: (name) => {
      const n = name.replace(/\\/g, '/');
      const found = [imageRoot + n, dir + n].map((f) => lower.get(f.toLowerCase())).find(Boolean);
      return found ? urlNow(found) : undefined;
    },
    toPack: kept ? undefined : () => {
      // the PNGs, by the group atlasGroups puts each in: the groups in their sheets' order
      const { groups, pages } = atlasGroups(guiXml, Object.values(ordered));
      const pack: [string, string, string][] = [];
      for (const [n, group] of groups) {
        const file = fileOf(n);
        if (file && /\.png$/i.test(file)) pack.push([file, n, group]);
      }
      return pack.sort((x, y) => groupRank(x[2], pages) - groupRank(y[2], pages) || x[2].localeCompare(y[2]));
    },
  };
}

/**
 * Of a zipped GUI, the size run: its .gui - the one named after the archive
 * (clock.gui.zip: clock.gui), else the shallowest; one in several sizes
 * (iva build's <Project sizes>: 1400w1400h/x.gui beside x.gui) the one
 * shaped like the screen - the folder it's in, and the files beside it (not
 * another size's, not the @2x ones only iViewer's retina screens take).
 */
async function sizeRun(a: Archive, id: string): Promise<{ entry: string; dir: string; names: string[]; sizes?: Record<Turn, string> }> {
  const guis = a.names.filter((n) => /\.gui$/i.test(n));
  if (!guis.length) throw new Error(`${id}: no .gui in the archive`);
  const own = decodeURIComponent(new URL(id).pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.zip$/i, '').toLowerCase();
  const leaf = (n: string) => n.split('/').pop()!.toLowerCase();
  let entry = guis.find((n) => leaf(n) === own)
    ?? guis.find((n) => leaf(n).replace(/\.gui$/, '') === own)
    ?? [...guis].sort((x, y) => x.split('/').length - y.split('/').length || x.localeCompare(y))[0];
  const sizes = guis.filter((n) => leaf(n) === leaf(entry));
  const dirOf = (n: string) => (n.includes('/') ? n.slice(0, n.lastIndexOf('/') + 1) : '');
  let bySize: Record<Turn, string> | undefined;
  if (sizes.length > 1 && typeof screen !== 'undefined') {
    const layouts = new Map(await Promise.all(sizes.map(async (n): Promise<[string, Layout]> => [n, layoutOf(decodeXml(await a.read(n)))])));
    entry = shapedLike(sizes, layouts, screen.width, screen.height, turn());
    bySize = {
      landscape: dirOf(shapedLike(sizes, layouts, screen.width, screen.height, 'landscape')),
      portrait: dirOf(shapedLike(sizes, layouts, screen.width, screen.height, 'portrait')),
    };
  }
  const dir = dirOf(entry);
  const names = a.names.filter((n) => n.startsWith(dir) && !(SIZE_DIR.test(n.slice(dir.length)) && !SIZE_DIR.test(dir)) && !RETINA.test(n));
  return { entry, dir, names, sizes: bySize };
}

/**
 * A GUI from its files unpacked on the device - by the app, from its archive
 * (src-tauri/src/unpack.rs) - each file by its URL in the folder (the asset
 * protocol): nothing to unzip, no Blob made; its images in sheets, once the
 * app packed them.
 */
export async function folderManifest(u: { root: string; files: string[]; packed?: boolean; parsed?: string }, id: string): Promise<Manifest> {
  const sep = u.root.includes('\\') && !u.root.includes('/') ? '\\' : '/';
  const url = (name: string) => convertFileSrc(`${u.root}${sep}${sep === '\\' ? name.replace(/\//g, '\\') : name}`);
  // the GUI as parsed before, if this build of the panel kept it (read beside the files)
  const kept = u.parsed
    ? fetch(convertFileSrc(u.parsed)).then((r) => (r.ok ? r.json() : null)).then((k: KeptParse | null) => (k?.stamp === PARSED_STAMP ? k : undefined), () => undefined)
    : Promise.resolve(undefined);
  // its images in sheets: what the .gui names, from the index kept with it (the .gui isn't read)
  const index = u.packed ? (await kept)?.index : undefined;
  const m = await zipManifest({
    names: u.files,
    stored: () => undefined,
    url,
    async read(name) {
      const res = await fetch(url(name));
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    },
  }, id, index);
  m.project = (await kept)?.project;
  return m;
}

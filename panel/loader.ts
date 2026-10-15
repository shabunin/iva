/**
 * A GUI to run, from where it is - a web server (http://, https://, cf://):
 * a .gui, a zipped GUI, iva serve's address - the way iViewer fetches it:
 * its images and scripts in its image folder. Files come through the app's
 * HTTP client (Rust: no CORS); images load from their server (it must allow
 * other origins - iva serve does), or from the archive (blob URLs).
 * src/server/project.ts does the same for iva dev, on the server side.
 */
import { fetch as hostFetch } from '@tauri-apps/plugin-http';

export interface Manifest {
  /** where it came from: CF.loadGUI's links resolve against it */
  url: string;
  title: string;
  guiXml: string;
  imageMap: Record<string, string>;
  scriptMap: Record<string, string>;
  missingScripts: string[];
  /** a file of the GUI by its name (a web view's url="page.html") */
  fileUrl: (name: string) => string | undefined;
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

async function get(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await hostFetch(url, { method: 'GET', connectTimeout: 15000 });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

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

/** The GUI at `url`: a .gui, or a zip (by what comes, whatever the URL says). */
export async function loadManifest(url: string): Promise<Manifest> {
  const at = guiUrl(url);
  const bytes = await get(at);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4) return zipManifest(await unzip(bytes), at);
  const xml = decodeXml(bytes);
  // a web page, a wrong address: say so, not an empty screen
  if (!/<gui[\s>]/.test(xml)) throw new Error(`${at}: not a GUI (a .gui, a zipped GUI or iva serve's address)`);
  return remoteManifest(at, xml);
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
  await Promise.all(scriptNames(guiXml).map(async (name) => {
    try {
      scriptMap[name] = new TextDecoder().decode(await get(new URL(name.replace(/\\/g, '/'), files).href));
    } catch {
      missingScripts.push(name);
    }
  }));
  const path = new URL(at).pathname;
  const title = titleOf(guiXml, decodeURIComponent(path.split('/').pop() || new URL(at).host));
  // a project file (CF.loadAsset, a web view's page): in the image folder, where iViewer keeps them
  return { url: at, title, guiXml, imageMap, scriptMap, missingScripts, fileUrl: (name) => new URL(name.replace(/\\/g, '/'), files).href };
}

/**
 * A zipped GUI's files: its .gui - the one named after the archive
 * (clock.gui.zip: clock.gui), else the shallowest - and its images and
 * scripts from the archive (as src/server/project.ts zipManifest).
 */
function zipManifest(files: Map<string, Uint8Array<ArrayBuffer>>, id: string): Manifest {
  const guis = [...files.keys()].filter((n) => /\.gui$/i.test(n));
  if (!guis.length) throw new Error(`${id}: no .gui in the archive`);
  const own = decodeURIComponent(new URL(id).pathname.split('/').filter(Boolean).pop() ?? '').replace(/\.zip$/i, '').toLowerCase();
  const entry = guis.find((n) => n.split('/').pop()!.toLowerCase() === own)
    ?? guis.find((n) => n.split('/').pop()!.toLowerCase().replace(/\.gui$/, '') === own)
    ?? [...guis].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
  const guiXml = decodeXml(files.get(entry)!);
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : '';
  const folder = folderOf(guiXml);
  const imageRoot = dir + (folder ? `${folder}/` : '');
  const blobs = new Map<string, string>();
  const blobUrl = (name: string) => {
    let u = blobs.get(name);
    if (!u) {
      u = URL.createObjectURL(new Blob([files.get(name)!], { type: mimeOf(name) }));
      blobs.set(name, u);
    }
    return u;
  };
  // images by their path in the image folder, and by bare name
  const imageMap: Record<string, string> = {};
  for (const name of [...files.keys()].sort((a, b) => a.split('/').length - b.split('/').length)) {
    if (!IMAGE_RE.test(name)) continue;
    if (name.startsWith(imageRoot) && !imageMap[name.slice(imageRoot.length)]) imageMap[name.slice(imageRoot.length)] = blobUrl(name);
    const leaf = name.split('/').pop()!;
    if (!imageMap[leaf]) imageMap[leaf] = blobUrl(name);
  }
  const scriptMap: Record<string, string> = {};
  const missingScripts: string[] = [];
  const names = [...files.keys()];
  for (const name of scriptNames(guiXml)) {
    const want = name.replace(/\\/g, '/').toLowerCase();
    const leaf = want.split('/').pop()!;
    // in the image folder, where iViewer looks for it; then by the .gui, then by name
    const found = names.find((n) => n.toLowerCase() === imageRoot.toLowerCase() + want) ?? names.find((n) => n.toLowerCase() === dir.toLowerCase() + want)
      ?? names.find((n) => n.split('/').pop()!.toLowerCase() === leaf);
    if (found) scriptMap[name] = new TextDecoder().decode(files.get(found)!);
    else missingScripts.push(name);
  }
  const title = titleOf(guiXml, entry.split('/').pop()!.replace(/\.gui$/i, ''));
  return {
    url: id, title, guiXml, imageMap, scriptMap, missingScripts,
    // a project file (CF.loadAsset, a web view's page): in the image folder, else beside the .gui
    fileUrl: (name) => {
      const n = name.replace(/\\/g, '/');
      const found = [imageRoot + n, dir + n].find((f) => files.has(f));
      return found ? blobUrl(found) : undefined;
    },
  };
}

/** A zip archive's files by their path in it: stored or deflated (no zip64, no encryption). */
export async function unzip(z: Uint8Array<ArrayBuffer>): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
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
  const entries: { name: string; method: number; data: Uint8Array<ArrayBuffer> }[] = [];
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
    entries.push({ name, method, data: z.slice(start, start + size) });
  }
  const out = new Map<string, Uint8Array<ArrayBuffer>>();
  await Promise.all(entries.map(async ({ name, method, data }) => {
    if (method === 0) out.set(name, data);
    else if (method === 8) out.set(name, new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()));
    else throw new Error(`${name}: zip compression ${method} isn't supported`);
  }));
  return out;
}

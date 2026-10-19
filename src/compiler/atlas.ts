/**
 * Atlases: a build's images packed into a few sheets per page - for the iva
 * panel, which loads a page's sheets (a handful of files) instead of its
 * images one by one (hundreds: a slow phone spends ~30 ms on each, whatever
 * its size).
 *
 * The sheets and their map go in iva-atlas/ beside the .gui, which the .gui
 * never names: iViewer doesn't see them, and loads the images one by one as
 * ever. The panel reads iva-atlas/atlas.json, and without it (a GUI from GUI
 * Designer, an older build) loads the images one by one too.
 *
 * What goes in: the PNGs the .gui names, up to MAX_SIDE a side, but for those
 * a theme tiles (background-repeat: repeat - a tiled sprite repeats its whole
 * texture). Grouped by the page that shows them (its objects, its themes'
 * every state, the subpages placed on it and theirs); one shown by several
 * pages goes in the shared sheets, one no page shows (a subpage scripts put
 * on) in its subpage's. Each image has PAD pixels of its own edge around it,
 * so scaled it doesn't pick up its neighbours'.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';
import pngjs from 'pngjs';

/** the folder beside the .gui */
export const ATLAS_DIR = 'iva-atlas';
const SHEET = 2048;
const PAD = 2;
const MAX_SIDE = 1024;

export interface AtlasMap {
  version: 1;
  /** the sheets: their files in ATLAS_DIR, sizes, and what they hold ('shared', 'page:Home', 'sub:menu') */
  sheets: { file: string; w: number; h: number; group: string }[];
  /** each image by its name in the .gui (its path in the image folder, '/'): [sheet, x, y, w, h] */
  frames: Record<string, [number, number, number, number, number]>;
}

/** an image to pack: its name in the .gui, its bytes */
export interface AtlasInput {
  name: string;
  data: Buffer;
}

// ── which images go together ──

const IMAGE_TEXT = />\s*([^<>"]+?\.png)\s*</gi;
const IMAGE_URL = /url\(\s*['"]?([^'")]+?\.png)['"]?\s*\)/gi;
const ATTR = /\s([\w:-]+)="([^"]*)"/g;
const norm = (name: string) => name.trim().replace(/\\/g, '/').toLowerCase();

/**
 * What a project's runtime looks (<Project themes>, themes.ts) switch to,
 * from the IvaTheme script's table: each tag's theme in every look, each
 * image join's file in every look, the files scripts name in every look.
 */
interface Looks {
  tags: Record<string, string[]>;
  images: Record<string, string[]>;
  files: Record<string, string>[];
}

function looksOf(scripts: string[]): Looks | undefined {
  for (const code of scripts) {
    const m = /var IvaTheme = \(function \(\) \{\s*var D = (\{.*?\});\r?\n/.exec(code);
    if (!m) continue;
    try {
      const d = JSON.parse(m[1]);
      return { tags: d.tags ?? {}, images: d.images ?? {}, files: d.files ?? [] };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Each image the .gui names (normalised: '/', lower case): the group its
 * sheet is, or none for one that stays a file of its own (tiled). `scripts`:
 * the build's scripts' code - the looks a project switches between are in
 * one (an object's theme in another look goes with the page it's on).
 */
export function atlasGroups(xml: string, scripts: string[] = []): { groups: Map<string, string>; tiled: Set<string>; pages: string[] } {
  const looks = looksOf(scripts);
  // themes: their images (every state), and the ones they tile
  const themes = new Map<string, Set<string>>();
  const tiled = new Set<string>();
  for (const m of xml.matchAll(/<theme\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/theme>/g)) {
    const base = m[1].replace(/^\./, '').replace(/\[.*$/, '');
    const css = m[2];
    const set = themes.get(base) ?? themes.set(base, new Set()).get(base)!;
    const urls = [...css.matchAll(IMAGE_URL)].map((u) => norm(u[1]));
    urls.forEach((u) => set.add(u));
    if (/background-repeat\s*:\s*repeat/i.test(css)) urls.forEach((u) => tiled.add(u));
  }
  // subpages: defined at the .gui's top level, outside its pages (in a page, <subpage name="x" ... /> places
  // one); a definition is <subpage ...>its objects</subpage>, or <subpage ... /> with only its own theme
  const outside = xml.replace(/<page\b[\s\S]*?<\/page>/g, '');
  const subs = new Map<string, string>();
  for (const m of outside.matchAll(/<subpage\b((?:[^>/]|\/(?!>))*)(?:\/>|>([\s\S]*?)<\/subpage>)/g)) {
    const name = /\bname="([^"]*)"/.exec(m[1])?.[1];
    if (name && !subs.has(name)) subs.set(name, m[0]);
  }
  // a subpage made once per look (a list's rows: name__light): with the one it was made from
  const copies = new Map<string, string[]>();
  for (const name of subs.keys()) {
    const at = name.indexOf('__');
    if (at > 0 && subs.has(name.slice(0, at))) (copies.get(name.slice(0, at)) ?? copies.set(name.slice(0, at), []).get(name.slice(0, at))!).push(name);
  }
  // a file scripts name, and the same in every look
  const fileLooks = new Map<string, string[]>();
  for (const m of looks?.files ?? []) for (const [from, to] of Object.entries(m)) (fileLooks.get(norm(from)) ?? fileLooks.set(norm(from), []).get(norm(from))!).push(norm(to));
  const image = (name: string, into: Set<string>) => {
    into.add(name);
    fileLooks.get(name)?.forEach((f) => into.add(f));
  };
  const theme = (name: string, into: Set<string>) => themes.get(name)?.forEach((i) => image(i, into));
  /** what a page or subpage shows: the images it names, its themes', its subpages' (once each) - in every look */
  const shows = (text: string, seen: Set<string>, into: Set<string>) => {
    for (const m of text.matchAll(IMAGE_TEXT)) image(norm(m[1]), into);
    for (const m of text.matchAll(IMAGE_URL)) image(norm(m[1]), into);
    for (const m of text.matchAll(ATTR)) {
      const [, key, v] = m;
      theme(v, into);
      if (looks && key === 'tags') for (const tag of v.split(/[\s,]+/)) looks.tags[tag]?.forEach((t) => theme(t, into));
      if (looks && key === 'j') looks.images[`s${v}`]?.forEach((f) => image(norm(f), into));
      for (const name of [v, ...(copies.get(v) ?? [])]) {
        const sub = subs.get(name);
        if (sub !== undefined && !seen.has(name)) {
          seen.add(name);
          shows(sub, seen, into);
        }
      }
    }
    return into;
  };
  const pages: string[] = [];
  const pagesOf = new Map<string, string[]>();
  for (const m of xml.matchAll(/<page\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/page>/g)) {
    pages.push(m[1]);
    for (const img of shows(m[0], new Set(), new Set())) (pagesOf.get(img) ?? pagesOf.set(img, []).get(img)!).push(m[1]);
  }
  // shown by no page: with the subpage that names it (a list's rows, a popup a script puts on) - but for
  // the list of files only scripts name, which no one shows (themes.ts: so iViewer ships them)
  const subOf = new Map<string, string>();
  for (const [name, text] of subs) {
    if (name === 'iva_theme_images') continue;
    for (const img of shows(text, new Set([name]), new Set())) if (!subOf.has(img)) subOf.set(img, name);
  }
  const groups = new Map<string, string>();
  const named = new Set([...[...xml.matchAll(IMAGE_TEXT)].map((m) => norm(m[1])), ...[...xml.matchAll(IMAGE_URL)].map((m) => norm(m[1]))]);
  for (const img of named) {
    if (tiled.has(img)) continue;
    const on = pagesOf.get(img) ?? [];
    groups.set(img, on.length === 1 ? `page:${on[0]}` : on.length > 1 ? 'shared' : subOf.has(img) ? `sub:${subOf.get(img)}` : 'other');
  }
  return { groups, tiled, pages };
}

// ── packing ──

interface Placed {
  name: string;
  w: number;
  h: number;
  sheet: number;
  x: number;
  y: number;
  rgba: Buffer;
}

/** Shelves, tallest first, in sheets up to SHEET a side: where each image goes, and each sheet's size. */
function shelve(items: Omit<Placed, 'sheet' | 'x' | 'y'>[], first: number): { placed: Placed[]; sizes: [number, number][] } {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
  const placed: Placed[] = [];
  const sizes: [number, number][] = [];
  let sheet = -1;
  let x = 0;
  let shelfY = 0;
  let shelfH = 0;
  let width = 0;
  const close = () => {
    if (sheet >= 0) sizes.push([Math.ceil(width / 4) * 4, Math.ceil((shelfY + shelfH) / 4) * 4]);
  };
  const open = () => {
    close();
    sheet++;
    x = shelfY = shelfH = width = 0;
  };
  open();
  for (const it of sorted) {
    const W = it.w + 2 * PAD;
    const H = it.h + 2 * PAD;
    if (x + W > SHEET) {
      shelfY += shelfH;
      x = shelfH = 0;
    }
    if (shelfY + H > SHEET) open();
    placed.push({ ...it, sheet: first + sheet, x: x + PAD, y: shelfY + PAD });
    x += W;
    width = Math.max(width, x);
    shelfH = Math.max(shelfH, H);
  }
  close();
  return { placed, sizes };
}

/** The image into the sheet at (x, y), its edge pixels repeated PAD wide around it. */
function blit(sheet: Buffer, sw: number, p: Placed) {
  const row = p.w * 4;
  for (let dy = -PAD; dy < p.h + PAD; dy++) {
    const sy = Math.min(p.h - 1, Math.max(0, dy));
    const src = sy * row;
    const dst = ((p.y + dy) * sw + p.x) * 4;
    p.rgba.copy(sheet, dst, src, src + row);
    for (let k = 1; k <= PAD; k++) {
      p.rgba.copy(sheet, dst - k * 4, src, src + 4);
      p.rgba.copy(sheet, dst + row + (k - 1) * 4, src + row - 4, src + row);
    }
  }
}

/** RGBA pixels as a PNG: each row filtered "up" (flat UI art packs small), deflated by node's zlib. */
export function encodePng(rgba: Buffer, w: number, h: number): Buffer {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = y ? 2 : 0;
    const cur = y * stride;
    if (!y) rgba.copy(raw, o + 1, 0, stride);
    else for (let i = 0; i < stride; i++) raw[o + 1 + i] = (rgba[cur + i] - rgba[cur - stride + i]) & 255;
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** a build's atlas by what went into it: iva serve and iva dev rebuild the same images over and over */
const made = new Map<string, { map: AtlasMap; sheets: Buffer[] } | null>();

/**
 * The images packed: the map, and each sheet's PNG (map.sheets[i].file).
 * Null when there's nothing worth packing (fewer than two images).
 */
export function packAtlas(xml: string, images: AtlasInput[], scripts: string[] = []): { map: AtlasMap; sheets: Buffer[] } | null {
  const hash = createHash('sha1').update(xml);
  for (const s of scripts) hash.update(s);
  for (const im of images) hash.update(im.name).update(im.data);
  const key = hash.digest('hex');
  if (made.has(key)) return made.get(key)!;
  const { groups, pages } = atlasGroups(xml, scripts);
  // decoded, the ones that fit; by group
  const byGroup = new Map<string, Omit<Placed, 'sheet' | 'x' | 'y'>[]>();
  for (const im of images) {
    const group = groups.get(norm(im.name));
    if (!group || !/\.png$/i.test(im.name)) continue;
    let png: { width: number; height: number; data: Buffer };
    try {
      png = pngjs.PNG.sync.read(im.data);
    } catch {
      continue; // not one pngjs reads: a file of its own
    }
    if (png.width > MAX_SIDE || png.height > MAX_SIDE || !png.width || !png.height) continue;
    (byGroup.get(group) ?? byGroup.set(group, []).get(group)!).push({ name: im.name.replace(/\\/g, '/'), w: png.width, h: png.height, rgba: png.data });
  }
  const count = [...byGroup.values()].reduce((n, g) => n + g.length, 0);
  if (count < 2) {
    made.set(key, null);
    return null;
  }
  // shared first, then the pages in order, then the subpages' and the rest
  const order = [...byGroup.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  function rank(g: string) {
    if (g === 'shared') return -1;
    const p = g.startsWith('page:') ? pages.indexOf(g.slice(5)) : -1;
    return p >= 0 ? p : pages.length + (g === 'other' ? 1 : 0);
  }
  const map: AtlasMap = { version: 1, sheets: [], frames: {} };
  const sheets: Buffer[] = [];
  for (const group of order) {
    const { placed, sizes } = shelve(byGroup.get(group)!, map.sheets.length);
    const bufs = sizes.map(([w, h]) => Buffer.alloc(w * h * 4));
    const first = map.sheets.length;
    sizes.forEach(([w, h], i) => map.sheets.push({ file: `sheet-${first + i}.png`, w, h, group }));
    for (const p of placed) {
      const [w] = sizes[p.sheet - first];
      blit(bufs[p.sheet - first], w, p);
      map.frames[p.name] = [p.sheet, p.x, p.y, p.w, p.h];
    }
    sizes.forEach(([w, h], i) => sheets.push(encodePng(bufs[i], w, h)));
  }
  const out = { map, sheets };
  if (made.size > 8) made.clear();
  made.set(key, out);
  return out;
}

/**
 * A build's atlas as files beside its .gui ([path, data], paths under
 * ATLAS_DIR): its images read from where they are (drawn, or the project's).
 */
export function atlasFiles(xml: string, assets: { name: string; data?: Buffer; file?: string }[], scripts: string[] = []): [string, Buffer][] {
  const images = assets
    .filter((a) => /\.png$/i.test(a.name) && !/@2x\.png$/i.test(a.name))
    .map((a) => ({ name: a.name, data: a.data ?? (a.file && fs.existsSync(a.file) ? fs.readFileSync(a.file) : undefined) }))
    .filter((a): a is AtlasInput => !!a.data);
  const packed = packAtlas(xml, images, scripts);
  if (!packed) return [];
  return [
    [`${ATLAS_DIR}/atlas.json`, Buffer.from(JSON.stringify(packed.map))],
    ...packed.map.sheets.map((s, i): [string, Buffer] => [`${ATLAS_DIR}/${s.file}`, packed.sheets[i]]),
  ];
}

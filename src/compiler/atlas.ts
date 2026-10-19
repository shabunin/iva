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

import { ATLAS_DIR, MAX_SIDE, PAD, atlasGroups, groupOrder, norm, shelve } from './atlasPlan.js';

export { ATLAS_DIR, atlasGroups } from './atlasPlan.js';

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
  const order = groupOrder(byGroup.keys(), pages);
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

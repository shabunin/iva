/**
 * Sheets packed on the device, for a GUI that came without them (GUI
 * Designer's, iViewer's archive of an iva build): once, behind the GUI
 * running, from its files unpacked - the next start loads a page's handful
 * of sheets instead of its hundreds of images. The plan is iva build's
 * (src/compiler/atlasPlan.ts: grouped by the page that shows them, shelved),
 * the drawing a canvas', the PNG the browser's own.
 */
import { ATLAS_DIR, MAX_SIDE, PAD, atlasGroups, groupOrder, norm, shelve } from '../src/compiler/atlasPlan';
import type { Unpacked } from './store';

/**
 * A moment for the GUI (its frames, its touches) once this has worked ~10 ms:
 * a message to itself, which a page in the background isn't slowed down on
 * as it is on timers (one a second).
 */
let worked = performance.now();
const breathe = () => {
  if (performance.now() - worked < 10) return Promise.resolve();
  return new Promise<void>((r) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => {
      worked = performance.now();
      r();
    };
    ch.port2.postMessage(0);
  });
};

/**
 * The sheets of a GUI's images: their files (PNG Blobs, by their path beside
 * the .gui: iva-atlas/sheet-N.png) and each image's frame by its name in the
 * .gui - or none, when fewer than two images would go in one. `alive()`
 * false: it stops (another GUI shown).
 */
export async function packSheets(u: Unpacked, alive: () => boolean = () => true): Promise<{ files: Record<string, Blob>; atlas: NonNullable<Unpacked['atlas']> } | undefined> {
  const { groups, pages } = atlasGroups(u.guiXml, Object.values(u.scriptMap));
  // each image file once, under the name the .gui gives it in full (the first of its names)
  const byGroup = new Map<string, { name: string; path: string }[]>();
  const seen = new Set<string>();
  for (const [name, path] of Object.entries(u.images)) {
    if (path.startsWith('#') || seen.has(path) || !/\.png$/i.test(path) || !u.files[path]) continue;
    seen.add(path);
    const group = groups.get(norm(name));
    if (group) (byGroup.get(group) ?? byGroup.set(group, []).get(group)!).push({ name, path });
  }
  if ([...byGroup.values()].reduce((n, g) => n + g.length, 0) < 2) return undefined;
  const files: Record<string, Blob> = {};
  const sheetPaths: string[] = [];
  const frames: Record<string, [number, number, number, number, number]> = {};
  for (const group of groupOrder(byGroup.keys(), pages)) {
    // a group's images decoded (the ones that fit a sheet), shelved, drawn, let go - one group at a time
    const bitmaps: { name: string; w: number; h: number; bitmap: ImageBitmap }[] = [];
    for (const { name, path } of byGroup.get(group)!) {
      if (!alive()) return closeAll(bitmaps);
      await breathe();
      try {
        const bitmap = await createImageBitmap(u.files[path]);
        if (bitmap.width > MAX_SIDE || bitmap.height > MAX_SIDE) bitmap.close();
        else bitmaps.push({ name, w: bitmap.width, h: bitmap.height, bitmap });
      } catch {
        // not one the browser reads: a file of its own
      }
    }
    // none fits a sheet (every one larger, or unreadable): no sheet
    if (!bitmaps.length) continue;
    const first = sheetPaths.length;
    const { placed, sizes } = shelve(bitmaps, first);
    for (let i = 0; i < sizes.length; i++) {
      if (!alive()) return closeAll(bitmaps);
      const [w, h] = sizes[i];
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d')!;
      // its edge repeated around it, pixel for pixel
      ctx.imageSmoothingEnabled = false;
      for (const p of placed.filter((q) => q.sheet === first + i)) {
        drawPadded(ctx, p.bitmap, p.x, p.y, p.w, p.h);
        frames[p.name] = [p.sheet, p.x, p.y, p.w, p.h];
      }
      await breathe();
      const path = `${u.dir}${ATLAS_DIR}/sheet-${first + i}.png`;
      files[path] = await encodePng(ctx.getImageData(0, 0, w, h).data, w, h);
      sheetPaths.push(path);
    }
    closeAll(bitmaps);
  }
  return { files, atlas: { files: sheetPaths, frames } };
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (bytes: Uint8Array) => {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/**
 * RGBA pixels as a PNG: each row filtered "up", deflated by the browser's
 * own stream - several times faster than a canvas' PNG (whose encoder tries
 * harder: a 2048 x 2048 sheet, a second on a desktop) and smaller for flat UI
 * art. As iva build's (src/compiler/atlas.ts encodePng).
 */
async function encodePng(rgba: Uint8ClampedArray, w: number, h: number): Promise<Blob> {
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    const cur = y * stride;
    if (!y) {
      raw[o] = 0;
      raw.set(rgba.subarray(0, stride), o + 1);
    } else {
      raw[o] = 2;
      for (let i = 0; i < stride; i++) raw[o + 1 + i] = (rgba[cur + i] - rgba[cur - stride + i]) & 255;
    }
    if (y % 256 === 255) await breathe();
  }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))], { type: 'image/png' });
}

function closeAll(bitmaps: { bitmap: ImageBitmap }[]): undefined {
  for (const b of bitmaps) b.bitmap.close();
  return undefined;
}

/** An image at (x, y), and its edge PAD wide around it: each side's last row or column stretched, each corner's pixel. */
function drawPadded(ctx: OffscreenCanvasRenderingContext2D, b: ImageBitmap, x: number, y: number, w: number, h: number) {
  ctx.drawImage(b, x, y);
  ctx.drawImage(b, 0, 0, 1, h, x - PAD, y, PAD, h);
  ctx.drawImage(b, w - 1, 0, 1, h, x + w, y, PAD, h);
  ctx.drawImage(b, 0, 0, w, 1, x, y - PAD, w, PAD);
  ctx.drawImage(b, 0, h - 1, w, 1, x, y + h, w, PAD);
  ctx.drawImage(b, 0, 0, 1, 1, x - PAD, y - PAD, PAD, PAD);
  ctx.drawImage(b, w - 1, 0, 1, 1, x + w, y - PAD, PAD, PAD);
  ctx.drawImage(b, 0, h - 1, 1, 1, x - PAD, y + h, PAD, PAD);
  ctx.drawImage(b, w - 1, h - 1, 1, 1, x + w, y + h, PAD, PAD);
}

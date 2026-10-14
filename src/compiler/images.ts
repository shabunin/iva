/**
 * Images iva draws itself at build time (iViewer draws sliders and gauges
 * only from images): anti-aliased rounded rectangles and circles, as PNG.
 */

import { createHash } from 'node:crypto';
import zlib from 'node:zlib';

export type RGBA = [number, number, number, number];

const NAMED: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080',
  yellow: '#ffff00', orange: '#ffa500', transparent: '#00000000',
};

export function parseColor(input: string): RGBA {
  const c = (NAMED[input.trim().toLowerCase()] ?? input).trim();
  let m = /^#([0-9a-f]{3,4})$/i.exec(c);
  if (m) {
    const [r, g, b, a = 'f'] = m[1].split('');
    return [r, g, b, a].map((h) => parseInt(h + h, 16)) as RGBA;
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 255 : Math.round(Number(m[4]) * 255)];
  throw new Error(`can't read colour "${input}" (use #rgb, #rrggbb, #rrggbbaa or rgba())`);
}

/** Coverage of a pixel (0..1) by a shape, 4x4 supersampled. */
function raster(w: number, h: number, inside: (x: number, y: number) => boolean, color: RGBA): Buffer {
  const rows: Buffer[] = [];
  const S = 4;
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 4); // filter byte 0 + RGBA
    for (let x = 0; x < w; x++) {
      let hits = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) if (inside(x + (sx + 0.5) / S, y + (sy + 0.5) / S)) hits++;
      const o = 1 + x * 4;
      row[o] = color[0];
      row[o + 1] = color[1];
      row[o + 2] = color[2];
      row[o + 3] = Math.round((color[3] * hits) / (S * S));
    }
    rows.push(row);
  }
  return png(w, h, Buffer.concat(rows));
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, raw: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function roundedRect(w: number, h: number, radius: number, color: string): Buffer {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const inside = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, r), w - r);
    const cy = Math.min(Math.max(y, r), h - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  };
  return raster(Math.round(w), Math.round(h), inside, parseColor(color));
}

export function circle(d: number, color: string): Buffer {
  const r = d / 2;
  return raster(Math.round(d), Math.round(d), (x, y) => (x - r) ** 2 + (y - r) ** 2 <= r * r, parseColor(color));
}

/** A stable file name for generated image data. */
export const generatedName = (kind: string, data: Buffer) => `iva_${kind}_${createHash('sha1').update(data).digest('hex').slice(0, 8)}.png`;

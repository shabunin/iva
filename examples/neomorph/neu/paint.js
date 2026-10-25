// @ts-nocheck - runs in Node while iva evaluates the project (the editor's types have no node:*).
/**
 * The neumorphic painter. iViewer draws no shadows and no gradients, so every
 * soft shape here is a PNG drawn at build time, at the element's exact size
 * (iViewer's 9-slice only stretches sideways, which breaks rounded corners).
 *
 * A drawing is layers, each a shape (a rounded rect, or an arc of a ring)
 * with a fill (a colour or a linear gradient), outer shadows and inset
 * shadows, as CSS box-shadow has them: { x, y, blur, spread, color }.
 * Blurred rounded rects are Evan Wallace's closed form (a Gaussian
 * integrated across the box), so corners soften as a browser draws them.
 *
 * A drawing is one PNG, as sharp as the build's screen needs: twice its size
 * on a tablet (a retina one shows every pixel), three times on a phone laid
 * out at a third (`'1400x1400@3x'`) - as iva draws its own. The files go to
 * .neu/, outside assets/ (whose every file ships with every size): a build
 * ships the drawings it uses, nothing else. Named after what they hold, so a
 * rebuild draws only what is new; `iva build` and `iva check` delete the ones
 * no longer used.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { screen } from 'iva';

const VERSION = 4;
const DITHER = false;

// ── where the files go: the project's .neu ───────────────────────────

function projectDir() {
  // this file's own place: iva runs the project's bundle with its source map, so a stack names the source
  // (<project>/neu/paint.js) - whatever folder iva runs in, a test's included
  const frame = /((?:file:\/\/)?(?:[A-Za-z]:)?[^\s():]*[\\/]neu[\\/]paint\.js):\d+:\d+/.exec(new Error().stack ?? '');
  if (frame) return path.resolve(path.dirname(frame[1].replace(/^file:\/\//, '')), '..');
  // else: iva build / dev / serve / check [entry]: the entry's folder, else the folder iva runs in (app.jsx)
  const entry = process.argv.slice(2).find((a) => /\.(jsx|tsx)$/.test(a) && fs.existsSync(a));
  return entry ? path.dirname(path.resolve(entry)) : process.cwd();
}
const OUT = path.join(projectDir(), '.neu');
/** how many pixels a drawing has per pixel of the layout: the screen's scale, at least 2 */
const sharpness = () => Math.max(2, screen().scale ?? 1);

// ── colours ──────────────────────────────────────────────────────────

/** '#rgb' | '#rrggbb' | '#rrggbbaa' | 'rgba(r, g, b, a)' -> [r, g, b, a], each 0..1 */
export function rgba(c) {
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16) / 255).concat(1);
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) {
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, m[2] ? parseInt(m[2], 16) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c);
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : Number(m[4])];
  throw new Error(`neu: can't read colour "${c}"`);
}

/** a colour lighter (amount > 0) or darker (< 0), 0..1 of the way to white / black: '#rrggbb' */
export function shade(c, amount) {
  const [r, g, b] = rgba(c);
  const f = (v) => Math.round(255 * (amount >= 0 ? v + (1 - v) * amount : v * (1 + amount)));
  return '#' + [r, g, b].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}

/** a colour with an alpha: 'rgba()' */
export function alpha(c, a) {
  const [r, g, b] = rgba(c);
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

// ── shapes: a signed distance (negative inside) and a blurred coverage ─

function erf(x) {
  // Abramowitz & Stegun 7.1.26: |error| < 1.5e-7
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function rectShape({ x, y, w, h, r = 0 }, grow = 0) {
  const hx = Math.max(0.01, w / 2 + grow), hy = Math.max(0.01, h / 2 + grow);
  const cx = x + w / 2, cy = y + h / 2;
  const rr = clamp(r + grow, 0, Math.min(hx, hy));
  return {
    box: [cx - hx, cy - hy, cx + hx, cy + hy],
    sdf(px, py) {
      const qx = Math.abs(px - cx) - hx + rr, qy = Math.abs(py - cy) - hy + rr;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    },
    // Evan Wallace, "Fast rounded rectangle shadows": exact along x, sampled along y
    blur(px, py, sigma) {
      px -= cx;
      py -= cy;
      const low = py - hy, high = py + hy;
      const start = clamp(-3 * sigma, low, high), end = clamp(3 * sigma, low, high);
      const n = 8, step = (end - start) / n;
      const k = Math.SQRT1_2 / sigma, g = 1 / (Math.sqrt(2 * Math.PI) * sigma);
      let v = 0;
      for (let i = 0, yy = start + step / 2; i < n; i++, yy += step) {
        const ry = py - yy;
        const delta = Math.min(hy - rr - Math.abs(ry), 0);
        const curved = hx - rr + Math.sqrt(Math.max(0, rr * rr - delta * delta));
        v += 0.5 * (erf((px + curved) * k) - erf((px - curved) * k)) * g * Math.exp(-(yy * yy) / (2 * sigma * sigma)) * step;
      }
      return v;
    },
  };
}

/** an arc of a ring with round ends: angles in degrees clockwise from 12 o'clock */
function arcShape({ cx, cy, radius, thickness, from = 0, to = 360 }, grow = 0) {
  const half = thickness / 2 + grow;
  const full = to - from >= 360;
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const ends = [rad(from), rad(to)].map((a) => [cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  const sdf = (px, py) => {
    const dx = px - cx, dy = py - cy;
    if (!full) {
      let a = (Math.atan2(dx, -dy) * 180) / Math.PI; // clockwise from 12
      a = ((((a - from) % 360) + 360) % 360) + from;
      if (a > to) return Math.min(Math.hypot(px - ends[0][0], py - ends[0][1]), Math.hypot(px - ends[1][0], py - ends[1][1])) - half;
    }
    return Math.abs(Math.hypot(dx, dy) - radius) - half;
  };
  const o = radius + half;
  // a blur by distance: Gaussian across the edge (close enough for a stroke)
  return { box: [cx - o, cy - o, cx + o, cy + o], sdf, blur: (px, py, sigma) => 0.5 * (1 - erf(sdf(px, py) / (sigma * Math.SQRT2))) };
}

const shapeOf = (s, grow = 0) => (s.radius !== undefined ? arcShape(s, grow) : rectShape(s, grow));

// ── painting ─────────────────────────────────────────────────────────

function render(spec, scale) {
  const W = Math.round(spec.w * scale), H = Math.round(spec.h * scale);
  const px = new Float32Array(W * H * 4); // premultiplied
  const over = (i, r, g, b, a) => {
    if (a <= 0) return;
    const k = 1 - a;
    px[i] = r * a + px[i] * k;
    px[i + 1] = g * a + px[i + 1] * k;
    px[i + 2] = b * a + px[i + 2] * k;
    px[i + 3] = a + px[i + 3] * k;
  };
  for (const layer of spec.layers) {
    const shape = shapeOf(layer.shape);
    const outer = (layer.outer ?? []).map((s) => ({ ...s, c: rgba(s.color), sigma: Math.max(0.3, (s.blur ?? 0) / 2), sh: shapeOf(layer.shape, s.spread ?? 0) }));
    const inner = (layer.inner ?? []).map((s) => ({ ...s, c: rgba(s.color), sigma: Math.max(0.3, (s.blur ?? 0) / 2), sh: shapeOf(layer.shape, -(s.spread ?? 0)) }));
    const reach = (list) => Math.max(0, ...list.map((s) => Math.hypot(s.x ?? 0, s.y ?? 0) + 3 * s.sigma + Math.abs(s.spread ?? 0)));
    const out = reach(outer), inn = reach(inner);
    const fill = layer.fill === undefined ? null : typeof layer.fill === 'string' ? { solid: rgba(layer.fill) } : gradient(layer.fill, layer.shape);
    const [x0, y0, x1, y1] = shape.box;
    const i0 = clamp(Math.floor((x0 - out - 1) * scale), 0, W), i1 = clamp(Math.ceil((x1 + out + 1) * scale), 0, W);
    const j0 = clamp(Math.floor((y0 - out - 1) * scale), 0, H), j1 = clamp(Math.ceil((y1 + out + 1) * scale), 0, H);
    for (let j = j0; j < j1; j++) {
      const y = (j + 0.5) / scale;
      for (let i = i0; i < i1; i++) {
        const x = (i + 0.5) / scale;
        const p = (j * W + i) * 4;
        const d = shape.sdf(x, y);
        const cover = clamp(0.5 - d * scale, 0, 1);
        // outer shadows: only outside the shape (CSS clips them to it)
        if (cover < 1 && d < out) {
          for (const s of outer) {
            const a = s.c[3] * s.sh.blur(x - (s.x ?? 0), y - (s.y ?? 0), s.sigma) * (1 - cover);
            over(p, s.c[0], s.c[1], s.c[2], a);
          }
        }
        if (cover <= 0) continue;
        if (fill) {
          const c = fill.solid ?? fill.at(x, y);
          over(p, c[0], c[1], c[2], c[3] * cover);
        }
        // inset shadows: the outside of the shape, moved and blurred, seen through it
        if (d > -inn) {
          for (const s of inner) {
            const a = s.c[3] * (1 - s.sh.blur(x - (s.x ?? 0), y - (s.y ?? 0), s.sigma)) * cover;
            over(p, s.c[0], s.c[1], s.c[2], a);
          }
        }
      }
    }
  }
  return encodePng(W, H, px);
}

/** a linear gradient as CSS: { from, to, angle } (degrees, 0 = upwards, 135 = to the bottom right), across the shape (or `box`: a gradient that goes on in another drawing) */
function gradient({ from, to, angle = 135, box: across }, sh) {
  const a = rgba(from), b = rgba(to);
  const box = across ?? (sh.radius !== undefined ? { x: sh.cx - sh.radius, y: sh.cy - sh.radius, w: 2 * sh.radius, h: 2 * sh.radius } : sh);
  const t = (angle * Math.PI) / 180;
  const dx = Math.sin(t), dy = -Math.cos(t);
  const len = Math.abs(box.w * dx) + Math.abs(box.h * dy) || 1;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  return {
    at(x, y) {
      const f = clamp(((x - cx) * dx + (y - cy) * dy) / len + 0.5, 0, 1);
      return [0, 1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * f);
    },
  };
}

// ── PNG ──────────────────────────────────────────────────────────────

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function encodePng(W, H, px) {
  // un-premultiply to 8 bits; a pixel-hash dither of half a step keeps soft gradients from banding
  const rgba8 = Buffer.alloc(W * H * 4);
  for (let p = 0, q = 0; p < px.length; p += 4, q++) {
    const a = px[p + 3];
    if (a <= 0.0005) continue;
    const n = DITHER ? ((((q * 2654435761) >>> 0) % 1024) / 1024 - 0.5) * 0.9 : 0;
    for (let k = 0; k < 3; k++) rgba8[p + k] = clamp(Math.round((px[p + k] / a) * 255 + n), 0, 255);
    rgba8[p + 3] = clamp(Math.round(a * 255 + n), 0, 255);
  }
  // each row with the filter that leaves the least to compress (none / sub / up)
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H);
  const row = Buffer.alloc(stride);
  for (let j = 0; j < H; j++) {
    const cur = j * stride, prev = cur - stride;
    let best = 0, bestSum = Infinity;
    for (const f of [0, 1, 2]) {
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const v = rgba8[cur + i];
        const left = i >= 4 ? rgba8[cur + i - 4] : 0;
        const up = j > 0 ? rgba8[prev + i] : 0;
        const r = (f === 0 ? v : f === 1 ? v - left : v - up) & 255;
        sum += r < 128 ? r : 256 - r;
      }
      if (sum < bestSum) [best, bestSum] = [f, sum];
    }
    const o = j * (stride + 1);
    raw[o] = best;
    for (let i = 0; i < stride; i++) {
      const v = rgba8[cur + i];
      const left = i >= 4 ? rgba8[cur + i - 4] : 0;
      const up = j > 0 ? rgba8[prev + i] : 0;
      row[i] = (best === 0 ? v : best === 1 ? v - left : v - up) & 255;
    }
    row.copy(raw, o + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── files ────────────────────────────────────────────────────────────

const made = new Map();
/** the drawings this run used: every evaluation of it (each look, each size) - kept on globalThis, as each is a module of its own */
const used = (globalThis.__neuUsed ??= new Set());
// a build or a check, done well: the folder holds what it used, nothing else
if (!globalThis.__neuCleanup && ['build', 'check'].includes(process.argv[2])) {
  globalThis.__neuCleanup = true;
  process.on('exit', (code) => {
    if (code !== 0 || !used.size || !fs.existsSync(OUT)) return;
    for (const f of fs.readdirSync(OUT)) {
      if (/^neu-.*\.png$/.test(f) && !used.has(f)) fs.rmSync(path.join(OUT, f), { force: true });
    }
  });
}

/**
 * A drawing's file, drawn into .neu/ the first time it's asked for, as sharp
 * as the screen being built needs. The path is absolute; the .gui names it
 * by its file name, as iViewer finds images.
 *
 *   paint({ w: 140, h: 80, layers: [{ shape: { x: 20, y: 20, w: 100, h: 40, r: 20 }, fill: '#E4EBF5', outer: [...] }] }, 'btn')
 */
export function paint(spec, tag = 'neu') {
  const sc = sharpness();
  const key = JSON.stringify([VERSION, sc, spec]);
  const hit = made.get(key);
  if (hit) {
    used.add(path.basename(hit));
    return hit;
  }
  const id = crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);
  const name = `neu-${tag}-${Math.round(spec.w)}x${Math.round(spec.h)}-${id}`;
  const file = path.join(OUT, `${name}.png`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(OUT, { recursive: true });
    const tmp = path.join(OUT, `.${name}.${process.pid}.tmp`);
    fs.writeFileSync(tmp, render(spec, sc));
    fs.renameSync(tmp, file);
  }
  made.set(key, file);
  used.add(`${name}.png`);
  return file;
}

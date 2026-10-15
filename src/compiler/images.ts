/**
 * Images iva draws itself at build time. iViewer draws backgrounds, sliders
 * and gauges from images (it has no CSS border-radius, and no font files of
 * the project's own), so rounded boxes, slider parts and Font Awesome icons
 * become PNGs - each at 1x and 2x (`name@2x.png`, which iViewer picks on
 * retina screens).
 */

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import { suggest } from './suggest.js';
import { drawnName } from './components.js';

export type RGBA = [number, number, number, number];

const NAMED: Record<string, string> = {
  white: '#ffffff', black: '#000000', red: '#ff0000', green: '#008000', blue: '#0000ff', gray: '#808080', grey: '#808080',
  yellow: '#ffff00', orange: '#ffa500', silver: '#c0c0c0', transparent: '#00000000',
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

/** SVG paint attributes for a colour: fill="rgb()" fill-opacity="" */
function paint(attr: 'fill' | 'stroke', color: string): string {
  const [r, g, b, a] = parseColor(color);
  return `${attr}="rgb(${r},${g},${b})"${a < 255 ? ` ${attr}-opacity="${(a / 255).toFixed(3)}"` : ''}`;
}

/** Drawn images by their SVG and scale: a rebuild (iva dev, iva serve) redraws only what changed. */
const drawnCache = new Map<string, Buffer>();

/** Render SVG (in `w` x `h` units) to a PNG `scale` times that size. */
function render(svgBody: string, w: number, h: number, scale: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svgBody}</svg>`;
  const key = `${scale}|${svg}`;
  let png = drawnCache.get(key);
  if (!png) {
    // no system fonts: iva draws shapes and icon paths, never text (loading them is most of the time)
    png = Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(w * scale) }, font: { loadSystemFonts: false } }).render().asPng());
    if (drawnCache.size > 2000) drawnCache.clear();
    drawnCache.set(key, png);
  }
  return png;
}

export interface BoxStyle {
  w: number;
  h: number;
  radius?: number;
  fill?: string;
  borderWidth?: number;
  borderColor?: string;
}

function boxBody(st: BoxStyle): string {
  const bw = st.borderWidth && st.borderColor ? st.borderWidth : 0;
  const r = Math.max(0, Math.min(st.radius ?? 0, st.w / 2, st.h / 2));
  return [
    st.fill ? `<rect x="0" y="0" width="${st.w}" height="${st.h}" rx="${r}" ${paint('fill', st.fill)} />` : '',
    bw ? `<rect x="${bw / 2}" y="${bw / 2}" width="${st.w - bw}" height="${st.h - bw}" rx="${Math.max(0, r - bw / 2)}" fill="none" stroke-width="${bw}" ${paint('stroke', st.borderColor!)} />` : '',
  ].join('');
}

/** A box: rounded corners, a fill, a border inside its edge. */
export function box(st: BoxStyle, scale = 1): Buffer {
  return render(boxBody(st), st.w, st.h, scale);
}

export interface PlacedIcon {
  name: string;
  style?: IconStyle;
  color: string;
  size: number;
  x: number;
  y: number;
}

/** A box with an icon drawn on it: a button state's whole background (themes swap it in one go). */
export function boxIcon(st: BoxStyle, ic: PlacedIcon, scale = 1): Buffer {
  return render(boxBody(st) + iconBody(ic.name, ic.style, ic.color, ic.size, ic.x, ic.y), st.w, st.h, scale);
}

export function circle(d: number, color: string, scale = 1): Buffer {
  return render(`<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" ${paint('fill', color)} />`, d, d, scale);
}

// ── circular things: angles are degrees clockwise from 12 o'clock ──────

function polar(c: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
}
const n = (v: number) => Math.round(v * 100) / 100;

/** An arc of a ring, round-capped, in a size x size square. */
export function arc(size: number, thickness: number, from: number, to: number, color: string, scale = 1): Buffer {
  const c = size / 2;
  const r = c - thickness / 2 - 1;
  if (to - from < 0.01) return render('', size, size, scale);
  if (to - from >= 359.99) return render(`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thickness}" ${paint('stroke', color)} />`, size, size, scale);
  const [x1, y1] = polar(c, r, from);
  const [x2, y2] = polar(c, r, to);
  const d = `M ${n(x1)} ${n(y1)} A ${n(r)} ${n(r)} 0 ${to - from > 180 ? 1 : 0} 1 ${n(x2)} ${n(y2)}`;
  return render(`<path d="${d}" fill="none" stroke-width="${thickness}" stroke-linecap="round" ${paint('stroke', color)} />`, size, size, scale);
}

/** A dot on a ring (a dial's thumb): `ring` = its distance from the centre. */
export function dotOnRing(size: number, ring: number, at: number, diameter: number, color: string, scale = 1): Buffer {
  const [x, y] = polar(size / 2, ring, at);
  return render(`<circle cx="${n(x)}" cy="${n(y)}" r="${diameter / 2}" ${paint('fill', color)} />`, size, size, scale);
}

/** A knob: a disc and a pointer line towards `at`. */
export function knob(size: number, color: string, pointer: string, at: number, scale = 1): Buffer {
  const c = size / 2;
  const [x1, y1] = polar(c, c * 0.42, at);
  const [x2, y2] = polar(c, c * 0.8, at);
  return render(
    `<circle cx="${c}" cy="${c}" r="${c - 1}" ${paint('fill', color)} />` +
      `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke-width="${n(size * 0.045)}" stroke-linecap="round" ${paint('stroke', pointer)} />`,
    size, size, scale,
  );
}

/** Tick marks around a ring, from one angle to another. */
export function ticks(size: number, count: number, from: number, to: number, length: number, width: number, color: string, scale = 1): Buffer {
  const c = size / 2;
  const lines = Array.from({ length: count }, (_, i) => {
    const at = from + ((to - from) * i) / Math.max(1, count - 1);
    const [x1, y1] = polar(c, c - 2, at);
    const [x2, y2] = polar(c, c - 2 - length, at);
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke-width="${width}" stroke-linecap="round" ${paint('stroke', color)} />`;
  });
  return render(lines.join(''), size, size, scale);
}

/** RGB of a hue (degrees) at full saturation and value. */
function hueRgb(h: number): [number, number, number] {
  const f = (k: number) => {
    const x = (k + h / 60) % 6;
    return Math.round(255 * (1 - Math.max(0, Math.min(x, 4 - x, 1))));
  };
  return [f(5), f(3), f(1)];
}

/**
 * A colour wheel: hue round it (red at 12 o'clock, clockwise), from white in
 * the middle to full colour at the edge - HSV with value 1, so a point's
 * colour is hue = its angle, saturation = its distance from the middle.
 */
export function wheel(size: number, scale = 1): Buffer {
  const c = size / 2;
  const wedges: string[] = [];
  for (let i = 0; i < 120; i++) {
    // a little overlap: no seams between neighbours
    const [x1, y1] = polar(c, c, i * 3 - 0.6);
    const [x2, y2] = polar(c, c, i * 3 + 3.6);
    const [r, g, b] = hueRgb(i * 3 + 1.5);
    wedges.push(`<path d="M ${c} ${c} L ${n(x1)} ${n(y1)} A ${c} ${c} 0 0 1 ${n(x2)} ${n(y2)} Z" fill="rgb(${r},${g},${b})" />`);
  }
  return render(
    `<defs><clipPath id="o"><circle cx="${c}" cy="${c}" r="${c}" /></clipPath>` +
      `<radialGradient id="w" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" /><stop offset="1" stop-color="#fff" stop-opacity="0" /></radialGradient></defs>` +
      `<g clip-path="url(#o)">${wedges.join('')}</g><circle cx="${c}" cy="${c}" r="${c}" fill="url(#w)" />`,
    size, size, scale,
  );
}

/** A ring (a marker): `color`, `thickness` wide, edged in `outline`. */
export function ring(size: number, thickness: number, color: string, outline: string | undefined, scale = 1): Buffer {
  const c = size / 2;
  const r = c - thickness / 2 - 1.5;
  return render(
    (outline ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thickness + 2}" ${paint('stroke', outline)} />` : '') +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke-width="${thickness}" ${paint('stroke', color)} />`,
    size, size, scale,
  );
}

/** A frame with a rounded hole the size of the image: laid over a rectangle (a web view), it rounds its corners. */
export function cutout(w: number, h: number, radius: number, color: string, scale = 1): Buffer {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  const hole = `M ${r} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`;
  return render(`<path fill-rule="evenodd" d="M 0 0 H ${w} V ${h} H 0 Z ${hole}" ${paint('fill', color)} />`, w, h, scale);
}

// ── Font Awesome (free: solid, regular, brands) ─────────────────────

type IconDef = [number, number, unknown, unknown, string | string[]];
const require_ = createRequire(import.meta.url);
let ICONS: Record<string, Map<string, IconDef>> | null = null;

function icons() {
  if (ICONS) return ICONS;
  ICONS = {};
  for (const style of ['solid', 'regular', 'brands']) {
    const pack = require_(`@fortawesome/free-${style}-svg-icons`) as Record<string, { iconName?: string; icon?: IconDef }>;
    const map = new Map<string, IconDef>();
    for (const def of Object.values(pack)) {
      if (!def?.iconName || !def.icon) continue;
      map.set(def.iconName, def.icon);
      // old names still work ('home' for 'house', ...)
      for (const alias of (def.icon[2] as unknown[]) ?? []) if (typeof alias === 'string' && !map.has(alias)) map.set(alias, def.icon);
    }
    ICONS[style] = map;
  }
  return ICONS;
}

export type IconStyle = 'solid' | 'regular' | 'brands';

/** A Font Awesome icon's definition, by name ('lightbulb', 'brands:github'). */
export function iconDef(name: string, style?: IconStyle): { def: IconDef; style: IconStyle; name: string } {
  const m = /^(solid|regular|brands):(.+)$/.exec(name);
  const st = (m?.[1] as IconStyle | undefined) ?? style;
  const bare = (m?.[2] ?? name).replace(/^fa-/, '');
  const packs = icons();
  for (const s of st ? [st] : (['solid', 'regular', 'brands'] as IconStyle[])) {
    const def = packs[s].get(bare);
    if (def) return { def, style: s, name: bare };
  }
  const known = [...(st ? packs[st].keys() : [...packs.solid.keys(), ...packs.brands.keys()])];
  const hint = suggest(bare, known);
  throw new Error(`no Font Awesome ${st ? `${st} ` : ''}icon "${bare}"${hint ? ` (did you mean "${hint}"?)` : ''} - names: https://fontawesome.com/search?o=r&m=free`);
}

/** The icon's SVG, `size` px, its top left at (x, y). */
function iconBody(name: string, style: IconStyle | undefined, color: string, size: number, x: number, y: number): string {
  const { def } = iconDef(name, style);
  const [w, h, , , path] = def;
  const s = Math.max(w, h);
  const paths = (Array.isArray(path) ? path : [path]).map((d) => `<path d="${d}" ${paint('fill', color)} />`).join('');
  return `<g transform="translate(${x} ${y}) scale(${size / s}) translate(${(s - w) / 2} ${(s - h) / 2})">${paths}</g>`;
}

/** The icon, `size` px, centred in a boxW x boxH image (default: just the icon's square). */
export function icon(name: string, style: IconStyle | undefined, color: string, size: number, scale = 1, boxW = size, boxH = size): Buffer {
  return render(iconBody(name, style, color, size, (boxW - size) / 2, (boxH - size) / 2), boxW, boxH, scale);
}

/** A stable file name for generated image data. */
/** A drawing's file: in its kind's folder, named after its content (the same image once). */
export const generatedName = (kind: string, data: Buffer) => `${drawnName(kind, createHash('sha1').update(data).digest('hex').slice(0, 8))}.png`;

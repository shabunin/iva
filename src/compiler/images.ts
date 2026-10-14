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

/** A box: rounded corners, a fill, a border inside its edge. */
export function box(st: BoxStyle, scale = 1): Buffer {
  const bw = st.borderWidth && st.borderColor ? st.borderWidth : 0;
  const r = Math.max(0, Math.min(st.radius ?? 0, st.w / 2, st.h / 2));
  const body = [
    st.fill ? `<rect x="0" y="0" width="${st.w}" height="${st.h}" rx="${r}" ${paint('fill', st.fill)} />` : '',
    bw ? `<rect x="${bw / 2}" y="${bw / 2}" width="${st.w - bw}" height="${st.h - bw}" rx="${Math.max(0, r - bw / 2)}" fill="none" stroke-width="${bw}" ${paint('stroke', st.borderColor!)} />` : '',
  ].join('');
  return render(body, st.w, st.h, scale);
}

export function circle(d: number, color: string, scale = 1): Buffer {
  return render(`<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" ${paint('fill', color)} />`, d, d, scale);
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

/** The icon, `size` px, centred in a boxW x boxH image (default: just the icon's square). */
export function icon(name: string, style: IconStyle | undefined, color: string, size: number, scale = 1, boxW = size, boxH = size): Buffer {
  const { def } = iconDef(name, style);
  const [w, h, , , path] = def;
  const s = Math.max(w, h);
  const paths = (Array.isArray(path) ? path : [path]).map((d) => `<path d="${d}" ${paint('fill', color)} />`).join('');
  const body = `<g transform="translate(${(boxW - size) / 2} ${(boxH - size) / 2}) scale(${size / s}) translate(${(s - w) / 2} ${(s - h) / 2})">${paths}</g>`;
  return render(body, boxW, boxH, scale);
}

/** A stable file name for generated image data. */
export const generatedName = (kind: string, data: Buffer) => `iva_${kind}_${createHash('sha1').update(data).digest('hex').slice(0, 8)}.png`;

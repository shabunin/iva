/**
 * Atlases' plan: which of a GUI's images go in a sheet together (by the page
 * that shows them) and where each goes on its sheet - no Node, no browser:
 * iva build packs with it (atlas.ts, pngjs) and so does the iva panel, for a
 * GUI that came without sheets (panel/pack.ts, a canvas).
 */

/** the folder beside the .gui */
export const ATLAS_DIR = 'iva-atlas';
/** a sheet's largest side */
export const SHEET = 2048;
/** each image's own edge repeated around it, so scaled it doesn't pick up its neighbours' */
export const PAD = 2;
/** an image larger than this a side: a file of its own */
export const MAX_SIDE = 1024;

// ── which images go together ──

const IMAGE_TEXT = />\s*([^<>"]+?\.png)\s*</gi;
const IMAGE_URL = /url\(\s*['"]?([^'")]+?\.png)['"]?\s*\)/gi;
const ATTR = /\s([\w:-]+)="([^"]*)"/g;
export const norm = (name: string) => name.trim().replace(/\\/g, '/').toLowerCase();

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

/** Shelves, tallest first, in sheets up to SHEET a side: where each image goes, and each sheet's size. */
export function shelve<T extends { name: string; w: number; h: number }>(items: T[], first: number): { placed: (T & { sheet: number; x: number; y: number })[]; sizes: [number, number][] } {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
  const placed: (T & { sheet: number; x: number; y: number })[] = [];
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

/** the groups in the order their sheets go: shared first, then the pages in order, then the subpages' and the rest */
export function groupOrder(groups: Iterable<string>, pages: string[]): string[] {
  const rank = (g: string) => {
    if (g === 'shared') return -1;
    const p = g.startsWith('page:') ? pages.indexOf(g.slice(5)) : -1;
    return p >= 0 ? p : pages.length + (g === 'other' ? 1 : 0);
  };
  return [...groups].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

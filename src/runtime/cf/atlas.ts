/**
 * Atlases: a GUI's images packed into a few sheets per page - for the iva
 * panel, which loads a page's sheets (a handful of files) instead of its
 * images one by one (hundreds: a slow phone spends ~30 ms on each, whatever
 * its size).
 *
 * The panel makes them itself, from any GUI's archive (iva build's, GUI
 * Designer's): this says which images go together; the app's Rust side
 * (panel/src-tauri/src/atlas.rs) packs them at the GUI's first start and
 * writes the sheets and their map (AtlasMap: iva-atlas/atlas.json) beside
 * the .gui it unpacked, and the starts after that load the sheets.
 *
 * What goes in: the PNGs the .gui names, up to 1024 px a side (the packer
 * sees their sizes), but for those a theme tiles (background-repeat: repeat
 * - a tiled sprite repeats its whole texture). Grouped by the page that
 * shows them (its objects, its themes' every state, the subpages placed on
 * it and theirs); one shown by several pages goes in the shared sheets, one
 * no page shows (a subpage scripts put on) in its subpage's. Pure: the
 * panel's page runs it.
 */

/** the folder beside the .gui the sheets and their map are in */
export const ATLAS_DIR = 'iva-atlas';

/** iva-atlas/atlas.json */
export interface AtlasMap {
  version: 1;
  /** the sheets: their files in ATLAS_DIR, sizes, and what they hold ('shared', 'page:Home', 'sub:menu') */
  sheets: { file: string; w: number; h: number; group: string }[];
  /** each image by its name in the .gui (its path in the image folder, '/'): [sheet, x, y, w, h] */
  frames: Record<string, [number, number, number, number, number]>;
}

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

/**
 * The order groups' sheets go in: the shared ones first, then the pages' as
 * the .gui has them, then the subpages' and the rest.
 */
export function groupRank(group: string, pages: string[]): number {
  if (group === 'shared') return -1;
  const p = group.startsWith('page:') ? pages.indexOf(group.slice(5)) : -1;
  return p >= 0 ? p : pages.length + (group === 'other' ? 1 : 0);
}

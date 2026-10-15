/**
 * Runtime themes (<Project themes={['dark', 'light']}>): the project is built
 * once per look, and the looks are merged into the first one's .gui. At
 * runtime IvaTheme.set(name) switches with the CommandFusion API:
 *
 * - an object whose theme differs between the looks gets a tag (iva_t_...),
 *   and CF.setProperties({ join: tag, theme }) swaps the theme of every
 *   object carrying it (a button's drawn background and icon included);
 * - an image whose file differs (a drawn page background, a box, an icon)
 *   gets a serial join, and CF.setJoin(join, file) swaps it;
 * - a subpage only used as list rows is copied per look (name__look):
 *   IvaUI.fill() fills lists with the look's rows, and fills them again on
 *   a switch. Image names set from scripts (a dial's frames) go through
 *   IvaTheme.file().
 *
 * The looks must be the same elements: only themes and image files may
 * differ (and the names of subpages made for one look).
 */

import { createHash } from 'node:crypto';
import { CompileError, type Asset, type BuildResult, type ScriptOut } from './build.js';
import { el, type XNode } from './xml.js';

const short = (text: string) => createHash('sha1').update(text).digest('hex').slice(0, 8);
const attr = (n: XNode, k: string) => n.attrs.find(([a]) => a === k)?.[1];
const setAttr = (n: XNode, k: string, v: string) => {
  const at = n.attrs.find(([a]) => a === k);
  if (at) at[1] = v;
  else n.attrs.push([k, v]);
};
const describe = (n: XNode) => `<${n.tag}${attr(n, 'name') ? ` name="${attr(n, 'name')}"` : ''}${attr(n, 'x') !== undefined ? ` x="${attr(n, 'x')}" y="${attr(n, 'y')}"` : ''}>`;

/** Elements whose content is an image file. */
const IMAGES = new Set(['img', 'indicator']);
/** Attributes that may differ between looks (recorded, not an error). */
const MAY_DIFFER = new Set(['t', 'name']);
/** Join attributes: a new join must not clash with any of them. */
const JOIN_ATTRS = new Set(['j', 's', 'd', 'a', 'title', 'back', 'forward', 'refresh', 'stop', 'play', 'connectionStatus', 'disconnectionStatus']);

interface Diffs {
  /** per main element: its theme in each look */
  themes: Map<XNode, string[]>;
  /** per main img: its file in each look (placed: switched through a join) */
  images: Map<XNode, string[]>;
  /** main file -> file per look (for names a script sets) */
  files: Map<string, string>[];
  /** subpages used only as list rows that differ: main name -> copy per look */
  rows: Map<string, string>[];
  /** subpages only one look has (another look's own name for it) */
  extraDefs: XNode[];
  warnings: Set<string>;
}

export function mergeThemes(builds: BuildResult[], names: string[]): BuildResult & { themeScript: ScriptOut } {
  const [main] = builds;
  const gui = main.root;
  for (let v = 1; v < builds.length; v++) {
    if (JSON.stringify(builds[v].joins) !== JSON.stringify(main.joins)) {
      throw new CompileError(`<Project themes>: the "${names[v]}" look uses other named joins than "${names[0]}" - the looks must be the same elements`);
    }
  }

  // subpages placed somewhere (switched in place) vs only defined (list rows, image holders)
  const placed = new Set<string>();
  const visit = (n: XNode, top: boolean) => {
    if (!top && n.tag === 'subpage' && attr(n, 'x') !== undefined) placed.add(attr(n, 'name')!);
    for (const c of n.children) visit(c, false);
  };
  for (const c of gui.children) visit(c, c.tag === 'subpage');

  const d: Diffs = { themes: new Map(), images: new Map(), files: names.map(() => new Map()), rows: names.map(() => new Map()), extraDefs: [], warnings: new Set() };
  const record = <K>(m: Map<K, string[]>, key: K, v: number, mainValue: string, value: string) => {
    let all = m.get(key);
    if (!all) m.set(key, (all = names.map(() => mainValue)));
    all[v] = value;
  };

  for (let v = 1; v < builds.length; v++) {
    const other = builds[v].root;
    if (other.children.length !== gui.children.length) throw mismatch(names, v, gui, 'its sections');
    gui.children.forEach((a, i) => {
      const b = other.children[i];
      if (a.tag === 'themes' || a.tag === 'scripts') return;
      if (a.tag === 'subpage') {
        const name = attr(a, 'name')!;
        if (attr(b, 'name') !== name) {
          // a subpage only this look has (named after its look): ship it, map its files
          d.extraDefs.push(b);
          walk(a, b, v, false, true);
        } else if (!placed.has(name)) {
          // list rows / image holders: a copy per look if it differs
          const before = d.themes.size + d.images.size + d.files[v].size;
          walk(a, b, v, false, true);
          if (d.themes.size + d.images.size + d.files[v].size !== before || differs(a, b)) {
            const copy: XNode = { ...b, attrs: b.attrs.map(([k, val]) => [k, k === 'name' ? `${name}__${names[v]}` : val] as [string, string]) };
            d.rows[v].set(name, `${name}__${names[v]}`);
            d.extraDefs.push(copy);
          }
        } else walk(a, b, v, true, false);
      } else walk(a, b, v, true, false);
    });
  }

  /** Compare a (main) with b (look v): record what may differ, fail on the rest. */
  function walk(a: XNode, b: XNode, v: number, live: boolean, filesOnly: boolean) {
    if (a.tag !== b.tag || a.children.length !== b.children.length) throw mismatch(names, v, a);
    const keys = new Set([...a.attrs.map(([k]) => k), ...b.attrs.map(([k]) => k)]);
    for (const k of keys) {
      const va = attr(a, k) ?? '';
      const vb = attr(b, k) ?? '';
      if (va === vb) continue;
      if (!MAY_DIFFER.has(k)) throw mismatch(names, v, a, `${k}="${va}" / "${vb}"`);
      if (k === 't' && live && !filesOnly) {
        if (a.tag === 'landscape' || a.tag === 'portrait' || a.tag === 'subpage') {
          d.warnings.add(`${describe(a)}: a background from a theme can't be switched - give it a colour (bg), which iva draws`);
        } else record(d.themes, a, v, va, vb);
      }
    }
    if ((a.text ?? '') !== (b.text ?? '')) {
      if (IMAGES.has(a.tag) && a.text && b.text) {
        d.files[v].set(a.text, b.text);
        if (live && !filesOnly) {
          if ((attr(a, 'j') ?? '0') === '0' && a.tag === 'img') record(d.images, a, v, a.text, b.text);
          else if (a.tag === 'indicator') d.warnings.add(`${describe(a)}: a slider's thumb image can't be switched at runtime`);
        }
      } else if (live) d.warnings.add(`${describe(a)}: its text differs between the looks - only colours and images switch`);
    }
    a.children.forEach((c, i) => walk(c, b.children[i], v, live, filesOnly));
  }

  // ── tags, joins ──────────────────────────────────────────────────
  const tags: Record<string, string[]> = {};
  for (const [node, all] of d.themes) {
    const tag = `iva_t_${short(all.join('|'))}`;
    tags[tag] = all;
    const now = attr(node, 'tags');
    setAttr(node, 'tags', now ? `${now} ${tag}` : tag);
  }
  let next = maxJoin(gui, main.joins) + 1;
  const imageJoins: Record<string, string[]> = {};
  const joinOf = new Map<string, number>();
  for (const [node, all] of d.images) {
    const key = all.join('|');
    let j = joinOf.get(key);
    if (j === undefined) {
      joinOf.set(key, (j = next++));
      imageJoins[`s${j}`] = all;
    }
    setAttr(node, 'j', String(j));
  }

  // ── themes, subpages, assets ─────────────────────────────────────
  const themesNode = gui.children.find((c) => c.tag === 'themes');
  const haveTheme = new Set(themesNode?.children.map((t) => attr(t, 'name')));
  for (let v = 1; v < builds.length; v++) {
    for (const t of builds[v].root.children.find((c) => c.tag === 'themes')?.children ?? []) {
      if (!haveTheme.has(attr(t, 'name'))) {
        themesNode?.children.push(t);
        haveTheme.add(attr(t, 'name'));
      }
    }
  }
  // files only a script or a join names: in the .gui too, so iViewer ships them
  const named = new Set<string>();
  const collect = (n: XNode) => {
    if (IMAGES.has(n.tag) && n.text) named.add(n.text);
    n.children.forEach(collect);
  };
  collect(gui);
  d.extraDefs.forEach(collect);
  const shipped = [...new Set(Object.values(imageJoins).flat().concat(d.files.flatMap((m) => [...m.values()])))].filter((f) => !named.has(f));
  const defs = [...d.extraDefs];
  if (shipped.length) {
    defs.push(el('subpage', { name: 'iva_theme_images', w: 1, h: 1, clip: 1 }, shipped.map((f) => el('img', { x: 0, y: 0, w: 1, h: 1, j: 0, clickthrough: 1, refresh: 0, l: 0, noCache: 0, downloadIndicator: 0, clearOnURLChange: 0 }, [], f))));
  }
  const lastSub = gui.children.map((c) => c.tag).lastIndexOf('subpage');
  gui.children.splice(lastSub >= 0 ? lastSub + 1 : gui.children.length, 0, ...defs);

  const assets = new Map<string, Asset>();
  for (const b of builds) for (const a of b.assets) if (!assets.has(a.name.toLowerCase())) assets.set(a.name.toLowerCase(), a);

  // ── the panel's script ───────────────────────────────────────────
  const data = {
    names,
    tags,
    images: imageJoins,
    files: d.files.map((m) => Object.fromEntries(m)),
    rows: d.rows.map((m) => Object.fromEntries(m)),
  };
  const themeScript: ScriptOut = { name: 'iva-themes.js', code: themeRuntime(data) };
  const scripts = [...main.scripts];
  const at = scripts.findIndex((s) => s.name === 'iva-start.js');
  scripts.splice(at >= 0 ? at : scripts.length, 0, themeScript);
  const list = gui.children.find((c) => c.tag === 'scripts');
  if (list) {
    const i = list.children.findIndex((c) => attr(c, 'name') === 'iva-start.js');
    list.children.splice(i >= 0 ? i : list.children.length, 0, el('script', { name: 'iva-themes.js' }));
  }

  const warnings = [...new Set([...builds.flatMap((b) => b.warnings), ...d.warnings])];
  return { ...main, root: gui, assets: [...assets.values()], scripts, warnings, themeScript };
}

function differs(a: XNode, b: XNode): boolean {
  if (a.tag !== b.tag || a.text !== b.text || a.children.length !== b.children.length) return true;
  if (a.attrs.some(([k, v]) => k !== 'name' && attr(b, k) !== v)) return true;
  return a.children.some((c, i) => differs(c, b.children[i]));
}

function mismatch(names: string[], v: number, at: XNode, what = 'its elements') {
  return new CompileError(
    `<Project themes>: the "${names[v]}" look differs from "${names[0]}" at ${describe(at)} (${what}) - the looks must be the same elements; only colours (themes, drawn images) may differ`,
  );
}

/** The highest join number in use (any type), so a new one clashes with none. */
function maxJoin(gui: XNode, joins: Record<string, Record<string, number>>): number {
  let max = 0;
  const visit = (n: XNode) => {
    for (const [k, v] of n.attrs) if (JOIN_ATTRS.has(k) && /^\d+$/.test(v)) max = Math.max(max, Number(v));
    n.children.forEach(visit);
  };
  visit(gui);
  for (const byName of Object.values(joins)) for (const n of Object.values(byName)) max = Math.max(max, n);
  return max;
}

/** IvaTheme: the looks' tables and switching, with the CommandFusion API. */
function themeRuntime(data: object): string {
  return `// iva: runtime themes (<Project themes>). Generated by iva.
var IvaTheme = (function () {
  var D = ${JSON.stringify(data)};
  var current = D.names[0];
  var hooks = [];
  function index(name) { return D.names.indexOf(name); }
  var api = {
    /** the look shown */
    current: function () { return current; },
    names: function () { return D.names.slice(); },
    /** a file's name in the look shown (names a script sets: a dial's frames, list icons) */
    file: function (name) { var m = D.files[index(current)]; return (m && m[name]) || name; },
    /** a list row subpage's name in the look shown */
    row: function (name) { var m = D.rows[index(current)]; return (m && m[name]) || name; },
    /** run fn(name) after each switch */
    onChange: function (fn) { hooks.push(fn); },
    set: function (name) {
      var i = index(name);
      if (i < 0) { CF.log('IvaTheme: no look "' + name + '" (' + D.names.join(', ') + ')'); return; }
      var changes = [];
      for (var tag in D.tags) changes.push({ join: tag, theme: D.tags[tag][i] });
      if (changes.length) CF.setProperties(changes);
      for (var join in D.images) CF.setJoin(join, D.images[join][i]);
      current = name;
      CF.setToken(CF.GlobalTokensJoin, '[iva_theme]', name);
      if (typeof IvaUI !== 'undefined' && IvaUI.themeChanged) IvaUI.themeChanged(name);
      for (var k = 0; k < hooks.length; k++) {
        try { hooks[k](name); } catch (e) { CF.log('IvaTheme: ' + e); }
      }
    },
    /** the next look */
    toggle: function () { api.set(D.names[(index(current) + 1) % D.names.length]); }
  };
  // the look chosen last time (a persisted token), before the rest starts
  CF.modules.push({ name: 'iva-themes', setup: function () {
    CF.getJoin(CF.GlobalTokensJoin, function (j, v, tokens) {
      var saved = tokens && tokens['[iva_theme]'];
      if (saved && saved !== current && index(saved) >= 0) api.set(saved);
    });
  } });
  return api;
})();
`;
}

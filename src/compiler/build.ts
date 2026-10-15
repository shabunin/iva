/**
 * Element tree (what a project's JSX evaluates to) -> .gui XML tree.
 * Checks props, turns style props into themes, gives named joins numbers,
 * hoists subpages defined inline, and collects the files the .gui uses.
 */

import fs from 'node:fs';
import path from 'node:path';
import { DEVICES, parseSize, PROPS, REQUIRED, sizeFolder, sizeLabel, STYLE_PROPS, type ScreenSize, type StyleProps, type Transition } from './components.js';
import { fixedJoin, JoinAllocator, JoinSlot, typedJoin } from './joins.js';
import { isVNode, type Child, type Source, type VNode } from './runtime.js';
import { styleCss, Themes, type ThemeType } from './style.js';
import { didYouMean } from './suggest.js';
import { arc, box, boxIcon, circle, cutout, dotOnRing, generatedName, icon, knob, ring, ticks, wheel, type PlacedIcon } from './images.js';
import type { DrawRef, IconRef } from './components.js';

const isIcon = (v: unknown): v is IconRef => !!v && typeof v === 'object' && (v as IconRef).$$icon === 1;
const isDraw = (v: unknown): v is DrawRef => !!v && typeof v === 'object' && (v as DrawRef).$$draw === 1;

/** A DrawRef drawn. */
function drawImage(d: DrawRef, sc: number): Buffer {
  switch (d.kind) {
    case 'arc': return arc(d.size, d.thickness, d.from, d.to, d.color, sc);
    case 'dot': return dotOnRing(d.size, d.ring, d.at, d.diameter, d.color, sc);
    case 'knob': return knob(d.size, d.color, d.pointer, d.at, sc);
    case 'ticks': return ticks(d.size, d.count, d.from, d.to, d.length, d.width, d.color, sc);
    case 'box': return box({ w: d.w, h: d.h, radius: d.radius, fill: d.fill, borderWidth: d.borderWidth ?? 0, borderColor: d.borderColor }, sc);
    case 'wheel': return wheel(d.size, sc);
    case 'ring': return ring(d.size, d.thickness, d.color, d.outline, sc);
    case 'cutout': return cutout(d.w, d.h, d.radius, d.color, sc);
  }
}
import { el, parseXml, serialize, type XNode } from './xml.js';
import { bundleWebApp, HTTP_RUNTIME, resolveEntry } from './web.js';

/** The build's folders (<Project folders>, the default): images/ is iViewer's asset folder (<imagefolder>). */
export const IMAGES_DIR = 'images';
export const SCRIPTS_DIR = 'scripts';

export class CompileError extends Error {
  constructor(message: string, public source?: Source) {
    super(message);
  }
}

export interface Asset {
  /** the name the .gui uses (the file name) */
  name: string;
  /** a project file, copied as is */
  file?: string;
  /** or an image iva drew */
  data?: Buffer;
}

export interface ScriptOut {
  name: string;
  /** raw attributes for its <script> element */
  xml?: Record<string, string | number | null>;
  file?: string;
  code?: string;
}

export interface BuildResult {
  root: XNode;
  assets: Asset[];
  scripts: ScriptOut[];
  /** named joins -> numbers */
  joins: Record<string, Record<string, number>>;
  warnings: string[];
  /** the assets folder, if the project has one */
  assetDir: string | null;
  /** files read besides the sources (web apps' modules): to watch */
  inputs: string[];
  /** each web app's options and colour, by its name (a look's own, with <Project themes>) */
  apps: Record<string, { options: unknown; bg: string }>;
  /** where the build puts files next to the .gui: assets (iViewer's image folder), scripts; '' = beside it */
  layout: { images: string; scripts: string };
  /** the panel size it was built for (the main orientation's) */
  size: ScreenSize;
  /** the other sizes the project asks to be built for (<Project sizes>) */
  sizes: ScreenSize[];
}

/** The <Project>'s own panel size (its main orientation's), or why it has none. */
export function projectSize(p: Record<string, any>): ScreenSize | string {
  if (p.device !== undefined) {
    const size = (DEVICES as Record<string, readonly [number, number]>)[p.device];
    if (!size) return `device: no "${p.device}"${didYouMean(p.device, Object.keys(DEVICES))} (or give width and height)`;
    if (p.width !== undefined || p.height !== undefined) return 'device or width / height, not both';
    return p.orientation === 'portrait' ? { width: size[1], height: size[0] } : { width: size[0], height: size[1] };
  }
  if (p.orientation !== undefined) return 'orientation goes with device (with width / height, the larger one decides)';
  if (p.width === undefined || p.height === undefined) return `give device="iPad" (${Object.keys(DEVICES).join(', ')}) or width and height`;
  return { width: p.width, height: p.height };
}

type Attrs = Record<string, string | number | boolean | null | undefined | JoinSlot>;

const ITEMS = new Set(['Button', 'Text', 'Image', 'Slider', 'Gauge', 'List', 'Input', 'Web', 'WebApp', 'Video', 'Gesture', 'Subpage', 'SubpageRef', 'Box']);
/** items a <Group> moves */
const PLACED = new Set([...ITEMS].filter((t) => t !== 'Gesture'));
/** go anywhere: lifted to the project */
const HOISTED = new Set(['Script', 'OnStart']);
const FEEDBACK: Record<string, string> = { none: '0', momentary: '1', toggle: '2' };

/** Children flattened: arrays and fragments opened, false/null/undefined dropped. */
export function flat(children: Child[], out: (VNode | string)[] = []): (VNode | string)[] {
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === true) continue;
    if (Array.isArray(c)) flat(c, out);
    else if (typeof c === 'number') out.push(String(c));
    else out.push(c);
  }
  return out;
}

const tagsAttr = (t: unknown) => (t === undefined ? undefined : Array.isArray(t) ? t.join(' ') : String(t));
const bool = (v: unknown, dflt = false) => ((v ?? dflt) ? '1' : '0');
const hasStyle = (p: Record<string, unknown>) => STYLE_PROPS.some((k) => k !== 'theme' && p[k] !== undefined);
const pickStyle = (p: Record<string, any>): StyleProps =>
  Object.fromEntries(STYLE_PROPS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])) as StyleProps;

export class Builder {
  private themes = new Themes();
  private joins!: JoinAllocator;
  private assets = new Map<string, Asset>();
  private scripts: ScriptOut[] = [];
  private subpages = new Map<string, { node: XNode; source?: Source }>();
  private subpageUses: { name: string; source?: Source }[] = [];
  private pages: XNode[] = [];
  private systems: XNode[] = [];
  private macros: XNode[] = [];
  private tokens: XNode[] = [];
  private sounds: XNode[] = [];
  private warnings: string[] = [];
  private primary: 'landscape' | 'portrait' = 'landscape';
  /** <Project assets>: shipped whole; images found there by bare name */
  private assetDir: string | null = null;
  private trailing: XNode[] = [];
  /** <OnStart> code, in order */
  private start: string[] = [];
  /** placements marked topmost */
  private topmost = new Set<XNode>();
  /** web apps by name: their code (one app per name), port, and what gets the port once it's known */
  private apps = new Map<string, string>();
  /** the panel's web server (web apps, swatches): one system, one port; the web views on it, by path */
  private web: { system: XNode; views: { x: XNode; path: string }[] } | null = null;
  /** <Project httpPort> */
  private httpPort: number | undefined;
  private appOptions: Record<string, { options: unknown; bg: string }> = {};
  /** <Project folders>: images/ and scripts/ beside the .gui */
  private folders = true;
  private inputs = new Set<string>();

  /** the panel's size per orientation */
  private sizes: Record<'landscape' | 'portrait', [number, number]> = { landscape: [1024, 768], portrait: [768, 1024] };
  /** the size built (the main orientation's), and the other sizes <Project sizes> asks for */
  private size: ScreenSize = { width: 1024, height: 768 };
  private sizesAsked: ScreenSize[] = [];

  /**
   * themed: built as one look of several (<Project themes>). What CF.setProperties
   * can't swap at runtime (an object's theme it can) becomes something it can:
   * page and subpage colours are drawn images (swapped through a join), a
   * button's drawn icon is drawn into its state's background (its theme).
   */
  constructor(private baseDir: string, private opts: { themed?: boolean; start?: string; size?: ScreenSize } = {}) {}

  build(tree: Child): BuildResult {
    const top = flat([tree]).filter((c) => typeof c !== 'string' || c.trim());
    if (top.length !== 1 || typeof top[0] === 'string' || top[0].type !== 'Project') {
      throw new CompileError('the entry must `export default` one <Project>');
    }
    const project = top[0];
    this.check(project);
    const p = project.props;
    this.folders = p.folders !== false;
    if (p.httpPort !== undefined && (!Number.isInteger(p.httpPort) || p.httpPort < 1 || p.httpPort > 65535)) {
      throw this.err(project, 'httpPort: a number 1-65535');
    }
    this.httpPort = p.httpPort;
    this.joins = new JoinAllocator(p.joinBase ?? 1000);
    const own = projectSize(p);
    if (typeof own === 'string') throw this.err(project, own);
    this.sizesAsked = this.sizeList(project);
    // built at another size (iva build --size, <Project sizes>): its other orientation is that one turned
    const { width: w, height: h } = this.opts.size ?? own;
    this.size = this.opts.size ?? { width: w, height: h };
    this.primary = w >= h ? 'landscape' : 'portrait';
    const other = this.opts.size ? [h, w] : p.otherSize ?? [h, w];
    const land = this.primary === 'landscape' ? [w, h] : other;
    const port = this.primary === 'portrait' ? [w, h] : other;
    this.sizes = { landscape: [land[0], land[1]], portrait: [port[0], port[1]] };

    const assetDir = path.resolve(this.baseDir, p.assets ?? './assets');
    if (fs.existsSync(assetDir) && fs.statSync(assetDir).isDirectory()) {
      this.assetDir = assetDir;
      for (const f of fs.readdirSync(assetDir, { recursive: true }) as string[]) {
        const file = path.join(assetDir, f);
        if (fs.statSync(file).isFile() && !path.basename(f).startsWith('.')) this.addAsset(project, file);
      }
    } else if (p.assets !== undefined) {
      throw this.err(project, `assets: no folder ${p.assets}`);
    }
    // the image folder: where iViewer finds images, sounds and CF.loadAsset's files (the "assets folder")
    let properties: XNode[] = [el('autoposition'), el('imagefolder', {}, [], this.folders ? IMAGES_DIR : undefined), el('debug', { loaderrors: 0, connectionerrors: 0 })];
    if (p.properties !== undefined) {
      try {
        properties = parseXml(p.properties);
      } catch (e: any) {
        throw this.err(project, `properties: ${e.message}`);
      }
      // the build puts the files in images/: the .gui says so (folders={false} keeps yours)
      if (this.folders) {
        const folder = properties.find((x) => x.tag === 'imagefolder');
        if (folder) folder.text = IMAGES_DIR;
        else properties.push(el('imagefolder', {}, [], IMAGES_DIR));
      }
    }

    // the devices licensed to run it (<properties><devices>, as GUI Designer writes them)
    if (p.licenses !== undefined) {
      if (!p.licenses || typeof p.licenses !== 'object' || Array.isArray(p.licenses)) {
        throw this.err(project, "licenses: { 'a name': 'the device code' } (licenses={{ 'Kitchen iPad': '8437F51DCCD3F92EA6898A980ACA0259' }})");
      }
      let devices = properties.find((x) => x.tag === 'devices');
      if (!devices) properties.push((devices = el('devices', {}, [])));
      for (const [name, code] of Object.entries(p.licenses as Record<string, unknown>)) {
        if (typeof code !== 'string' || !/^[0-9a-f]{32}$/i.test(code.trim())) {
          throw this.err(project, `licenses: "${name}": ${JSON.stringify(code)} isn't a device code (32 hex digits, as iViewer shows it)`);
        }
        devices.children.push(el('device', { name }, [], code.trim().toUpperCase()));
      }
    }

    const children = this.elements(project);
    // themes first: elements refer to them by name
    for (const c of children) if (c.type === 'Theme') this.theme(c);
    for (const c of children) {
      switch (c.type) {
        case 'Theme': break;
        case 'Page': this.page(c); break;
        case 'Subpage': this.defineSubpage(c, false); break;
        case 'System': this.system(c); break;
        case 'HttpServer': this.httpServer(c); break;
        case 'Macro': this.macro(c); break;
        case 'Token': this.token(c); break;
        case 'Script': this.script(c); break;
        case 'Sound': this.sound(c); break;
        case 'Raw': this.trailing.push(this.raw(c)); break;
        case 'OnStart': this.onStart(c); break;
        default: throw this.err(c, `<${c.type}> can't be directly in <Project> (it takes Page, Subpage, System, HttpServer, Macro, Token, Script, Sound, Theme, Raw)`);
      }
    }
    if (!this.pages.length) throw new CompileError('the project has no <Page>');
    this.assignPorts();
    // the look the panel showed last (IvaTheme sets it): kept between runs
    if (this.opts.themed) this.tokens.push(this.E('token', { name: '[iva_theme]', value: this.opts.start ?? '', persist: 1 }));
    const starts = this.pages.filter((pg) => pg.attrs.some(([k, v]) => k === 'start' && v === '1'));
    if (starts.length > 1) throw new CompileError(`more than one start page: ${starts.map((s) => s.attrs[0][1]).join(', ')}`);
    for (const use of this.subpageUses) {
      if (!this.subpages.has(use.name)) {
        throw new CompileError(`no subpage "${use.name}"${didYouMean(use.name, this.subpages.keys())}`, use.source);
      }
    }
    if (this.start.length) {
      this.scripts.push({
        name: 'iva-start.js',
        // each piece on its own: one failing doesn't stop the rest
        code: `// Generated by iva: <OnStart> code, run once the panel has started.\nCF.modules.push({ name: 'iva-start', setup: function () {\n${this.start
          .map((c) => `  try { ${c} } catch (e) { CF.log('iva OnStart: ' + e); }`)
          .join('\n')}\n} });\n`,
      });
    }
    this.joins.allocate();
    const named = this.joins.map();
    if (Object.keys(named).length) {
      // scripts reach named joins as Joins.d.power -> "d1000"
      const byType: Record<string, Record<string, string>> = {};
      for (const [typeName, names] of Object.entries(named)) {
        const t = typeName[0];
        byType[t] = Object.fromEntries(Object.entries(names).map(([n, num]) => [n, `${t}${num}`]));
      }
      this.scripts.unshift({ name: 'iva-joins.js', code: `// Generated by iva: the project's named joins.\nvar Joins = ${JSON.stringify(byType, null, 2)};\n` });
    }

    const section = (tag: string, nodes: XNode[]) => (nodes.length ? [el(tag, {}, nodes)] : []);
    const root = el('gui', {}, [
      el('properties', {}, [
        el('project', {}, [], p.name),
        el('designer', {}, [], 'iva'),
        el('size', { autoposition: p.autoposition === null ? undefined : p.autoposition ?? 'scale' }, [
          el('portrait', { width: port[0], height: port[1] }),
          el('landscape', { width: land[0], height: land[1] }),
        ]),
        ...properties,
      ]),
      ...section('systems', this.systems),
      ...section('macros', this.macros),
      ...section('sounds', this.sounds),
      this.themes.toXml(),
      ...section('tokens', this.tokens),
      ...section('scripts', this.scripts.map((s) => this.withXml(el('script', { name: this.folders ? `${SCRIPTS_DIR}/${s.name}` : s.name }), { props: { xml: s.xml } } as unknown as VNode))),
      ...this.pages,
      ...[...this.subpages.values()].map((s) => s.node),
      ...this.trailing,
    ]);
    return {
      root, assets: [...this.assets.values()], scripts: this.scripts, joins: this.joins.map(), warnings: this.warnings, assetDir: this.assetDir,
      inputs: [...this.inputs], apps: this.appOptions, layout: this.folders ? { images: IMAGES_DIR, scripts: SCRIPTS_DIR } : { images: '', scripts: '' },
      size: this.size, sizes: this.sizesAsked,
    };
  }

  // ── checks & helpers ─────────────────────────────────────────────

  /** <Project sizes={['1400x1400']}>: the other sizes, checked. */
  private sizeList(project: VNode): ScreenSize[] {
    const list: unknown = project.props.sizes;
    if (list === undefined) return [];
    if (!Array.isArray(list)) throw this.err(project, "sizes: a list of 'WIDTHxHEIGHT' (sizes={['1400x1400']})");
    const own = projectSize(project.props) as ScreenSize;
    const seen = new Set([sizeFolder(own)]);
    return list.map((x) => {
      const size = parseSize(x);
      if (!size) throw this.err(project, `sizes: "${x}" isn't a size - 'WIDTHxHEIGHT' in pixels, like '1400x1400' (a phone's: '1400x1400@3x', 1 to 4)`);
      if (seen.has(sizeFolder(size))) throw this.err(project, `sizes: ${sizeLabel(size)} - a screen of that size is there twice (or is the project's own)`);
      seen.add(sizeFolder(size));
      return size;
    });
  }

  private err(node: VNode | undefined, msg: string) {
    return new CompileError(node ? `<${node.type}>: ${msg}` : msg, node?.source);
  }

  /** `xml={{...}}`: raw attributes over what iva wrote; null removes one. */
  private withXml(x: XNode, node: VNode): XNode {
    const extra = node.props.xml;
    if (extra === undefined) return x;
    if (typeof extra !== 'object' || extra === null || Array.isArray(extra)) throw this.err(node, 'xml: an object of attributes');
    for (const [k, v] of Object.entries(extra)) {
      const i = x.attrs.findIndex(([a]) => a === k);
      if (v === null || v === undefined) {
        if (i >= 0) x.attrs.splice(i, 1);
      } else if (i >= 0) x.attrs[i][1] = String(v);
      else x.attrs.push([k, String(v)]);
    }
    return x;
  }

  private raw(node: VNode): XNode {
    let nodes: XNode[];
    try {
      nodes = parseXml(node.props.xml);
    } catch (e: any) {
      throw this.err(node, e.message);
    }
    if (nodes.length !== 1) throw this.err(node, 'xml: exactly one element');
    return nodes[0];
  }

  private check(node: VNode) {
    const known = PROPS[node.type];
    if (!known) throw this.err(node, `unknown element${didYouMean(node.type, Object.keys(PROPS))}`);
    for (const k of Object.keys(node.props)) {
      if (k === 'key') continue;
      if (!known.includes(k)) throw this.err(node, `unknown prop "${k}"${didYouMean(k, known)}`);
    }
    for (const k of REQUIRED[node.type] ?? []) {
      if (node.props[k] === undefined) throw this.err(node, `"${k}" is required`);
    }
  }

  /** Element children, each checked; text is an error. */
  private elements(node: VNode): VNode[] {
    const out: VNode[] = [];
    for (const c of flat(node.children)) {
      if (typeof c === 'string') {
        if (c.trim()) throw this.err(node, `text "${c.trim().slice(0, 30)}" can't go here (put it in text="..." or a <Text>)`);
        continue;
      }
      if (!isVNode(c)) throw this.err(node, `child ${JSON.stringify(c)} isn't an element`);
      this.check(c);
      out.push(c);
    }
    return out;
  }

  /** Text children of an element that takes text (<Text>, <Command>, <Script>). */
  private text(node: VNode): string | undefined {
    const parts = flat(node.children);
    if (!parts.length) return undefined;
    if (parts.some((p) => typeof p !== 'string')) throw this.err(node, 'takes only text as children');
    return (parts as string[]).join('');
  }

  private E(tag: string, attrs: Attrs, children: XNode[] = [], text?: string, node?: VNode): XNode {
    const x = el(tag, {}, children, text);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null) continue;
      if (v instanceof JoinSlot) {
        const entry: [string, string] = [k, ''];
        x.attrs.push(entry);
        try {
          this.joins.use(v, (n) => (entry[1] = String(n)));
        } catch (e: any) {
          throw this.err(node, `${k}: ${e.message}`);
        }
      } else {
        x.attrs.push([k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)]);
      }
    }
    return x;
  }

  private join(node: VNode, prop: string, type: 'd' | 'a' | 's' | 'l'): JoinSlot | '0' {
    try {
      return fixedJoin(type, node.props[prop]) ?? '0';
    } catch (e: any) {
      throw this.err(node, `${prop}: ${e.message}`);
    }
  }

  private target(node: VNode, prop: string, value?: unknown): JoinSlot | string | undefined {
    const v = value !== undefined ? value : node.props[prop];
    if (v === undefined) return undefined;
    try {
      return typedJoin(v);
    } catch (e: any) {
      throw this.err(node, `${prop}: ${e.message}`);
    }
  }

  /** A target as an attribute value: 'd' + number (filled in once joins are numbered). */
  private targetAttr(x: XNode, key: string, t: JoinSlot | string | undefined) {
    if (t === undefined) return;
    if (typeof t === 'string') {
      x.attrs.push([key, t]);
      return;
    }
    const entry: [string, string] = [key, ''];
    x.attrs.push(entry);
    this.joins.use(t, (n) => (entry[1] = `${t.type}${n}`));
  }

  /** An image file: its .gui name (copied with the build); URLs stay as they are. */
  private image(node: VNode, src: string | IconRef | DrawRef): string {
    if (isDraw(src)) return this.generated(node, src.kind, (sc) => drawImage(src, sc), src.name);
    if (isIcon(src)) {
      // an icon as a whole image: centred in the element's box; one with a fixed file name
      // (shared: list rows, scripts) at its own size, whatever element names it
      const p = node.props;
      const [w, h] = src.file && src.size ? [src.size, src.size] : [p.w ?? src.size ?? 32, p.h ?? src.size ?? 32];
      return this.generated(node, 'fa', (sc) => icon(src.name, src.style, src.color ?? '#FFFFFF', src.size ?? Math.min(w, h), sc, w, h), src.file);
    }
    if (/^[a-z]+:\/\//i.test(src) || src === '') return src;
    if (this.assets.get(src.toLowerCase())?.data) return src; // drawn by iva
    let file = path.resolve(this.dirOf(node), src);
    if (!fs.existsSync(file) && this.assetDir && fs.existsSync(path.join(this.assetDir, path.basename(src)))) {
      file = path.join(this.assetDir, path.basename(src));
    }
    if (!fs.existsSync(file)) {
      this.warnings.push(`${this.where(node)}<${node.type}>: image not found: ${src}${this.assetDir ? '' : ' (no assets folder)'}`);
      return path.basename(src);
    }
    return this.addAsset(node, file);
  }

  /** A project file that ships with the build, under its file name. */
  private addAsset(node: VNode, file: string): string {
    const name = path.basename(file);
    const prev = this.assets.get(name.toLowerCase());
    if (prev && prev.file !== file && !(prev.data ?? fs.readFileSync(prev.file!)).equals(fs.readFileSync(file))) {
      throw this.err(node, `two different images are both named ${name} (${prev.file}, ${file}); iViewer finds images by name - rename one`);
    }
    if (!prev) this.assets.set(name.toLowerCase(), { name, file });
    return name;
  }

  /**
   * An image iva drew, at 1x and 2x (name@2x.png: iViewer's retina version),
   * named after its content. A build for a dense screen (size@3x, scaled up by
   * iViewer) draws the image itself that sharp, and no @2x one when it's at
   * least that.
   */
  private generated(node: VNode, kind: string, draw: (scale: number) => Buffer, fixedName?: string): string {
    const sc = this.opts.size?.scale ?? 1;
    let data: Buffer;
    let data2: Buffer | null;
    try {
      data = draw(sc);
      data2 = sc < 2 ? draw(2) : null;
    } catch (e: any) {
      throw this.err(node, e.message);
    }
    const name = fixedName ? `${fixedName.replace(/\.png$/i, '')}.png` : generatedName(kind, data);
    const name2 = name.replace(/\.png$/, '@2x.png');
    const prev = this.assets.get(name.toLowerCase());
    if (fixedName && prev && !(prev.data ?? Buffer.alloc(0)).equals(data)) throw this.err(node, `two different drawings named ${name}`);
    if (!prev) {
      this.assets.set(name.toLowerCase(), { name, data });
      if (data2) this.assets.set(name2.toLowerCase(), { name: name2, data: data2 });
    }
    return name;
  }

  /**
   * radius / border: iViewer has no border-radius, so iva draws the
   * background, at the element's size. (Not 9-sliced: GUI Designer stretches
   * only a border-image's left and right slices, into the padding - fine for
   * its own same-height images, wrong for corners; a plain background image
   * leaves the padding free for the text, beside an icon say.)
   */
  private drawn(node: VNode, type: ThemeType, st: StyleProps, size?: { w: number; h: number }, withIcon?: PlacedIcon): StyleProps {
    const border = st.borderWidth !== undefined && type !== 'input';
    if (withIcon && size) {
      // themed builds: the state's background with its icon (one image: a theme swaps both)
      if (border && st.borderColor === undefined) throw this.err(node, 'borderWidth needs borderColor');
      const name = this.generated(node, 'btn', (sc) =>
        boxIcon({ ...size, radius: st.radius, fill: st.bg, borderWidth: border ? st.borderWidth ?? 0 : 0, borderColor: st.borderColor }, withIcon, sc));
      return { ...st, bg: undefined, radius: undefined, borderWidth: undefined, borderColor: undefined, image: name };
    }
    if (st.radius === undefined && !border) return st;
    if (type !== 'button' && type !== 'background') {
      this.warner(node)('radius and borders are drawn on <Button> and <Subpage>; ignored here');
      return { ...st, radius: undefined };
    }
    if (st.image !== undefined) throw this.err(node, 'radius / borderWidth: iva draws the background, so not image too');
    if (border && st.borderColor === undefined) throw this.err(node, 'borderWidth needs borderColor');
    if (!size) throw this.err(node, `radius / borderWidth are drawn at the element's size: give them on the <${type === 'button' ? 'Button' : 'Subpage'}>, not a <Theme>`);
    const name = this.generated(node, type === 'button' ? 'btn' : 'bg', (sc) =>
      box({ ...size, radius: st.radius, fill: st.bg, borderWidth: st.borderWidth ?? 0, borderColor: st.borderColor }, sc));
    return { ...st, bg: undefined, radius: undefined, borderWidth: undefined, borderColor: undefined, image: name };
  }

  /** A slider's / gauge's theme: two states, track and fill, as images. */
  private meterTheme(node: VNode): string {
    const p = node.props;
    const styled = ['bg', 'image', 'fill', 'fillImage', 'radius'].some((k) => p[k] !== undefined);
    if (p.theme !== undefined) {
      if (styled) throw this.err(node, `use either theme="${p.theme}" or bg / image / fill props, not both`);
      return this.namedTheme(node, p.theme);
    }
    if (!styled) return '';
    if (p.bg !== undefined && p.image !== undefined) throw this.err(node, 'bg or image, not both');
    if (p.fill !== undefined && p.fillImage !== undefined) throw this.err(node, 'fill or fillImage, not both');
    const r = p.radius ?? Math.min(p.w, p.h) / 2;
    const part = (color: string | undefined, file: string | undefined, kind: string) =>
      file !== undefined ? this.image(node, file) : color !== undefined ? this.generated(node, kind, (sc) => box({ w: p.w, h: p.h, radius: r, fill: color }, sc)) : undefined;
    const off = part(p.bg, p.image, 'track');
    const on = part(p.fill, p.fillImage, 'fill');
    const css = (img: string | undefined) => (img ? `background-image: url(${img});` : '');
    return this.themes.generated('gauge', [css(off), css(on)]);
  }

  /** The element's theme: <Theme> by name, or one generated from its style props. */
  private styleTheme(node: VNode, type: ThemeType, opts: { always?: boolean; active?: StyleProps; extra?: StyleProps; icons?: (PlacedIcon | undefined)[] } = {}): string {
    const p = node.props;
    if (p.theme !== undefined) {
      if (hasStyle(p) || opts.active) throw this.err(node, `use either theme="${p.theme}" or style props, not both`);
      return this.namedTheme(node, p.theme);
    }
    if (!opts.always && !hasStyle(p) && !opts.active) return '';
    const base = { ...opts.extra, ...pickStyle(p) };
    const img = (src: string) => this.image(node, src);
    const warn = this.warner(node);
    const size = typeof p.w === 'number' && typeof p.h === 'number' ? { w: p.w, h: p.h } : undefined;
    const states = [styleCss(type, this.drawn(node, type, base, size, opts.icons?.[0]), img, warn)];
    if (type === 'button') states.push(styleCss(type, this.drawn(node, type, { ...base, ...(opts.active ?? {}) }, size, opts.icons?.[1]), img, warn));
    return this.themes.generated(type, states);
  }

  /** theme="Name": a <Theme> (theme="" = none). An unknown name is kept, with a warning. */
  private namedTheme(node: VNode, name: string): string {
    if (name !== '' && !this.themes.has(name)) {
      this.warnings.push(`${this.where(node)}<${node.type}>: no <Theme name="${name}">${didYouMean(name, this.themes.names())}`);
    }
    return name;
  }

  /** A warning about this element (once per message). */
  private warner(node: VNode) {
    return (msg: string) => {
      const text = `${this.where(node)}<${node.type}>: ${msg}`;
      if (!this.warnings.includes(text)) this.warnings.push(text);
    };
  }

  private where(node: VNode) {
    const s = node.source;
    return s ? `${path.relative(this.baseDir, path.resolve(this.baseDir, s.fileName))}:${s.lineNumber}: ` : '';
  }

  /** The folder of the file the element is written in (relative paths start there). */
  private dirOf(node: VNode) {
    return node.source?.fileName ? path.dirname(path.resolve(this.baseDir, node.source.fileName)) : this.baseDir;
  }

  // ── project level ────────────────────────────────────────────────

  private theme(node: VNode) {
    const p = node.props;
    if (p.states !== undefined) {
      if (hasStyle(p) || p.active) throw this.err(node, 'states (exact CSS) or style props, not both');
      if (!Array.isArray(p.states) || !p.states.length || p.states.some((c: unknown) => typeof c !== 'string')) throw this.err(node, 'states: an array of CSS strings');
      try {
        this.themes.define(p.name, p.type, p.states);
      } catch (e: any) {
        throw this.err(node, e.message);
      }
      return;
    }
    const img = (src: string) => this.image(node, src);
    const warn = this.warner(node);
    const base = pickStyle(p);
    const states = [styleCss(p.type, this.drawn(node, p.type, base), img, warn)];
    if (p.type === 'button' || p.type === 'gauge') states.push(styleCss(p.type, this.drawn(node, p.type, { ...base, ...(p.active ?? {}) }), img, warn));
    else if (p.active) throw this.err(node, 'only button and gauge themes have an active state (for a gauge: the fill)');
    try {
      this.themes.define(p.name, p.type, states);
    } catch (e: any) {
      throw this.err(node, e.message);
    }
  }

  /** <OnStart>: its code once (components repeat theirs), its joins numbered. */
  private onStart(node: VNode) {
    const code = String(node.props.js);
    if (!this.start.includes(code)) this.start.push(code);
    for (const j of node.props.joins ?? []) {
      const t = this.target(node, 'joins', j);
      if (t instanceof JoinSlot) this.joins.use(t, () => {});
    }
  }

  /** Items of a page / subpage: <Group>s opened (their x / y added), <Script> / <OnStart> lifted to the project. */
  /**
   * <Text bg> / a border: iViewer draws no background for text (GUI Designer
   * shows none either), so a drawn box goes behind the text instead.
   */
  private textBox(n: VNode): VNode[] {
    const p = n.props;
    const border = !!(p.borderWidth && p.borderColor);
    if (n.type !== 'Text' || p.theme !== undefined || (p.bg === undefined && !border)) return [n];
    const { bg, radius, borderWidth, borderColor, ...text } = p;
    const box: VNode = { $$iva: 1, type: 'Box', props: { x: p.x, y: p.y, w: p.w, h: p.h, bg, radius, borderWidth, borderColor }, children: [], source: n.source };
    return [box, { ...n, props: text }];
  }

  private items(nodes: VNode[], dx = 0, dy = 0, top = true): XNode[] {
    const out: XNode[] = [];
    for (const n of nodes.flatMap((x) => this.textBox(x))) {
      if (n.type === 'Script') this.script(n);
      else if (n.type === 'System') this.system(n);
      else if (n.type === 'HttpServer') this.httpServer(n);
      else if (n.type === 'OnStart') this.onStart(n);
      else if (n.type === 'Group') out.push(...this.items(this.elements(n), dx + (n.props.x ?? 0), dy + (n.props.y ?? 0), false));
      else if (n.type === 'Subpage' && n.props.define) this.defineSubpage(n, false);
      else if ((dx || dy) && PLACED.has(n.type) && !n.props.fixed) out.push(this.item({ ...n, props: { ...n.props, x: (n.props.x ?? 0) + dx, y: (n.props.y ?? 0) + dy } }));
      else out.push(this.item(n));
      if (n.props.topmost && out.length) this.topmost.add(out[out.length - 1]);
    }
    // topmost placements last: drawn above everything (iViewer's own `topmost`, and order for runtimes without it)
    return top ? [...out.filter((x) => !this.topmost.has(x)), ...out.filter((x) => this.topmost.has(x))] : out;
  }

  private page(node: VNode) {
    const p = node.props;
    if (this.pages.some((pg) => pg.attrs[0][1] === p.name)) throw this.err(node, `page "${p.name}" is defined twice`);
    const all = this.elements(node);
    this.items(all.filter((k) => HOISTED.has(k.type)));
    const kids = all.filter((k) => !HOISTED.has(k.type));
    const blocks = kids.filter((k) => k.type === 'Landscape' || k.type === 'Portrait');
    if (blocks.length && blocks.length !== kids.length) {
      throw this.err(node, 'put every item inside <Landscape> / <Portrait>, or none of them');
    }
    const orient = (tag: 'landscape' | 'portrait', holder: VNode | undefined, items: VNode[]) => {
      const drawnBg = holder && this.bgImage(holder, ...this.sizes[tag]);
      const t = holder && !drawnBg ? this.styleTheme(holder, 'background') : '';
      const x = this.E(tag, { t: t || undefined }, [...(drawnBg ? [drawnBg] : []), ...this.items(items)]);
      return holder && holder !== node ? this.withXml(x, holder) : x;
    };
    let orients: XNode[];
    if (blocks.length) {
      // exactly the orientations given, in the order given
      if (blocks.filter((b) => b.type === 'Landscape').length > 1 || blocks.filter((b) => b.type === 'Portrait').length > 1) {
        throw this.err(node, 'one <Landscape> and one <Portrait> at most');
      }
      const style = (b: VNode) => (hasStyle(b.props) || b.props.theme !== undefined ? b : hasStyle(p) || p.theme !== undefined ? node : b);
      orients = blocks.map((b) => orient(b.type === 'Landscape' ? 'landscape' : 'portrait', style(b), this.elements(b)));
    } else {
      // GUI Designer writes both: the main one with the items, the other empty
      const main = orient(this.primary, hasStyle(p) || p.theme !== undefined ? node : undefined, kids);
      const empty = this.E(this.primary === 'landscape' ? 'portrait' : 'landscape', {});
      orients = this.primary === 'landscape' ? [empty, main] : [main, empty];
    }
    this.pages.push(this.withXml(this.E('page', {
      name: p.name, j: 0, tags: tagsAttr(p.tags), transition: '', subtype: '', time: 0, ease: '', start: p.start ? 1 : undefined,
    }, orients), node));
  }

  private defineSubpage(node: VNode, inline: boolean): string {
    const p = node.props;
    if (!inline) {
      const placed = ['x', 'y', 'join', 'visible', 'in', 'out', 'topmost', 'clickthrough', 'tags'].filter((k) => p[k] !== undefined);
      if (placed.length) throw this.err(node, `${placed.join(', ')}: a subpage defined in <Project> isn't placed anywhere (place it with <SubpageRef>, or define it inside a page)`);
    }
    const previous = this.subpages.get(p.name);
    // reserve the name first: an item inside may refer back to it
    if (!previous) this.subpages.set(p.name, { node: el('subpage'), source: node.source });
    const drawnBg = this.bgImage(node, p.w, p.h);
    const t = drawnBg ? '' : this.styleTheme(node, 'background');
    const items = [...(drawnBg ? [drawnBg] : []), ...this.items(this.elements(node))];
    if (previous) {
      // the same subpage again (a component placed on several pages): fine; a different one isn't
      const again = this.E('subpage', { name: p.name, w: p.w, h: p.h, t: t || undefined, clip: bool(p.clip, true) }, items);
      const same = serialize({ ...previous.node, attrs: previous.node.attrs.filter(([k]) => k !== 'xml') }) === serialize(again);
      if (!same || p.xml !== undefined) {
        throw new CompileError(`<Subpage>: "${p.name}" is defined twice, differently (place it again with <SubpageRef name="${p.name}">)`, node.source);
      }
      return p.name;
    }
    this.subpages.set(p.name, {
      node: inline
        ? this.E('subpage', { name: p.name, w: p.w, h: p.h, t: t || undefined, clip: bool(p.clip, true) }, items)
        : this.withXml(this.E('subpage', { name: p.name, w: p.w, h: p.h, t: t || undefined, clip: bool(p.clip, true) }, items), node),
      source: node.source,
    });
    return p.name;
  }

  /** Themed builds: a page's / subpage's colour background as a drawn image (first in it), not a theme. */
  private bgImage(node: VNode, w: number, h: number): XNode | null {
    const p = node.props;
    if (!this.opts.themed || p.bg === undefined || p.image !== undefined || p.theme !== undefined) return null;
    const name = this.generated(node, 'bg', (sc) =>
      box({ w, h, radius: p.radius, fill: p.bg, borderWidth: p.borderColor ? p.borderWidth ?? 0 : 0, borderColor: p.borderColor }, sc));
    return this.E('img', { x: 0, y: 0, w, h, j: 0, clickthrough: 1, refresh: 0, l: 0, noCache: 0, downloadIndicator: 0, clearOnURLChange: 0 }, [], name);
  }

  private system(node: VNode) {
    const p = node.props;
    const children = this.elements(node).map((c) => {
      if (c.type === 'Command') return this.command(c);
      if (c.type === 'Feedback') return this.feedback(c);
      if (c.type === 'Raw') return this.raw(c);
      throw this.err(c, '<System> takes <Command>, <Feedback> and <Raw>');
    });
    // defaults as GUI Designer gives a new system of the kind (its systems/*.json)
    const protocol = p.protocol ?? 'tcp';
    const udp = protocol === 'udp';
    const MODES: Record<string, number> = { transitory: 0, alwaysOn: 1, dialog: 2 };
    if (p.mode !== undefined && MODES[p.mode] === undefined) throw this.err(node, `mode: 'alwaysOn', 'transitory' or 'dialog'`);
    const hb = p.heartbeat;
    if (hb && hb.mode !== 'reply' && hb.mode !== 'initiate') throw this.err(node, `heartbeat.mode: 'reply' or 'initiate'`);
    const sys = this.withXml(this.E('system', {
      name: p.name, ip: p.host, port: p.port, origin: p.localPort ?? 0, protocol,
      alwayson: MODES[p.mode ?? 'alwaysOn'], idleTimeout: p.idleTimeout, dialogTimeout: p.dialogTimeout,
      offlinequeue: bool(p.offlineQueue, !udp), accept: bool(p.accept, udp), acceptBroadcasts: bool(p.acceptBroadcasts, udp),
      ssl: bool(p.ssl), maxconnections: p.maxConnections ?? 0,
      heartbeatRx: hb?.rx ?? '', heartbeatTx: hb?.tx ?? '', heartbeatMode: hb ? (hb.mode === 'reply' ? 0 : 1) : -1,
      eom: p.eom ?? '', connectionStatus: this.join(node, 'connectJoin', 'd'), disconnectionStatus: this.join(node, 'disconnectJoin', 'd'),
      startupCmd: p.startupCmd ?? '', startupMacro: p.startupMacro ?? '', textEncoding: p.textEncoding ?? '', js: p.sendHandler ?? '',
    }, children, undefined, node), node);
    // the same system from several places (a component that brings its own): once
    const same = this.systems.find((x) => x.attrs.find(([k]) => k === 'name')?.[1] === String(p.name));
    if (same) {
      if (serialize(same) === serialize(sys)) return;
      throw this.err(node, `two different systems named "${p.name}"`);
    }
    this.systems.push(sys);
  }

  // ── the panel's own HTTP servers ────────────────────────────────

  /** a server system: TCP, accepting connections, a feedback per request's head (what IvaHttp.serve watches) */
  private serverSystem(node: VNode, name: string, port: number): XNode {
    const feedback: VNode = { $$iva: 1, type: 'Feedback', props: { name: 'request', regex: '(?msi)^.*?\\r\\n\\r\\n' }, children: [], source: node.source };
    // no offline queue: an answer for a page gone must not reach the next one
    this.system({
      $$iva: 1, type: 'System', source: node.source, children: [feedback],
      props: { name, host: '0.0.0.0', port, localPort: port, protocol: 'tcp', accept: true, offlineQueue: false },
    });
    return this.systems.find((x) => x.attrs.find(([k]) => k === 'name')?.[1] === name)!;
  }

  private httpRuntime(node: VNode) {
    this.script({ $$iva: 1, type: 'Script', props: { name: 'iva-http.js', code: HTTP_RUNTIME }, children: [], source: node.source });
  }

  private httpServer(node: VNode) {
    const p = node.props;
    if (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535) throw this.err(node, `port: a number 1-65535`);
    this.serverSystem(node, p.name, p.port);
    this.httpRuntime(node);
    this.onStart({ $$iva: 1, type: 'OnStart', props: { js: `IvaHttp.serve(${JSON.stringify(p.name)}, ${p.handler});` }, children: [], source: node.source });
  }

  /** A join as JavaScript: "d12", or Joins.d["name"] for a named one (iva-joins.js). */
  private jsJoin(t: JoinSlot | string): string {
    if (typeof t === 'string') return JSON.stringify(t);
    if (typeof t.id === 'number') return JSON.stringify(`${t.type}${t.id}`);
    this.joins.use(t, () => {});
    return `Joins.${t.type}[${JSON.stringify(t.id)}]`;
  }

  /** The panel's web server (one port: web apps, the ColorPicker's swatch): its system and script, once. */
  private webServer(node: VNode) {
    if (this.web) return this.web;
    this.httpRuntime(node);
    this.web = { system: this.serverSystem(node, 'IvaWeb', 0), views: [] };
    return this.web;
  }

  /** A web view on the web server, `path` on it (http://127.0.0.1:<port>/<path>, once the port is known). */
  private webView(node: VNode, attrs: Attrs, path: string): XNode {
    const web = this.webServer(node);
    const view = this.E('web', { ...attrs, url: `http://127.0.0.1:0/${path}` });
    web.views.push({ x: view, path });
    return view;
  }

  /**
   * <WebApp>: the module bundled into apps/iva_app_<name>.js (a project
   * file), a web view on the panel's web server at /<name>/, and
   * IvaHttp.app() at start. The same app placed again (on another page)
   * shares it all.
   */
  private webApp(node: VNode, geom: Record<string, unknown>): XNode {
    const p = node.props;
    let file: string;
    try {
      file = resolveEntry(String(p.entry), this.dirOf(node));
    } catch (e: any) {
      throw this.err(node, e.message);
    }
    const name: string = p.name ?? path.basename(file).replace(/\.[^.]+$/, '');
    if (!/^[A-Za-z][\w-]*$/.test(name) || name === 'iva-color') throw this.err(node, `name: letters, digits, _ and - (got "${name}")`);
    let code: Buffer;
    try {
      const bundle = bundleWebApp(file);
      code = bundle.code;
      for (const f of bundle.inputs) this.inputs.add(f);
    } catch (e: any) {
      throw this.err(node, `entry ${p.entry}: ${e.message}`);
    }
    const asset = `apps/iva_app_${name}.js`;
    const joins = Object.entries((p.joins ?? {}) as Record<string, unknown>).map(([k, j]) => {
      const t = this.target(node, `joins.${k}`, j);
      return `${JSON.stringify(k)}: ${this.jsJoin(t!)}`;
    });
    for (const [k, v] of Object.entries((p.handlers ?? {}) as Record<string, unknown>)) {
      if (typeof v !== 'string') throw this.err(node, `handlers.${k}: a panel function's name`);
    }
    const options = p.options ?? {};
    const setup = `IvaHttp.app(${JSON.stringify(name)}, { asset: ${JSON.stringify(asset)}, joins: { ${joins.join(', ')} }, ` +
      `options: ${JSON.stringify(options)}, handlers: ${JSON.stringify(p.handlers ?? {})}, record: ${JSON.stringify(p.record ?? null)}, ` +
      `bg: ${JSON.stringify(p.bg ?? '#000000')}, title: ${JSON.stringify(p.title ?? name)} });`;
    const key = JSON.stringify([code.length, setup]);
    const known = this.apps.get(name);
    if (known !== undefined && known !== key) throw this.err(node, `two different web apps named "${name}" - give each its own name`);
    if (known === undefined) {
      const prev = this.assets.get(asset.toLowerCase());
      if (prev && !(prev.data ?? Buffer.alloc(0)).equals(code)) throw this.err(node, `${asset}: two different files of that name`);
      this.assets.set(asset.toLowerCase(), { name: asset, data: code });
      this.apps.set(name, key);
      this.appOptions[name] = { options, bg: p.bg ?? '#000000' };
      this.onStart({ $$iva: 1, type: 'OnStart', props: { js: setup }, children: [], source: node.source });
    }
    return this.webView(node, { ...geom, j: 0, title: 0, back: 0, forward: 0, refresh: 0, stop: 0, tags: tagsAttr(p.tags) }, `${name}/`);
  }

  /** A web view's URL: a page of the project (url="page.html", shipped from assets/) where the build puts it. */
  private webPage(url: string): string {
    if (!this.folders || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || !this.assets.has(url.toLowerCase())) return url;
    return `${IMAGES_DIR}/${url}`;
  }

  /**
   * The web server's port: <Project httpPort>, else the first free one from
   * 8900 (after every port a system names). Its views get their URLs; it
   * starts first.
   */
  private assignPorts() {
    if (!this.web) return;
    const taken = new Set<number>();
    for (const sys of this.systems) {
      if (sys === this.web.system) continue;
      for (const k of ['port', 'origin']) {
        const v = Number(sys.attrs.find(([a]) => a === k)?.[1]);
        if (v) taken.add(v);
      }
    }
    let port = this.httpPort ?? 8900;
    if (this.httpPort !== undefined && taken.has(port)) throw new CompileError(`<Project httpPort={${port}}>: a system uses that port already`);
    while (taken.has(port)) port++;
    for (const entry of this.web.system.attrs) if (entry[0] === 'port' || entry[0] === 'origin') entry[1] = String(port);
    for (const { x, path: at } of this.web.views) {
      for (const entry of x.attrs) if (entry[0] === 'url') entry[1] = `http://127.0.0.1:${port}/${at}`;
    }
    this.start.unshift(`IvaHttp.web("IvaWeb", ${port});`);
  }

  private command(node: VNode): XNode {
    const p = node.props;
    const body = this.text(node);
    if (body !== undefined && p.send !== undefined) throw this.err(node, 'give what it sends as send="..." or as children, not both');
    if ((p.target === undefined) !== (p.value === undefined)) throw this.err(node, 'target and value go together');
    const x = this.E('cmd', {
      name: p.name, js: p.js, jsSendsCommand: p.js !== undefined ? (p.jsSendsCommand ? 'True' : 'False') : undefined, folder: p.folder,
    }, [], p.send ?? body ?? '', node);
    this.targetAttr(x, 'target', this.target(node, 'target'));
    if (p.value !== undefined) x.attrs.push(['value', String(p.value)]);
    return this.withXml(x, node);
  }

  private feedback(node: VNode): XNode {
    const items = this.elements(node).map((c) => {
      const p = c.props;
      if (c.type === 'Capture') {
        const t = this.target(c, 'join');
        if (typeof t === 'string' && !p.type) throw this.err(c, `join: "${t}" isn't a join (d(5), 's12', 'a:level'); for something else, give its type too`);
        const x = this.E('group', { index: p.index ?? 1, name: p.name ?? '', datatype: p.type ?? (t as JoinSlot).type });
        // GUI Designer writes the target with its type letter (target="d1")
        this.targetAttr(x, 'target', t);
        for (const [k, attr] of [['onVal', 'onVal'], ['offVal', 'offVal'], ['unit', 'unit'], ['min', 'min'], ['max', 'max'], ['transform', 'transform']] as const) {
          if (p[k] !== undefined) x.attrs.push([attr, String(p[k])]);
        }
        if (p.setToken) x.attrs.push(['settoken', '1']);
        return this.withXml(x, c);
      }
      if (c.type === 'OnMatch') {
        const x = this.E('onmatch', {});
        this.targetAttr(x, 'target', this.target(c, 'target'));
        if (p.value !== undefined) x.attrs.push(['value', String(p.value)]);
        if (p.cmd !== undefined) x.attrs.push(['cmd', p.cmd]);
        if (p.token !== undefined) x.attrs.push(['token', p.token]);
        return this.withXml(x, c);
      }
      if (c.type === 'Raw') return this.raw(c);
      throw this.err(c, '<Feedback> takes <Capture>, <OnMatch> and <Raw>');
    });
    return this.withXml(this.E('fb', { name: node.props.name, regex: node.props.regex }, items), node);
  }

  private macro(node: VNode) {
    const steps = this.elements(node).map((c) => {
      if (c.type === 'Raw') return this.raw(c);
      if (c.type !== 'Step') throw this.err(c, '<Macro> takes <Step command="..." delay={ms}>');
      return this.withXml(this.E('command', { delay: c.props.delay ?? 0 }, [], c.props.command), c);
    });
    this.macros.push(this.withXml(this.E('macro', { name: node.props.name }, steps), node));
  }

  private token(node: VNode) {
    const p = node.props;
    const name = p.name.startsWith('[') ? p.name : `[${p.name}]`;
    this.tokens.push(this.withXml(this.E('token', { name, value: p.value ?? '', persist: p.persist ? 1 : undefined }), node));
  }

  private script(node: VNode) {
    const p = node.props;
    const code = p.code ?? this.text(node);
    if ((p.src === undefined) === (code === undefined)) throw this.err(node, 'give src="file.js" or the code, one of them');
    let out: ScriptOut;
    if (p.src !== undefined) {
      const from = this.dirOf(node);
      const file = path.resolve(from, p.src);
      if (!fs.existsSync(file)) throw this.err(node, `script not found: ${p.src}`);
      out = { name: p.name ?? path.basename(file), file };
    } else {
      if (!p.name) throw this.err(node, 'inline code needs a name (name="main.js")');
      out = { name: p.name, code };
    }
    const same = this.scripts.find((s) => s.name.toLowerCase() === out.name.toLowerCase());
    if (same) {
      // the same script from several places (a component's runtime, say): once
      if (same.file === out.file && same.code === out.code) return;
      throw this.err(node, `two different scripts named ${out.name}`);
    }
    if (p.xml !== undefined) out.xml = p.xml;
    this.scripts.push(out);
  }

  private sound(node: VNode) {
    const p = node.props;
    const from = this.dirOf(node);
    const file = path.resolve(from, p.src);
    if (!fs.existsSync(file)) throw this.err(node, `sound not found: ${p.src}`);
    // in the image folder's sounds/ (iViewer finds sounds where it finds images)
    const name = this.folders ? `sounds/${path.basename(file)}` : path.basename(file);
    this.assets.set(name.toLowerCase(), { name, file });
    this.sounds.push(this.withXml(this.E('sound', { name: p.name, j: this.join(node, 'join', 'd'), loop: bool(p.loop), releasestop: bool(p.releaseStop) }, [], name, node), node));
  }

  // ── items ────────────────────────────────────────────────────────

  private item(node: VNode): XNode {
    if (node.type === 'Raw') return this.raw(node);
    return this.withXml(this.itemXml(node), node);
  }

  private itemXml(node: VNode): XNode {
    if (!ITEMS.has(node.type)) throw this.err(node, `can't be inside a page or subpage`);
    const p = node.props;
    const geom = { x: p.x ?? 0, y: p.y ?? 0, w: p.w, h: p.h };
    switch (node.type) {
      case 'Button': return this.button(node, geom);
      case 'Text':
        return this.E('txt', {
          j: this.join(node, 'join', 's'), ...geom, t: this.styleTheme(node, 'text', { always: true }), wrap: p.wrap ? 'True' : 'False', l: 0, tags: tagsAttr(p.tags),
        }, [], String(p.text ?? this.text(node) ?? ''), node);
      case 'Image': {
        const gestures = this.elements(node).map((g) => {
          if (g.type === 'Raw') return this.raw(g);
          if (g.type !== 'Gesture') throw this.err(g, '<Image> takes only <Gesture>');
          return this.withXml(this.gesture(g), g);
        });
        return this.E('img', {
          ...geom, j: this.join(node, 'join', 's'), clickthrough: bool(p.clickthrough), refresh: p.refresh ?? 0, l: 0,
          noCache: bool(p.noCache), downloadIndicator: bool(p.downloadIndicator), clearOnURLChange: bool(p.clearOnURLChange), tags: tagsAttr(p.tags),
        }, gestures, p.src !== undefined ? this.image(node, p.src) : '', node);
      }
      case 'Slider': {
        if (p.thumb !== undefined && p.thumbColor !== undefined) throw this.err(node, 'thumb or thumbColor, not both');
        const drawn = p.thumbColor !== undefined
          ? this.generated(node, 'thumb', (sc) => circle(p.thumbSize ?? Math.min(p.w, p.h), p.thumbColor, sc))
          : undefined;
        const ind = (state: number, img: unknown) => {
          const ref = typeof img === 'string' ? { src: img } : (img as any);
          const x = this.E('indicator', {
            state, offsetX: ref?.offsetX ?? 0, offsetY: ref?.offsetY ?? 0, x: ref?.x ?? 0, y: ref?.y ?? 0, w: ref?.w ?? 0, h: ref?.h ?? 0, t: '',
          }, [], drawn ?? (ref ? this.image(node, ref.src) : ''));
          return ref?.xml ? this.withXml(x, { type: 'Slider', props: { xml: ref.xml }, children: [], $$iva: 1, source: node.source }) : x;
        };
        const thumbs = drawn || p.thumb !== undefined ? [ind(0, p.thumb), ind(1, p.activeThumb ?? p.thumb)] : [];
        return this.E('slider', {
          j: this.join(node, 'join', 'a'), d: this.join(node, 'pressJoin', 'd'), ...geom, min: p.min ?? 0, max: p.max ?? 65535, decimals: p.decimals ?? 0,
          unit: 'decimal', t: this.meterTheme(node), sim: p.feedback === 'none' ? 0 : 1, l: 0,
          dragCmd: p.dragCmd, pressCmd: p.pressCmd, releaseCmd: p.releaseCmd, invert: p.invert ? 1 : undefined, tags: tagsAttr(p.tags),
        }, thumbs, undefined, node);
      }
      case 'Gauge':
        return this.E('gauge', { j: this.join(node, 'join', 'a'), ...geom, t: this.meterTheme(node), l: 0, tags: tagsAttr(p.tags) }, [], undefined, node);
      case 'List': {
        const sub = (prop: string) => {
          const v = p[prop];
          if (v === undefined) return '';
          if (typeof v === 'string') {
            this.subpageUses.push({ name: v, source: node.source });
            return v;
          }
          if (isVNode(v) && v.type === 'Subpage') {
            this.check(v);
            return this.defineSubpage(v, false);
          }
          throw this.err(node, `${prop}: a subpage name or a <Subpage>`);
        };
        return this.E('list', {
          j: this.join(node, 'join', 'l'), ...geom, headerSub: sub('header'), titleSub: sub('title'), contentSub: sub('item'), footerSub: sub('footer'),
          orientation: p.orientation === 'horizontal' ? 'h' : 'v', l: 0, swipedelete: bool(p.swipeDelete), t: this.styleTheme(node, 'list') || undefined,
          scrollCmd: p.scrollCmd, scrollInterval: p.scrollInterval, listEndCmd: p.listEndCmd, listEndOffset: p.listEndOffset, tags: tagsAttr(p.tags),
        }, [], undefined, node);
      }
      case 'Input':
        return this.E('input', {
          j: 0, s: this.join(node, 'join', 's'), ...geom, pass: bool(p.password), autoFocus: bool(p.autoFocus), f: 0,
          t: this.styleTheme(node, 'input', { always: true }),
          command: p.cmd, macro: p.macro, changeCommand: p.changeCmd, changeMacro: p.changeMacro, l: 0, tags: tagsAttr(p.tags),
        }, [], p.text === undefined ? undefined : String(p.text), node);
      case 'WebApp': return this.webApp(node, geom);
      case 'Web': {
        const attrs: Attrs = {
          ...geom, j: this.join(node, 'join', 's'), title: this.join(node, 'titleJoin', 's'), back: this.join(node, 'backJoin', 'd'),
          forward: this.join(node, 'forwardJoin', 'd'), refresh: this.join(node, 'refreshJoin', 'd'), stop: this.join(node, 'stopJoin', 'd'),
        };
        // url="panel:/iva-color/000000": a page of the panel's own web server
        const own = /^panel:\/*(.*)$/i.exec(String(p.url));
        if (own) return this.webView(node, { ...attrs, tags: tagsAttr(p.tags) }, own[1]);
        return this.E('web', { ...attrs, url: this.webPage(p.url), tags: tagsAttr(p.tags) });
      }
      case 'Video': {
        const auth = p.auth ?? {};
        return this.E('video', {
          ...geom, j: p.join ?? 0, play: p.playJoin ?? 0, stop: p.stopJoin ?? 0, url: p.url, bgcolor: p.bg ?? '', format: p.format ?? 'mjpeg',
          auth_user: auth.user ?? '', auth_password: auth.password ?? '', auth_realm: auth.realm ?? '', auth_host: auth.host ?? '',
          auth_method: auth.method ?? '', auth_proxy: auth.proxy ?? '', autoplay: bool(p.autoplay, true), showcontrols: bool(p.controls), cache: p.cache ? 1 : undefined,
          tags: tagsAttr(p.tags),
        });
      }
      case 'Gesture': return this.gesture(node);
      case 'Box': {
        const name = this.generated(node, 'box', (sc) =>
          box({ w: p.w, h: p.h, radius: p.radius, fill: p.bg, borderWidth: p.borderWidth ?? 0, borderColor: p.borderColor }, sc));
        return this.E('img', {
          ...geom, j: 0, clickthrough: 1, refresh: 0, l: 0, noCache: 0, downloadIndicator: 0, clearOnURLChange: 0, tags: tagsAttr(p.tags),
        }, [], name, node);
      }
      case 'Subpage': {
        const name = this.defineSubpage(node, true);
        return this.placeSubpage(node, name);
      }
      case 'SubpageRef':
        this.subpageUses.push({ name: p.name, source: node.source });
        return this.placeSubpage(node, p.name);
    }
    throw this.err(node, 'unsupported');
  }

  private placeSubpage(node: VNode, name: string): XNode {
    const p = node.props;
    const tr = (t: Transition | undefined) => {
      if (t === undefined) return { transition: 'None', subtype: 'None', time: 0, ease: '' };
      return { transition: t.type === 'none' ? 'None' : t.type, subtype: t.from ? `from${t.from[0].toUpperCase()}${t.from.slice(1)}` : 'None', time: t.time ?? 0.3, ease: t.ease ?? '' };
    };
    const i = tr(p.in);
    const o = tr(p.out);
    return this.E('subpage', {
      name, x: p.x ?? 0, y: p.y ?? 0, j: this.join(node, 'join', 'd'),
      transition1: i.transition, subtype1: i.subtype, time1: i.time, ease1: i.ease,
      transition2: o.transition, subtype2: o.subtype, time2: o.time, ease2: o.ease,
      clickthrough: bool(p.clickthrough), topmost: bool(p.topmost), v: bool(p.visible, true), l: 0, tags: tagsAttr(p.tags),
    }, [], undefined, node);
  }

  private gesture(node: VNode): XNode {
    const p = node.props;
    const actions: XNode[] = [];
    for (const [phase, prop] of [['begin', 'onBegin'], ['change', 'onChange'], ['end', 'onEnd']] as const) {
      const list = p[prop] === undefined ? [] : Array.isArray(p[prop]) ? p[prop] : [p[prop]];
      for (const a of list) {
        const x = this.E('action', { phase });
        if (typeof a === 'string') x.attrs.push(['js', a]);
        else {
          if (a.js !== undefined) x.attrs.push(['js', a.js]);
          this.targetAttr(x, 'j', a.join === undefined ? undefined : typedJoin(a.join));
          if (a.value !== undefined) x.attrs.push(['value', String(a.value)]);
        }
        actions.push(x);
      }
    }
    return this.E('gesture', {
      name: p.name ?? `${p.type} gesture`, type: p.type, direction: p.direction, taps: p.taps, touches: p.touches ?? 1,
    }, actions);
  }

  private button(node: VNode, geom: object): XNode {
    const p = node.props;
    const text = p.text === undefined ? '' : String(p.text);
    // fa() icons: drawn in the state's text colour, placed by iconAlign (the text makes room)
    const align = p.iconAlign ?? 'center';
    if (!['center', 'left', 'top'].includes(align)) throw this.err(node, `iconAlign: 'center', 'left' or 'top'`);
    const anIcon = [p.icon, p.activeIcon].map((v) => (isIcon(v) ? v : isIcon(v?.src) ? v.src : undefined)).find(Boolean);
    const iconSize = anIcon ? anIcon.size ?? Math.round(Math.min(p.w, p.h) * 0.5) : 0;
    let iconPos = { x: Math.round((p.w - iconSize) / 2), y: Math.round((p.h - iconSize) / 2) };
    let textRoom: [number, number, number, number] | undefined;
    if (anIcon && align === 'left') {
      const gap = Math.max(4, Math.round((p.h - iconSize) / 2));
      iconPos = { x: gap, y: Math.round((p.h - iconSize) / 2) };
      if (text) textRoom = [0, gap, 0, gap + iconSize + Math.round(gap * 0.75)];
    } else if (anIcon && align === 'top') {
      // icon high, text at the bottom (bottom-aligned + a little padding, as GUI Designer's own themes do it)
      const gap = Math.max(4, Math.round(p.h * 0.1));
      iconPos = { x: Math.round((p.w - iconSize) / 2), y: gap };
      if (text) textRoom = [0, 0, gap, 0];
    }
    const iconImg = (v: unknown, state: 0 | 1) => {
      if (v === undefined) return [];
      const ref = typeof v === 'string' || isIcon(v) ? { src: v } : (v as any);
      if (!ref?.src) throw this.err(node, 'icon: a file name, fa(\'name\'), or { src, x, y, w, h }');
      if (isIcon(ref.src)) {
        const ic = ref.src;
        const size = ic.size ?? iconSize;
        const color = ic.color ?? (state === 1 ? p.active?.color ?? p.color : p.color) ?? '#FFFFFF';
        const name = this.generated(node, 'fa', (sc) => icon(ic.name, ic.style, color, size, sc), ic.file);
        return [this.E('img', { x: ref.x ?? iconPos.x, y: ref.y ?? iconPos.y, w: ref.w ?? size, h: ref.h ?? size }, [], name)];
      }
      return [this.E('img', { x: ref.x ?? 0, y: ref.y ?? 0, w: ref.w ?? p.w, h: ref.h ?? p.h }, [], this.image(node, ref.src))];
    };
    // themed builds: a drawn icon goes into its state's background (a theme swap then swaps it too)
    const placed = (v: unknown, state: 0 | 1): PlacedIcon | undefined => {
      const ref = typeof v === 'string' || isIcon(v) ? { src: v } : (v as any);
      if (!this.opts.themed || p.theme !== undefined || p.image !== undefined || p.active?.image !== undefined || !isIcon(ref?.src)) return undefined;
      const ic = ref.src;
      const color = ic.color ?? (state === 1 ? p.active?.color ?? p.color : p.color) ?? '#FFFFFF';
      return { name: ic.name, style: ic.style, color, size: ic.size ?? iconSize, x: ref.x ?? iconPos.x, y: ref.y ?? iconPos.y };
    };
    const composed = [placed(p.icon, 0), placed(p.activeIcon ?? p.icon, 1)];
    const inactive = this.E('inactive', { s: this.join(node, 'textJoin', 's') }, composed[0] ? [] : iconImg(p.icon, 0), text, node);
    const active = this.E('active', { s: p.activeTextJoin !== undefined ? this.join(node, 'activeTextJoin', 's') : this.join(node, 'textJoin', 's') },
      composed[1] ? [] : iconImg(p.activeIcon ?? p.icon, 1), p.activeText === undefined ? text : String(p.activeText), node);

    const children: XNode[] = [];
    let { cmd, js } = p as { cmd?: string; js?: string };
    // one plain command / script on press: GUI Designer's own form, btn cmd="" / js=""
    const only = Array.isArray(p.onPress) && p.onPress.length === 1 ? p.onPress[0] : p.onPress;
    const simple = typeof only === 'string' ? { kind: 'command', value: only } : only;
    if (p.onRelease === undefined && p.onHold === undefined && simple && !Array.isArray(simple) && simple.delay === undefined && simple.repeat === undefined
        && ((simple.kind === 'command' && cmd === undefined) || (simple.kind === 'js' && js === undefined))) {
      if (simple.kind === 'command') cmd = simple.value;
      else js = simple.value;
    } else if (p.onPress !== undefined || p.onRelease !== undefined || p.onHold !== undefined) {
      const entries = (list: unknown, tag: 'press' | 'release', hold?: number) => {
        const arr = Array.isArray(list) ? list : list === undefined ? [] : [list];
        return arr.map((a: any) => {
          const act = typeof a === 'string' ? { kind: 'command', value: a } : a;
          if (!act || !act.kind) throw this.err(node, `${tag}: an action is a command name or cmd()/macro()/js()`);
          const timing = tag === 'press' ? { delay: act.delay ?? 0, hold: hold ?? 0, repeat: act.repeat ?? 0 } : { delay: act.delay ?? 0 };
          return this.E(tag, { ...timing, [act.kind]: act.value });
        });
      };
      children.push(this.E('actions', {}, [this.E('action', {}, [
        ...entries(p.onPress, 'press'),
        ...entries(p.onHold, 'press', p.holdTime ?? 1000),
        ...entries(p.onRelease, 'release'),
      ])]));
    }
    children.push(inactive, active);
    return this.E('btn', {
      j: this.join(node, 'join', 'd'), ...geom, t: this.styleTheme(node, 'button', {
        always: true, active: p.active, icons: composed,
        // the text beside / below the icon: GUI Designer's way, padding (+ left-aligned beside it)
        extra: textRoom ? { padding: textRoom, ...(align === 'left' ? { align: 'left' as const } : { valign: 'bottom' as const }) } : undefined,
      }),
      href: p.href, flip: p.page ?? 'None', sim: FEEDBACK[p.feedback ?? 'momentary'] ?? this.fail(node, `feedback: 'momentary', 'toggle' or 'none'`),
      l: 0, s: 1, js, cmd, repeatdelay: p.repeat, tags: tagsAttr(p.tags),
    }, children, undefined, node);
  }

  private fail(node: VNode, msg: string): never {
    throw this.err(node, msg);
  }
}

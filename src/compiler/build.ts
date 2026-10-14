/**
 * Element tree (what a project's JSX evaluates to) -> .gui XML tree.
 * Checks props, turns style props into themes, gives named joins numbers,
 * hoists subpages defined inline, and collects the files the .gui uses.
 */

import fs from 'node:fs';
import path from 'node:path';
import { PROPS, REQUIRED, STYLE_PROPS, type StyleProps, type Transition } from './components.js';
import { fixedJoin, JoinAllocator, JoinSlot, typedJoin } from './joins.js';
import { isVNode, type Child, type Source, type VNode } from './runtime.js';
import { styleCss, Themes, type ThemeType } from './style.js';
import { didYouMean } from './suggest.js';
import { circle, generatedName, roundedRect } from './images.js';
import { el, type XNode } from './xml.js';

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
}

type Attrs = Record<string, string | number | boolean | null | undefined | JoinSlot>;

const ITEMS = new Set(['Button', 'Text', 'Image', 'Slider', 'Gauge', 'List', 'Input', 'Web', 'Video', 'Gesture', 'Subpage', 'SubpageRef']);
const FEEDBACK: Record<string, string> = { none: '0', momentary: '1', toggle: '2' };

/** Children flattened: arrays and fragments opened, false/null/undefined dropped. */
function flat(children: Child[], out: (VNode | string)[] = []): (VNode | string)[] {
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

  constructor(private baseDir: string) {}

  build(tree: Child): BuildResult {
    const top = flat([tree]).filter((c) => typeof c !== 'string' || c.trim());
    if (top.length !== 1 || typeof top[0] === 'string' || top[0].type !== 'Project') {
      throw new CompileError('the entry must `export default` one <Project>');
    }
    const project = top[0];
    this.check(project);
    const p = project.props;
    this.joins = new JoinAllocator(p.joinBase ?? 1000);
    const [w, h] = [p.width, p.height];
    this.primary = w >= h ? 'landscape' : 'portrait';
    const other = p.otherSize ?? [h, w];
    const land = this.primary === 'landscape' ? [w, h] : other;
    const port = this.primary === 'portrait' ? [w, h] : other;

    const children = this.elements(project);
    // themes first: elements refer to them by name
    for (const c of children) if (c.type === 'Theme') this.theme(c);
    for (const c of children) {
      switch (c.type) {
        case 'Theme': break;
        case 'Page': this.page(c); break;
        case 'Subpage': this.defineSubpage(c, false); break;
        case 'System': this.system(c); break;
        case 'Macro': this.macro(c); break;
        case 'Token': this.token(c); break;
        case 'Script': this.script(c); break;
        case 'Sound': this.sound(c); break;
        default: throw this.err(c, `<${c.type}> can't be directly in <Project> (it takes Page, Subpage, System, Macro, Token, Script, Sound, Theme)`);
      }
    }
    if (!this.pages.length) throw new CompileError('the project has no <Page>');
    const starts = this.pages.filter((pg) => pg.attrs.some(([k, v]) => k === 'start' && v === '1'));
    if (starts.length > 1) throw new CompileError(`more than one start page: ${starts.map((s) => s.attrs[0][1]).join(', ')}`);
    if (!starts.length) this.pages[0].attrs.push(['start', '1']);
    for (const use of this.subpageUses) {
      if (!this.subpages.has(use.name)) {
        throw new CompileError(`no subpage "${use.name}"${didYouMean(use.name, this.subpages.keys())}`, use.source);
      }
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
        el('size', { autoposition: p.autoposition ?? 'scale' }, [
          el('portrait', { width: port[0], height: port[1] }),
          el('landscape', { width: land[0], height: land[1] }),
        ]),
        el('autoposition'),
        el('imagefolder'),
        el('debug', { loaderrors: 0, connectionerrors: 0 }),
      ]),
      ...section('systems', this.systems),
      ...section('macros', this.macros),
      ...section('sounds', this.sounds),
      this.themes.toXml(),
      ...section('tokens', this.tokens),
      ...section('scripts', this.scripts.map((s) => el('script', { name: s.name }))),
      ...this.pages,
      ...[...this.subpages.values()].map((s) => s.node),
    ]);
    return { root, assets: [...this.assets.values()], scripts: this.scripts, joins: this.joins.map(), warnings: this.warnings };
  }

  // ── checks & helpers ─────────────────────────────────────────────

  private err(node: VNode | undefined, msg: string) {
    return new CompileError(node ? `<${node.type}>: ${msg}` : msg, node?.source);
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

  private target(node: VNode, prop: string): JoinSlot | string | undefined {
    const v = node.props[prop];
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
  private image(node: VNode, src: string): string {
    if (/^[a-z]+:\/\//i.test(src)) return src;
    const from = this.dirOf(node);
    const file = path.resolve(from, src);
    if (!fs.existsSync(file)) throw this.err(node, `image not found: ${src} (looked for ${file})`);
    const name = path.basename(file);
    const prev = this.assets.get(name.toLowerCase());
    if (prev && prev.file !== file && !(prev.data ?? fs.readFileSync(prev.file!)).equals(fs.readFileSync(file))) {
      throw this.err(node, `two different images are both named ${name} (${prev.file}, ${file}); iViewer finds images by name - rename one`);
    }
    if (!prev) this.assets.set(name.toLowerCase(), { name, file });
    return name;
  }

  /** An image iva drew: registered under a name derived from its content. */
  private generated(node: VNode, kind: string, draw: () => Buffer): string {
    let data: Buffer;
    try {
      data = draw();
    } catch (e: any) {
      throw this.err(node, e.message);
    }
    const name = generatedName(kind, data);
    if (!this.assets.has(name)) this.assets.set(name, { name, data });
    return name;
  }

  /** A slider's / gauge's theme: two states, track and fill, as images. */
  private meterTheme(node: VNode): string {
    const p = node.props;
    const styled = ['bg', 'image', 'fill', 'fillImage', 'radius'].some((k) => p[k] !== undefined);
    if (p.theme !== undefined) {
      if (styled) throw this.err(node, `use either theme="${p.theme}" or bg / image / fill props, not both`);
      if (!this.themes.has(p.theme)) throw this.err(node, `no <Theme name="${p.theme}">`);
      return p.theme;
    }
    if (!styled) return '';
    if (p.bg !== undefined && p.image !== undefined) throw this.err(node, 'bg or image, not both');
    if (p.fill !== undefined && p.fillImage !== undefined) throw this.err(node, 'fill or fillImage, not both');
    const r = p.radius ?? Math.min(p.w, p.h) / 2;
    const part = (color: string | undefined, file: string | undefined, kind: string) =>
      file !== undefined ? this.image(node, file) : color !== undefined ? this.generated(node, kind, () => roundedRect(p.w, p.h, r, color)) : undefined;
    const off = part(p.bg, p.image, 'track');
    const on = part(p.fill, p.fillImage, 'fill');
    const css = (img: string | undefined) => (img ? `background-image: url(${img});` : '');
    return this.themes.generated('gauge', [css(off), css(on)]);
  }

  /** The element's theme: <Theme> by name, or one generated from its style props. */
  private styleTheme(node: VNode, type: ThemeType, opts: { always?: boolean; active?: StyleProps } = {}): string {
    const p = node.props;
    if (p.theme !== undefined) {
      if (hasStyle(p) || opts.active) throw this.err(node, `use either theme="${p.theme}" or style props, not both`);
      if (!this.themes.has(p.theme)) throw this.err(node, `no <Theme name="${p.theme}">`);
      const t = this.themes.typeOf(p.theme);
      if (t !== type) this.warnings.push(`${this.where(node)}<${node.type}> uses ${t} theme "${p.theme}" (expects ${type})`);
      return p.theme;
    }
    if (!opts.always && !hasStyle(p) && !opts.active) return '';
    const base = pickStyle(p);
    const img = (src: string) => this.image(node, src);
    const states = [styleCss(type, base, img)];
    if (type === 'button') states.push(styleCss(type, { ...base, ...(opts.active ?? {}) }, img));
    return this.themes.generated(type, states);
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
    const img = (src: string) => this.image(node, src);
    const base = pickStyle(p);
    const states = [styleCss(p.type, base, img)];
    if (p.type === 'button' || p.type === 'gauge') states.push(styleCss(p.type, { ...base, ...(p.active ?? {}) }, img));
    else if (p.active) throw this.err(node, 'only button and gauge themes have an active state (for a gauge: the fill)');
    try {
      this.themes.define(p.name, p.type, states);
    } catch (e: any) {
      throw this.err(node, e.message);
    }
  }

  private page(node: VNode) {
    const p = node.props;
    if (this.pages.some((pg) => pg.attrs[0][1] === p.name)) throw this.err(node, `page "${p.name}" is defined twice`);
    const kids = this.elements(node);
    const blocks = kids.filter((k) => k.type === 'Landscape' || k.type === 'Portrait');
    if (blocks.length && blocks.length !== kids.length) {
      throw this.err(node, 'put every item inside <Landscape> / <Portrait>, or none of them');
    }
    const orient = (tag: 'landscape' | 'portrait', holder: VNode | undefined, items: VNode[]) => {
      const t = holder ? this.styleTheme(holder, 'background') : '';
      return this.E(tag, { t: t || undefined }, items.map((i) => this.item(i)));
    };
    let land: XNode;
    let port: XNode;
    if (blocks.length) {
      const L = blocks.filter((b) => b.type === 'Landscape');
      const P = blocks.filter((b) => b.type === 'Portrait');
      if (L.length > 1 || P.length > 1) throw this.err(node, 'one <Landscape> and one <Portrait> at most');
      const style = (b: VNode | undefined) => (b && (hasStyle(b.props) || b.props.theme) ? b : hasStyle(p) || p.theme ? node : b);
      land = orient('landscape', style(L[0]), L[0] ? this.elements(L[0]) : []);
      port = orient('portrait', style(P[0]), P[0] ? this.elements(P[0]) : []);
    } else {
      const main = orient(this.primary, hasStyle(p) || p.theme ? node : undefined, kids);
      const empty = this.E(this.primary === 'landscape' ? 'portrait' : 'landscape', {});
      [land, port] = this.primary === 'landscape' ? [main, empty] : [empty, main];
    }
    this.pages.push(this.E('page', {
      name: p.name, j: 0, tags: tagsAttr(p.tags) ?? '', transition: 'None', subtype: 'None', time: 0, ease: '', start: p.start ? 1 : undefined,
    }, [port, land]));
  }

  private defineSubpage(node: VNode, inline: boolean): string {
    const p = node.props;
    if (!inline) {
      const placed = ['x', 'y', 'join', 'visible', 'in', 'out', 'topmost', 'clickthrough', 'tags'].filter((k) => p[k] !== undefined);
      if (placed.length) throw this.err(node, `${placed.join(', ')}: a subpage defined in <Project> isn't placed anywhere (place it with <SubpageRef>, or define it inside a page)`);
    }
    if (this.subpages.has(p.name)) {
      throw new CompileError(`<Subpage>: "${p.name}" is defined twice (place it again with <SubpageRef name="${p.name}">)`, node.source);
    }
    // reserve the name first: an item inside may refer back to it
    this.subpages.set(p.name, { node: el('subpage'), source: node.source });
    const t = this.styleTheme(node, 'background');
    const items = this.elements(node).map((i) => this.item(i));
    this.subpages.set(p.name, {
      node: this.E('subpage', { name: p.name, w: p.w, h: p.h, t: t || undefined, clip: bool(p.clip, true) }, items),
      source: node.source,
    });
    return p.name;
  }

  private system(node: VNode) {
    const p = node.props;
    const children = this.elements(node).map((c) => {
      if (c.type === 'Command') return this.command(c);
      if (c.type === 'Feedback') return this.feedback(c);
      throw this.err(c, '<System> takes <Command> and <Feedback>');
    });
    const hb = p.heartbeat ?? {};
    this.systems.push(this.E('system', {
      name: p.name, ip: p.host, port: p.port, origin: p.localPort ?? 0, protocol: p.protocol ?? 'tcp',
      alwayson: bool(p.alwaysOn, true), offlinequeue: bool(p.offlineQueue), accept: bool(p.accept), acceptBroadcasts: bool(p.acceptBroadcasts),
      ssl: 0, maxconnections: p.maxConnections ?? 0, heartbeatRx: hb.rx ?? '', heartbeatTx: hb.tx ?? '', heartbeatMode: hb.mode ?? -1,
      eom: p.eom ?? '', connectionStatus: this.join(node, 'connectJoin', 'd'), disconnectionStatus: this.join(node, 'disconnectJoin', 'd'),
      startupCmd: p.startupCmd ?? '', startupMacro: p.startupMacro ?? '', textEncoding: '', js: '',
    }, children, undefined, node));
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
    return x;
  }

  private feedback(node: VNode): XNode {
    const items = this.elements(node).map((c) => {
      const p = c.props;
      if (c.type === 'Capture') {
        const t = this.target(c, 'join');
        if (typeof t === 'string') throw this.err(c, `join: "${t}" isn't a join (d(5), 's12', 'a:level')`);
        const x = this.E('group', { index: p.index ?? 1, name: p.name ?? '', datatype: t!.type });
        // GUI Designer writes the target with its type letter (target="d1")
        this.targetAttr(x, 'target', t);
        for (const [k, attr] of [['onVal', 'onVal'], ['offVal', 'offVal'], ['unit', 'unit'], ['min', 'min'], ['max', 'max'], ['transform', 'transform']] as const) {
          if (p[k] !== undefined) x.attrs.push([attr, String(p[k])]);
        }
        if (p.setToken) x.attrs.push(['settoken', '1']);
        return x;
      }
      if (c.type === 'OnMatch') {
        const x = this.E('onmatch', {});
        this.targetAttr(x, 'target', this.target(c, 'target'));
        if (p.value !== undefined) x.attrs.push(['value', String(p.value)]);
        if (p.cmd !== undefined) x.attrs.push(['cmd', p.cmd]);
        if (p.token !== undefined) x.attrs.push(['token', p.token]);
        return x;
      }
      throw this.err(c, '<Feedback> takes <Capture> and <OnMatch>');
    });
    return this.E('fb', { name: node.props.name, regex: node.props.regex }, items);
  }

  private macro(node: VNode) {
    const steps = this.elements(node).map((c) => {
      if (c.type !== 'Step') throw this.err(c, '<Macro> takes <Step command="..." delay={ms}>');
      return this.E('command', { delay: c.props.delay ?? 0 }, [], c.props.command);
    });
    this.macros.push(this.E('macro', { name: node.props.name }, steps));
  }

  private token(node: VNode) {
    const p = node.props;
    const name = p.name.startsWith('[') ? p.name : `[${p.name}]`;
    this.tokens.push(this.E('token', { name, value: p.value ?? '', persist: p.persist ? 1 : undefined }));
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
    if (this.scripts.some((s) => s.name.toLowerCase() === out.name.toLowerCase())) throw this.err(node, `two scripts named ${out.name}`);
    this.scripts.push(out);
  }

  private sound(node: VNode) {
    const p = node.props;
    const from = this.dirOf(node);
    const file = path.resolve(from, p.src);
    if (!fs.existsSync(file)) throw this.err(node, `sound not found: ${p.src}`);
    const name = path.basename(file);
    this.assets.set(name.toLowerCase(), { name, file });
    this.sounds.push(this.E('sound', { name: p.name, j: this.join(node, 'join', 'd'), loop: bool(p.loop), releasestop: bool(p.releaseStop) }, [], name, node));
  }

  // ── items ────────────────────────────────────────────────────────

  private item(node: VNode): XNode {
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
          if (g.type !== 'Gesture') throw this.err(g, '<Image> takes only <Gesture>');
          return this.gesture(g);
        });
        return this.E('img', {
          ...geom, j: this.join(node, 'join', 's'), clickthrough: bool(p.clickthrough), refresh: p.refresh ?? 0, l: 0,
          noCache: bool(p.noCache), downloadIndicator: bool(p.downloadIndicator), clearOnURLChange: bool(p.clearOnURLChange), tags: tagsAttr(p.tags),
        }, gestures, p.src !== undefined ? this.image(node, p.src) : '', node);
      }
      case 'Slider': {
        if (p.thumb !== undefined && p.thumbColor !== undefined) throw this.err(node, 'thumb or thumbColor, not both');
        const drawn = p.thumbColor !== undefined
          ? this.generated(node, 'thumb', () => circle(p.thumbSize ?? Math.min(p.w, p.h), p.thumbColor))
          : undefined;
        const ind = (state: number, img: unknown) => {
          const ref = typeof img === 'string' ? { src: img } : (img as any);
          return this.E('indicator', {
            state, offsetX: 0, offsetY: 0, x: ref?.x ?? 0, y: ref?.y ?? 0, w: ref?.w ?? 0, h: ref?.h ?? 0, t: '',
          }, [], drawn ?? (ref ? this.image(node, ref.src) : ''));
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
          t: this.styleTheme(node, 'input', { always: true }), l: 0, tags: tagsAttr(p.tags),
        }, [], undefined, node);
      case 'Web':
        return this.E('web', {
          ...geom, j: p.join ?? 0, title: p.titleJoin ?? 0, back: p.backJoin ?? 0, forward: p.forwardJoin ?? 0, refresh: p.refreshJoin ?? 0, stop: p.stopJoin ?? 0,
          url: p.url, tags: tagsAttr(p.tags),
        });
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
    const icon = (v: unknown) => {
      if (v === undefined) return [];
      const ref = typeof v === 'string' ? { src: v } : (v as any);
      if (!ref?.src) throw this.err(node, 'icon: a file name or { src, x, y, w, h }');
      return [this.E('img', { x: ref.x ?? 0, y: ref.y ?? 0, w: ref.w ?? p.w, h: ref.h ?? p.h }, [], this.image(node, ref.src))];
    };
    const text = p.text === undefined ? '' : String(p.text);
    const inactive = this.E('inactive', { s: this.join(node, 'textJoin', 's') }, icon(p.icon), text, node);
    const active = this.E('active', { s: p.activeTextJoin !== undefined ? this.join(node, 'activeTextJoin', 's') : this.join(node, 'textJoin', 's') },
      icon(p.activeIcon ?? p.icon), p.activeText === undefined ? text : String(p.activeText), node);

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
      j: this.join(node, 'join', 'd'), ...geom, t: this.styleTheme(node, 'button', { always: true, active: p.active }),
      flip: p.page ?? 'None', sim: FEEDBACK[p.feedback ?? 'momentary'] ?? this.fail(node, `feedback: 'momentary', 'toggle' or 'none'`),
      l: 0, s: 0, js, cmd, repeatdelay: p.repeat, tags: tagsAttr(p.tags),
    }, children, undefined, node);
  }

  private fail(node: VNode, msg: string): never {
    throw this.err(node, msg);
  }
}

/**
 * .gui -> an iva JSX project, meant to compile back to the same .gui.
 *
 * Every attribute iva models becomes a prop; the rest go into the element's
 * `xml={{...}}`; an element that doesn't map is kept as <Raw>. Then the
 * project is compiled and compared with the original, element by element:
 * an attribute that comes out different is set in that element's xml={{}}
 * (null = remove), anything else makes the element <Raw>; until the two match.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compile, IvaError } from '../compiler/index.js';
import { compareTrees } from './compare.js';
import { parseXml, serialize, type XNode } from '../compiler/xml.js';
import { Code, fileName, identifier, j, print, type JNode, type PropValue } from './jsx.js';

export interface DecompileResult {
  entry: string;
  files: string[];
  /** differences left after the fix-ups ([] = it compiles back to the same .gui) */
  differences: string[];
  /** elements kept as <Raw> (by tag) */
  raw: Record<string, number>;
  warnings: string[];
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const SOUND_RE = /\.(mp3|wav|aac|m4a|caf|aiff?)$/i;

/** One element's attributes, consumed as they are mapped; the rest are left for xml={{}}. */
class Attrs {
  private map: Map<string, string>;
  private used = new Set<string>();
  constructor(private node: XNode) {
    this.map = new Map(node.attrs);
  }
  has(k: string) {
    return this.map.has(k);
  }
  /** the value, consumed */
  str(k: string): string | undefined {
    if (!this.map.has(k)) return undefined;
    this.used.add(k);
    return this.map.get(k);
  }
  /** the value, consumed; undefined when it's the default */
  opt(k: string, dflt: string): string | undefined {
    const v = this.str(k);
    return v === dflt ? undefined : v;
  }
  /** consume an attribute iva writes with a fixed value, if it has that value (else it stays for xml={{}}) */
  skip(k: string, dflt: string) {
    if (this.map.get(k) === dflt) this.used.add(k);
  }
  /** a number; consumed only if iva writes it back the same */
  num(k: string): number | undefined {
    const v = this.map.get(k);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (v.trim() === '' || !Number.isFinite(n)) return undefined;
    if (String(n) === v) this.used.add(k);
    return n;
  }
  /** a number, undefined when it's the default */
  optNum(k: string, dflt: number): number | undefined {
    const n = this.num(k);
    return n === dflt && this.used.has(k) ? undefined : n;
  }
  /** '1' / '0' -> true / undefined (when that's the default) */
  flag(k: string, dflt = false): boolean | undefined {
    const v = this.map.get(k);
    if (v !== '0' && v !== '1') return undefined;
    this.used.add(k);
    const b = v === '1';
    return b === dflt ? undefined : b;
  }
  /** a join number (0 / '0' -> undefined) */
  join(k: string): number | undefined {
    const n = this.num(k);
    return n === 0 ? undefined : n;
  }
  /** attributes not mapped to props */
  rest(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.map) if (!this.used.has(k)) out[k] = v;
    return out;
  }
}

class Decompiler {
  raw: Record<string, number> = {};
  warnings: string[] = [];
  subpageNames = new Set<string>();
  themeNames = new Set<string>();
  /** the JSX element written for each .gui element */
  jsxOf = new Map<XNode, JNode>();
  /** ... and those that may become <Raw> where they are */
  rawable = new Set<XNode>();

  constructor(private haveImage: (name: string) => boolean) {}

  reg(n: XNode, jn: JNode, rawable: boolean): JNode {
    this.jsxOf.set(n, jn);
    if (rawable) this.rawable.add(n);
    return jn;
  }

  /** Props for what's left over: xml={{...}}. */
  private xml(a: Attrs, _node?: XNode, _key?: string): [string, PropValue][] {
    const extra: Record<string, PropValue> = { ...a.rest() };
    return Object.keys(extra).length ? [['xml', extra]] : [];
  }

  /** Set one raw attribute on an element (fix-up). */
  setXml(jn: JNode, attr: string, value: string | null) {
    let entry = jn.props.find(([k]) => k === 'xml');
    if (!entry) jn.props.push((entry = ['xml', {}]));
    (entry[1] as Record<string, PropValue>)[attr] = value;
  }

  /** Turn an element into <Raw> in place (fix-up). */
  toRaw(n: XNode, why: string) {
    const jn = this.jsxOf.get(n)!;
    Object.assign(jn, this.rawNode(n, why));
  }

  /** The element as written: <Raw xml="..."/>. */
  rawNode(n: XNode, why?: string): JNode {
    this.raw[n.tag] = (this.raw[n.tag] ?? 0) + 1;
    if (why) this.warnings.push(`<${n.tag}> kept as <Raw>: ${why}`);
    const xml = serialize(n).split('\r\n').slice(1).join('\n').trim();
    return j('Raw', [['xml', xml]]);
  }

  private theme(a: Attrs): PropValue {
    const t = a.str('t');
    if (t === undefined) return undefined;
    if (t !== '' && !this.themeNames.has(t)) this.warnings.push(`theme "${t}" is used but not defined`);
    return t;
  }

  private img(src: string): string {
    if (src && !/^[a-z]+:\/\//i.test(src) && !this.haveImage(path.basename(src.replace(/\\/g, '/')))) this.warnings.push(`image not found: ${src}`);
    return src;
  }

  private geom(a: Attrs): [string, PropValue][] {
    return [['x', a.optNum('x', 0)], ['y', a.optNum('y', 0)], ['w', a.num('w')], ['h', a.num('h')]];
  }

  private tags(a: Attrs): [string, PropValue][] {
    return [['tags', a.str('tags')]];
  }

  item(n: XNode): JNode {
    return this.reg(n, this.itemJsx(n), true);
  }

  private itemJsx(n: XNode): JNode {
    try {
      switch (n.tag) {
        case 'btn': return this.button(n);
        case 'txt': return this.text(n);
        case 'img': return this.image(n);
        case 'slider': return this.slider(n);
        case 'gauge': return this.simple(n, 'Gauge', (a) => [['join', a.join('j')], ...this.geom(a), ['theme', this.theme(a)], ...this.tags(a)], ['l']);
        case 'list': return this.list(n);
        case 'input': return this.input(n);
        case 'web': return this.web(n);
        case 'video': return this.video(n);
        case 'gesture': return this.gesture(n);
        case 'subpage': return this.placement(n);
      }
    } catch (e: any) {
      return this.rawNode(n, e.message);
    }
    return this.rawNode(n);
  }

  /** Attributes iva writes with a fixed default (l="0" ...) are consumed if they have it. */
  private simple(n: XNode, type: string, props: (a: Attrs) => [string, PropValue][], fixed: string[] = []): JNode {
    if (n.children.length || n.text?.trim()) throw new Error('unexpected content');
    const a = new Attrs(n);
    const p = props(a);
    for (const k of fixed) a.skip(k, '0');
    return j(type, [...p, ...this.xml(a, n)]);
  }

  private button(n: XNode): JNode {
    const a = new Attrs(n);
    const kids = n.children;
    const actions = kids.find((c) => c.tag === 'actions');
    const inactive = kids.find((c) => c.tag === 'inactive');
    const active = kids.find((c) => c.tag === 'active');
    const order = kids.map((c) => c.tag).join(',');
    if (!inactive || !active || !['inactive,active', 'actions,inactive,active'].includes(order)) throw new Error(`children ${order}`);

    const state = (s: XNode) => {
      const sa = new Attrs(s);
      const join = sa.join('s');
      if (Object.keys(sa.rest()).length) throw new Error('state attributes');
      const imgs = s.children.filter((c) => c.tag === 'img');
      if (s.children.length !== imgs.length || imgs.length > 1) throw new Error('state children');
      let icon: PropValue;
      if (imgs[0]) {
        const ia = new Attrs(imgs[0]);
        icon = { src: this.img(imgs[0].text ?? ''), x: ia.num('x') ?? 0, y: ia.num('y') ?? 0, w: ia.num('w'), h: ia.num('h') };
        if (Object.keys(ia.rest()).length || (icon as any).w === undefined || (icon as any).h === undefined) throw new Error('icon attributes');
      }
      return { join, text: s.text ?? '', icon };
    };
    const off = state(inactive);
    const on = state(active);
    if (off.icon && !on.icon) throw new Error('an icon only when inactive');
    const same = (x: PropValue, y: PropValue) => JSON.stringify(x) === JSON.stringify(y);

    const props: [string, PropValue][] = [
      ['join', a.join('j')], ...this.geom(a), ['theme', this.theme(a)],
      ['text', off.text || undefined], ['activeText', on.text !== off.text ? on.text : undefined],
      ['textJoin', off.join], ['activeTextJoin', on.join !== off.join ? on.join ?? 0 : undefined],
      ['icon', off.icon], ['activeIcon', !same(on.icon, off.icon) ? on.icon : undefined],
    ];
    const flip = a.str('flip');
    if (flip !== undefined && flip !== 'None') props.push(['page', flip]);
    const sim = a.str('sim');
    const feedback: Record<string, string> = { '0': 'none', '2': 'toggle' };
    if (sim !== undefined && sim !== '1') {
      if (!feedback[sim]) throw new Error(`sim="${sim}"`);
      props.push(['feedback', feedback[sim]]);
    }
    a.skip('l', '0');
    a.skip('s', '1');
    props.push(['cmd', a.str('cmd')], ['js', a.str('js')], ['repeat', a.num('repeatdelay')]);
    if (a.has('repeatdelay') && Number(a.str('repeatdelay')) !== props.at(-1)![1]) throw new Error('repeatdelay');
    if (actions) props.push(...this.actions(actions, a.has('cmd'), a.has('js')));
    props.push(...this.tags(a));
    return j('Button', [...props, ...this.xml(a, n)]);
  }

  /** <actions><action><press/...><release/></action></actions> -> onPress / onHold / onRelease */
  private actions(n: XNode, hasCmd: boolean, hasJs: boolean): [string, PropValue][] {
    if (n.attrs.length || n.children.length !== 1 || n.children[0].tag !== 'action' || n.children[0].attrs.length) throw new Error('actions shape');
    const entries = n.children[0].children;
    const press: Code[] = [];
    const hold: Code[] = [];
    const release: Code[] = [];
    let holdTime: number | undefined;
    let phase = 0; // press, hold, release - in that order, as iva writes them
    for (const e of entries) {
      const a = new Attrs(e);
      const kinds = ['command', 'macro', 'js'].filter((k) => a.has(k));
      if (kinds.length !== 1 || e.children.length) throw new Error('action entry');
      const kind = kinds[0];
      const helper = kind === 'command' ? 'cmd' : kind;
      const value = a.str(kind)!;
      const delay = a.num('delay');
      const opts: Record<string, number> = {};
      if (delay) opts.delay = delay;
      let p: number;
      if (e.tag === 'press') {
        const h = a.num('hold') ?? 0;
        const repeat = a.num('repeat') ?? 0;
        if (repeat) opts.repeat = repeat;
        if (h > 0) {
          if (holdTime !== undefined && holdTime !== h) throw new Error('two hold times');
          holdTime = h;
          p = 1;
        } else p = 0;
      } else if (e.tag === 'release') p = 2;
      else throw new Error(`<${e.tag}> in actions`);
      if (Object.keys(a.rest()).length) throw new Error('action attributes');
      if (p < phase) throw new Error('action order');
      phase = p;
      const code = new Code(`${helper}(${JSON.stringify(value)}${Object.keys(opts).length ? `, ${JSON.stringify(opts).replace(/"(\w+)":/g, '$1: ')}` : ''})`);
      [press, hold, release][p].push(code);
    }
    // iva writes a lone plain press as btn cmd="" / js=""; keep the <actions> form with an explicit delay
    if (press.length === 1 && !hold.length && !release.length && !press[0].code.includes(', {')) {
      const kind = press[0].code.slice(0, press[0].code.indexOf('('));
      if ((kind === 'cmd' && !hasCmd) || (kind === 'js' && !hasJs)) press[0] = new Code(press[0].code.replace(/\)$/, ', { delay: 0 })'));
    }
    const list = (codes: Code[]) => (codes.length ? new Code(`[${codes.map((c) => c.code).join(', ')}]`) : undefined);
    return [['onPress', list(press)], ['onHold', list(hold)], ['holdTime', holdTime !== undefined && holdTime !== 1000 ? holdTime : undefined], ['onRelease', list(release)]];
  }

  private text(n: XNode): JNode {
    if (n.children.length) throw new Error('children');
    const a = new Attrs(n);
    const props: [string, PropValue][] = [['join', a.join('j')], ...this.geom(a), ['theme', this.theme(a)], ['text', n.text || undefined]];
    const wrap = a.str('wrap');
    if (wrap === 'True') props.push(['wrap', true]);
    else if (wrap !== 'False' && wrap !== undefined) props.push(['xml', { wrap }]);
    a.skip('l', '0');
    props.push(...this.tags(a));
    return j('Text', [...props, ...this.mergeXml(props, this.xml(a, n))]);
  }

  /** xml props already set (an odd value) merged with the leftovers. */
  private mergeXml(props: [string, PropValue][], extra: [string, PropValue][]): [string, PropValue][] {
    const i = props.findIndex(([k]) => k === 'xml');
    if (i < 0) return extra;
    const merged = { ...(props[i][1] as object), ...(extra[0]?.[1] as object) };
    props.splice(i, 1);
    return [['xml', merged]];
  }

  private image(n: XNode): JNode {
    const a = new Attrs(n);
    const props: [string, PropValue][] = [
      ...this.geom(a), ['join', a.join('j')], ['src', n.text?.trim() ? this.img(n.text.trim()) : undefined],
      ['clickthrough', a.flag('clickthrough')], ['refresh', a.optNum('refresh', 0)], ['noCache', a.flag('noCache')],
      ['downloadIndicator', a.flag('downloadIndicator')], ['clearOnURLChange', a.flag('clearOnURLChange')], ...this.tags(a),
    ];
    a.skip('l', '0');
    const kids = n.children.map((c) => (c.tag === 'gesture' ? this.item(c) : this.rawNode(c)));
    return j('Image', [...props, ...this.xml(a, n)], kids);
  }

  private slider(n: XNode): JNode {
    const a = new Attrs(n);
    const props: [string, PropValue][] = [
      ['join', a.join('j')], ['pressJoin', a.join('d')], ...this.geom(a), ['min', a.optNum('min', 0)], ['max', a.optNum('max', 65535)],
      ['decimals', a.optNum('decimals', 0)], ['theme', this.theme(a)],
    ];
    a.skip('unit', 'decimal');
    const sim = a.str('sim');
    if (sim === '0') props.push(['feedback', 'none']);
    else if (sim !== '1' && sim !== undefined) props.push(['xml', { sim }]);
    a.skip('l', '0');
    props.push(['dragCmd', a.str('dragCmd')], ['pressCmd', a.str('pressCmd')], ['releaseCmd', a.str('releaseCmd')], ['invert', a.flag('invert')], ...this.tags(a));
    const inds = n.children;
    if (inds.length) {
      if (inds.length !== 2 || inds.some((c, i) => c.tag !== 'indicator' || c.children.length)) throw new Error('indicators');
      const thumb = (c: XNode, state: string) => {
        const ia = new Attrs(c);
        if (ia.str('state') !== state) throw new Error('indicator order');
        const ref: Record<string, PropValue> = { src: this.img(c.text?.trim() ?? '') };
        for (const k of ['x', 'y', 'w', 'h', 'offsetX', 'offsetY']) {
          const v = ia.optNum(k, 0);
          if (v !== undefined) ref[k] = v;
        }
        ia.skip('t', '');
        const extra: Record<string, PropValue> = { ...ia.rest() };
        for (const k of ['x', 'y', 'w', 'h', 'offsetX', 'offsetY', 't']) if (!ia.has(k)) extra[k] = null;
        if (Object.keys(extra).length) ref.xml = extra;
        return ref;
      };
      const t0 = thumb(inds[0], '0');
      const t1 = thumb(inds[1], '1');
      props.push(['thumb', t0], ['activeThumb', JSON.stringify(t0) !== JSON.stringify(t1) ? t1 : undefined]);
    }
    return j('Slider', [...props, ...this.mergeXml(props, this.xml(a, n))]);
  }

  private list(n: XNode): JNode {
    if (n.children.length) throw new Error('children');
    const a = new Attrs(n);
    const sub = (k: string) => {
      const v = a.str(k);
      if (v === undefined || v === '') return undefined;
      if (!this.subpageNames.has(v)) throw new Error(`${k}="${v}": no such subpage`);
      return v;
    };
    const props: [string, PropValue][] = [
      ['join', a.join('j')], ...this.geom(a), ['item', sub('contentSub')], ['header', sub('headerSub')], ['title', sub('titleSub')], ['footer', sub('footerSub')],
    ];
    const o = a.str('orientation');
    if (o === 'h') props.push(['orientation', 'horizontal']);
    else if (o !== 'v' && o !== undefined) throw new Error(`orientation="${o}"`);
    a.skip('l', '0');
    const t = a.str('t');
    props.push(['swipeDelete', a.flag('swipedelete')], ['theme', t || undefined], ['scrollCmd', a.str('scrollCmd')], ['scrollInterval', a.num('scrollInterval')],
      ['listEndCmd', a.str('listEndCmd')], ['listEndOffset', a.num('listEndOffset')], ...this.tags(a));
    const x = this.xml(a, n);
    if (t === '') x.length ? ((x[0][1] as any).t = '') : x.push(['xml', { t: '' }]);
    return j('List', [...props, ...x]);
  }

  private input(n: XNode): JNode {
    const text = n.text;
    return this.simple({ ...n, text: undefined }, 'Input', (a) => {
      a.skip('j', '0');
      return [['join', a.join('s')], ...this.geom(a), ['text', text], ['password', a.flag('pass')], ['autoFocus', a.flag('autoFocus')], ['theme', this.theme(a)], ...this.tags(a)];
    }, ['f', 'l']);
  }

  private web(n: XNode): JNode {
    return this.simple(n, 'Web', (a) => [
      ...this.geom(a), ['url', a.str('url') ?? ''], ['join', a.join('j')], ['titleJoin', a.join('title')], ['backJoin', a.join('back')],
      ['forwardJoin', a.join('forward')], ['refreshJoin', a.join('refresh')], ['stopJoin', a.join('stop')], ...this.tags(a),
    ]);
  }

  private video(n: XNode): JNode {
    return this.simple(n, 'Video', (a) => {
      const auth: Record<string, string> = {};
      for (const k of ['user', 'password', 'realm', 'host', 'method', 'proxy']) {
        const v = a.str(`auth_${k}`);
        if (v) auth[k] = v;
      }
      return [
        ...this.geom(a), ['url', a.str('url') ?? ''], ['join', a.join('j')], ['playJoin', a.join('play')], ['stopJoin', a.join('stop')],
        ['format', a.opt('format', 'mjpeg')], ['bg', a.str('bgcolor') || undefined], ['autoplay', a.flag('autoplay', true)],
        ['controls', a.flag('showcontrols')], ['cache', a.flag('cache')], ['auth', Object.keys(auth).length ? auth : undefined], ...this.tags(a),
      ];
    });
  }

  private gesture(n: XNode): JNode {
    const a = new Attrs(n);
    const phases: Record<string, PropValue[]> = { begin: [], change: [], end: [] };
    let last = 0;
    for (const c of n.children) {
      const ca = new Attrs(c);
      const phase = ca.str('phase') ?? '';
      const idx = ['begin', 'change', 'end'].indexOf(phase);
      if (c.tag !== 'action' || idx < last || c.children.length) throw new Error('gesture actions');
      last = idx;
      const act: Record<string, PropValue> = {};
      if (ca.has('js')) act.js = ca.str('js');
      if (ca.has('j')) act.join = ca.str('j');
      if (ca.has('value')) act.value = ca.str('value');
      if (Object.keys(ca.rest()).length) throw new Error('gesture action attributes');
      phases[phase].push(Object.keys(act).length === 1 && act.js !== undefined ? act.js : act);
    }
    const ph = (list: PropValue[]) => (list.length === 0 ? undefined : list.length === 1 ? list[0] : list);
    return j('Gesture', [
      ['type', a.str('type')], ['name', a.str('name')], ['touches', a.num('touches')], ['taps', a.num('taps')], ['direction', a.str('direction')],
      ['onBegin', ph(phases.begin)], ['onChange', ph(phases.change)], ['onEnd', ph(phases.end)], ...this.xml(a, n),
    ]);
  }

  /** a subpage placed on a page / in a subpage */
  private placement(n: XNode): JNode {
    if (n.children.length) throw new Error('children');
    const a = new Attrs(n);
    const tr = (i: string): PropValue => {
      const type = a.str(`transition${i}`);
      const sub = a.str(`subtype${i}`);
      const time = a.num(`time${i}`);
      const ease = a.str(`ease${i}`);
      if (!type || type === 'None') {
        // nothing: iva writes None / None / 0 / ''
        const out: Record<string, string> = {};
        if (type === '') out[`transition${i}`] = '';
        if (sub !== 'None') out[`subtype${i}`] = sub ?? '';
        if (time !== 0) out[`time${i}`] = String(time);
        if (ease !== '' && ease !== undefined) out[`ease${i}`] = ease;
        if (Object.keys(out).length) extra.push(out);
        return undefined;
      }
      const m = /^from(Left|Right|Top|Bottom)$/.exec(sub ?? '');
      if (sub !== 'None' && !m) throw new Error(`subtype${i}="${sub}"`);
      return { type, from: m ? m[1].toLowerCase() : undefined, time: time ?? 0, ease: ease || undefined };
    };
    const extra: Record<string, string>[] = [];
    const name = a.str('name') ?? '';
    if (!this.subpageNames.has(name)) throw new Error(`no subpage "${name}"`);
    const props: [string, PropValue][] = [
      ['name', name], ['x', a.optNum('x', 0)], ['y', a.optNum('y', 0)], ['join', a.join('j')], ['in', tr('1')], ['out', tr('2')],
      ['clickthrough', a.flag('clickthrough')], ['topmost', a.flag('topmost')], ['visible', a.flag('v', true)], ...this.tags(a),
    ];
    a.skip('l', '0');
    const x = this.xml(a, n, 'subpage-ref');
    const merged = Object.assign({}, ...extra, x[0]?.[1] ?? {});
    return j('SubpageRef', [...props, ...(Object.keys(merged).length ? [['xml', merged] as [string, PropValue]] : [])]);
  }

  /** <page> -> <Page> */
  page(n: XNode, primary: 'landscape' | 'portrait'): JNode {
    const a = new Attrs(n);
    const props: [string, PropValue][] = [['name', a.str('name')], ['start', a.str('start') === '1' ? true : undefined]];
    const extra: Record<string, string | null> = {};
    a.skip('j', '0');
    for (const [k, d] of [['transition', ''], ['subtype', ''], ['time', '0'], ['ease', '']] as const) a.skip(k, d);
    props.push(['tags', a.str('tags')]);
    const orient = (tag: string) => n.children.find((c) => c.tag === tag);
    if (n.children.some((c) => c.tag !== 'landscape' && c.tag !== 'portrait') || n.children.length > 2) throw new Error('page children');
    const land = orient('landscape');
    const port = orient('portrait');
    const main = primary === 'landscape' ? land : port;
    const other = primary === 'landscape' ? port : land;
    const rest = a.rest();
    Object.assign(extra, rest);
    const xmlProp: [string, PropValue][] = Object.keys(extra).length ? [['xml', extra]] : [];
    const items = (o: XNode | undefined) => (o ? o.children.map((c) => this.item(c)) : []);
    const orientProps = (o: XNode): [string, PropValue][] => {
      const oa = new Attrs(o);
      const t = oa.str('t');
      return [['theme', t || undefined], ...(Object.keys(oa.rest()).length ? [['xml', oa.rest()] as [string, PropValue]] : [])];
    };
    // the short form: everything in the main orientation, the other one there but bare
    const designerOrder = n.children[0] === (primary === 'landscape' ? other : main);
    if (main && other && !other.children.length && !other.attrs.length && designerOrder) {
      const op = orientProps(main);
      if (!op.some(([k]) => k === 'xml')) return this.reg(n, j('Page', [...props, ...op, ...xmlProp], items(main)), false);
    }
    // else exactly the orientations it has, in its order
    const blocks = n.children.map((o) => this.reg(o, j(o.tag === 'landscape' ? 'Landscape' : 'Portrait', orientProps(o), items(o)), false));
    return this.reg(n, j('Page', [...props, ...xmlProp], blocks), false);
  }

  /** a subpage definition */
  subpage(n: XNode): JNode {
    const a = new Attrs(n);
    const props: [string, PropValue][] = [['name', a.str('name')], ['w', a.num('w')], ['h', a.num('h')], ['theme', this.theme(a)], ['clip', a.flag('clip', true)]];
    return this.reg(n, j('Subpage', [...props, ...this.xml(a, n)], n.children.map((c) => this.item(c))), false);
  }

  system(n: XNode): JNode {
    const a = new Attrs(n);
    const protocol = a.str('protocol') ?? 'tcp';
    const udp = protocol === 'udp';
    const modes: Record<string, string> = { '0': 'transitory', '2': 'dialog' };
    const alwayson = a.str('alwayson');
    const hbMode = a.str('heartbeatMode');
    const rx = a.str('heartbeatRx');
    const tx = a.str('heartbeatTx');
    const heartbeat = hbMode === '0' || hbMode === '1' ? { mode: hbMode === '0' ? 'reply' : 'initiate', rx: rx || undefined, tx: tx || undefined } : undefined;
    const extra: Record<string, string> = {};
    if (!heartbeat && (rx || tx || (hbMode !== undefined && hbMode !== '-1'))) Object.assign(extra, { heartbeatMode: hbMode ?? '', heartbeatRx: rx ?? '', heartbeatTx: tx ?? '' });
    if (alwayson !== undefined && alwayson !== '1' && !modes[alwayson]) extra.alwayson = alwayson;
    const props: [string, PropValue][] = [
      ['name', a.str('name')], ['host', a.str('ip') ?? ''], ['port', a.num('port') ?? 0], ['protocol', protocol === 'tcp' ? undefined : protocol],
      ['localPort', a.optNum('origin', 0)], ['mode', alwayson ? modes[alwayson] : undefined], ['idleTimeout', a.num('idleTimeout')], ['dialogTimeout', a.num('dialogTimeout')],
      ['accept', a.flag('accept', udp)], ['acceptBroadcasts', a.flag('acceptBroadcasts', udp)], ['eom', a.str('eom') || undefined],
      ['offlineQueue', a.flag('offlinequeue', !udp)], ['connectJoin', a.join('connectionStatus')],
      ['disconnectJoin', a.join('disconnectionStatus')], ['heartbeat', heartbeat], ['ssl', a.flag('ssl')],
      ['textEncoding', a.str('textEncoding') || undefined], ['sendHandler', a.str('js') || undefined],
      ['startupCmd', a.str('startupCmd') || undefined], ['startupMacro', a.str('startupMacro') || undefined], ['maxConnections', a.optNum('maxconnections', 0)],
      ...(Object.keys(extra).length ? [['xml', extra] as [string, PropValue]] : []),
    ];
    const kids = n.children.map((c) => {
      let jn: JNode;
      try {
        jn = c.tag === 'cmd' ? this.command(c) : c.tag === 'fb' ? this.feedback(c) : this.rawNode(c);
      } catch (e: any) {
        jn = this.rawNode(c, e.message);
      }
      return this.reg(c, jn, true);
    });
    return this.reg(n, j('System', [...props, ...this.xml(a, n)], kids), false);
  }

  private command(n: XNode): JNode {
    if (n.children.length) throw new Error('children');
    const a = new Attrs(n);
    const js = a.str('js');
    const props: [string, PropValue][] = [['name', a.str('name')], ['send', n.text || undefined], ['js', js]];
    if (js !== undefined) {
      const s = a.str('jsSendsCommand');
      if (s === 'True') props.push(['jsSendsCommand', true]);
      else if (s !== 'False') props.push(['xml', { jsSendsCommand: s ?? null }]);
    }
    const target = a.str('target');
    const value = a.str('value');
    if ((target === undefined) !== (value === undefined)) throw new Error('target without value');
    if (target !== undefined) {
      props.push(['target', target], ['value', value]);
      if (/^[dasl]\d+$/.test(target) && String(Number(target.slice(1))) !== target.slice(1)) throw new Error('target');
    }
    props.push(['folder', a.str('folder')]);
    return j('Command', [...props, ...this.mergeXml(props, this.xml(a, n))]);
  }

  private feedback(n: XNode): JNode {
    const a = new Attrs(n);
    const kids = n.children.map((c) => this.reg(c, this.feedbackItem(c), true));
    return j('Feedback', [['name', a.str('name')], ['regex', a.str('regex') ?? ''], ...this.xml(a, n)], kids);
  }

  private feedbackItem(c: XNode): JNode {
    {
      const ca = new Attrs(c);
      try {
        if (c.tag === 'group') {
          const type = ca.str('datatype');
          const target = ca.str('target') ?? '';
          if (c.children.length || !type) throw new Error('group');
          const isJoin = /^([dasl])(\d+)$/.exec(target);
          const props: [string, PropValue][] = [
            ['join', target], ['type', isJoin && isJoin[1] === type ? undefined : type], ['index', ca.optNum('index', 1)], ['name', ca.str('name') || undefined],
            ['onVal', ca.str('onVal')], ['offVal', ca.str('offVal')], ['unit', ca.str('unit')], ['min', ca.str('min')], ['max', ca.str('max')], ['transform', ca.str('transform')],
          ];
          if (isJoin && String(Number(isJoin[2])) !== isJoin[2]) throw new Error('target');
          const st = ca.str('settoken');
          if (st === '1') props.push(['setToken', true]);
          else if (st !== undefined) props.push(['xml', { settoken: st }]);
          return j('Capture', [...props, ...this.mergeXml(props, this.xml(ca, c))]);
        }
        if (c.tag === 'onmatch') {
          if (c.children.length) throw new Error('onmatch');
          return j('OnMatch', [['target', ca.str('target')], ['value', ca.str('value')], ['cmd', ca.str('cmd')], ['token', ca.str('token')], ...this.xml(ca, c)]);
        }
      } catch (e: any) {
        return this.rawNode(c, e.message);
      }
      return this.rawNode(c);
    }
  }

  macro(n: XNode): JNode {
    const a = new Attrs(n);
    const steps = n.children.map((c) => {
      if (c.tag !== 'command' || c.children.length) return this.reg(c, this.rawNode(c), true);
      const ca = new Attrs(c);
      return this.reg(c, j('Step', [['command', c.text ?? ''], ['delay', ca.optNum('delay', 0)], ...this.xml(ca, c)]), true);
    });
    return this.reg(n, j('Macro', [['name', a.str('name')], ...this.xml(a, n)], steps), false);
  }

  token(n: XNode): JNode {
    const a = new Attrs(n);
    const persist = a.str('persist');
    const name = a.str('name') ?? '';
    const bare = !name.startsWith('[');
    return this.reg(n, j('Token', [
      ['name', name], ['value', a.opt('value', '')], ['persist', persist === '1' ? true : undefined],
      ...this.mergeXml([], this.xml(a, n)),
      ...(persist !== undefined && persist !== '1' || bare ? [['xml', { ...(persist !== undefined && persist !== '1' ? { persist } : {}), ...(bare ? { name } : {}) }] as [string, PropValue]] : []),
    ]), false);
  }

  sound(n: XNode): JNode {
    const a = new Attrs(n);
    return this.reg(n, j('Sound', [
      ['name', a.str('name')], ['src', `./assets/${n.text?.trim() ?? ''}`], ['join', a.join('j')], ['loop', a.flag('loop')], ['releaseStop', a.flag('releasestop')],
      ...this.xml(a, n),
    ]), false);
  }
}

/**
 * Decompile a .gui into outDir: app.jsx, themes.jsx, systems.jsx, pages/,
 * subpages/, assets/ (images, sounds) and scripts/.
 */
export async function decompile(guiPath: string, outDir: string): Promise<DecompileResult> {
  const guiFile = path.resolve(guiPath);
  const srcDir = path.dirname(guiFile);
  const [gui] = parseXml(fs.readFileSync(guiFile, 'utf8'));
  if (!gui || gui.tag !== 'gui') throw new Error(`${guiPath}: not a .gui (no <gui> root)`);
  fs.mkdirSync(outDir, { recursive: true });
  const written: string[] = [];
  const write = (rel: string, text: string | Buffer) => {
    const f = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
    written.push(rel);
  };
  // the JSX files, rendered from their element trees (again after each fix-up)
  const jsxFiles: { rel: string; render: () => string }[] = [];
  const jsx = (rel: string, render: () => string) => jsxFiles.push({ rel, render });

  // the project's files: images and sounds into assets/ (iViewer finds them by name)
  const files: string[] = [];
  const walk = (d: string, depth = 0) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory() && depth < 6 && !e.name.startsWith('.') && path.resolve(f) !== path.resolve(outDir)) walk(f, depth + 1);
      else if (e.isFile()) files.push(f);
    }
  };
  walk(srcDir);
  const assets = new Map<string, string>();
  for (const f of files) {
    const name = path.basename(f);
    if ((IMAGE_RE.test(name) || SOUND_RE.test(name)) && !assets.has(name.toLowerCase())) assets.set(name.toLowerCase(), f);
  }
  for (const f of assets.values()) write(path.join('assets', path.basename(f)), fs.readFileSync(f));

  const d = new Decompiler((name) => assets.has(name.toLowerCase()));
  const section = (tag: string) => gui.children.filter((c) => c.tag === tag);
  const props = gui.children.find((c) => c.tag === 'properties');
  const themesNode = section('themes')[0];
  const pageNodes = section('page');
  const subNodes = section('subpage');
  for (const s of subNodes) d.subpageNames.add(s.attrs.find(([k]) => k === 'name')?.[1] ?? '');

  // themes: one <Theme> per name, its states' CSS exactly
  const themes = new Map<string, { type: string; states: string[] }>();
  const strayThemes: XNode[] = [];
  for (const t of themesNode?.children ?? []) {
    const raw = t.attrs.find(([k]) => k === 'name')?.[1] ?? '';
    const m = /^\.?([^[]*)(?:\[state='(\d+)'\])?$/.exec(raw);
    const type = t.attrs.find(([k]) => k === 'type')?.[1] ?? '';
    if (!m || t.tag !== 'theme' || t.children.length) {
      strayThemes.push(t);
      continue;
    }
    const [, name, state] = m;
    const entry = themes.get(name) ?? { type, states: [] };
    const i = state === undefined ? 0 : Number(state);
    if (entry.states[i] !== undefined || entry.type !== type) {
      strayThemes.push(t);
      continue;
    }
    entry.states[i] = t.cdata ?? t.text ?? '';
    themes.set(name, entry);
  }
  for (const [name, t] of themes) {
    if (t.states.some((s) => s === undefined) || t.states.length === 0) d.warnings.push(`theme ${name}: states missing`);
    d.themeNames.add(name);
  }

  // which orientation most pages are laid out in
  const count = (tag: string) => pageNodes.filter((p) => p.children.find((c) => c.tag === tag)?.children.length).length;
  const primary = count('portrait') > count('landscape') ? 'portrait' : 'landscape';

  const taken = new Set(['project', 'page', 'subpage', 'system', 'theme', 'macro', 'token', 'script', 'sound', 'raw', 'themes', 'systems']);
  const files_ = new Set<string>();
  const imports: string[] = [];
  const body: string[] = [];
  const fileHeader = '// Decompiled from ' + path.basename(guiFile) + ' by iva.\n';

  if (themes.size) {
    const nodes = [...themes].map(([name, t]) => j('Theme', [['name', name], ['type', t.type], ['states', t.states.map((s) => s ?? '')]]));
    jsx('themes.jsx', () => `${fileHeader}export default (\n  <>\n${nodes.map((n) => print(n, '    ')).join('\n')}\n  </>\n);\n`);
    imports.push(`import themes from './themes.jsx';`);
    body.push('{themes}');
  }
  const systems = section('systems')[0];
  if (systems) {
    const nodes = systems.children.map((c) => (c.tag === 'system' ? d.system(c) : d.rawNode(c)));
    jsx('systems.jsx', () => `${fileHeader}export default (\n  <>\n${nodes.map((n) => print(n, '    ')).join('\n\n')}\n  </>\n);\n`);
    imports.push(`import systems from './systems.jsx';`);
    body.push('{systems}');
  }
  const inline: JNode[] = [];
  for (const m of section('macros')[0]?.children ?? []) inline.push(m.tag === 'macro' ? d.macro(m) : d.rawNode(m));
  for (const t of section('tokens')[0]?.children ?? []) inline.push(t.tag === 'token' ? d.token(t) : d.rawNode(t));
  for (const s of section('sounds')[0]?.children ?? []) inline.push(s.tag === 'sound' ? d.sound(s) : d.rawNode(s));

  // scripts, by the name the .gui lists (iViewer resolves it from the .gui's folder)
  for (const s of section('scripts')[0]?.children ?? []) {
    const name = s.attrs.find(([k]) => k === 'name')?.[1];
    if (s.tag !== 'script' || !name || s.attrs.length !== 1) {
      inline.push(d.rawNode(s));
      continue;
    }
    const want = name.replace(/\\/g, '/').toLowerCase();
    const leaf = want.split('/').pop()!;
    const rel = (f: string) => path.relative(srcDir, f).split(path.sep).join('/').toLowerCase();
    const found = files.find((f) => rel(f) === want) ?? files.find((f) => path.basename(f).toLowerCase() === leaf);
    if (found) {
      const dest = path.join('scripts', name.replace(/\\/g, '/'));
      write(dest, fs.readFileSync(found));
      inline.push(j('Script', [['src', `./${dest.split(path.sep).join('/')}`], ['name', path.basename(name) === name ? undefined : name]]));
    } else {
      d.warnings.push(`script not found: ${name} (kept as an empty script)`);
      inline.push(j('Script', [['name', name], ['code', '']]));
    }
  }

  for (const s of subNodes) {
    const node = d.subpage(s);
    const name = String(node.props[0][1]);
    const id = identifier(name, 'Sub', taken);
    const file = `subpages/${fileName(name, files_)}.jsx`;
    jsx(file, () => `${fileHeader}export default (\n${print(node, '  ')}\n);\n`);
    imports.push(`import ${id} from './${file}';`);
    body.push(`{${id}}`);
  }
  for (const p of pageNodes) {
    const node = d.page(p, primary);
    const name = String(node.props[0][1]);
    const id = identifier(name, 'Page', taken);
    const file = `pages/${fileName(name, files_)}.jsx`;
    jsx(file, () => `${fileHeader}export default (\n${print(node, '  ')}\n);\n`);
    imports.push(`import ${id} from './${file}';`);
    body.push(`{${id}}`);
  }
  // anything else at the top level: as written
  const known = new Set(['properties', 'themes', 'systems', 'macros', 'tokens', 'sounds', 'scripts', 'page', 'subpage']);
  for (const c of gui.children) if (!known.has(c.tag)) inline.push(d.rawNode(c));
  for (const t of strayThemes) d.warnings.push(`theme element kept out: ${serialize(t).split('\r\n')[1]?.slice(0, 80)}`);

  // <Project>: name, sizes, the rest of <properties> as written
  const pc = props?.children ?? [];
  const sizeNode = pc.find((c) => c.tag === 'size');
  const dim = (tag: string) => {
    const n = sizeNode?.children.find((c) => c.tag === tag);
    const g = (k: string) => Number(n?.attrs.find(([a]) => a === k)?.[1] ?? 0);
    return [g('width'), g('height')] as [number, number];
  };
  const land = dim('landscape');
  const port = dim('portrait');
  const [main, other] = primary === 'landscape' ? [land, port] : [port, land];
  const after = sizeNode ? pc.slice(pc.indexOf(sizeNode) + 1) : pc.filter((c) => !['project', 'designer'].includes(c.tag));
  const propsXml = after.map((c) => serialize(c).split('\r\n').slice(1).join('\n').trim()).join('\n');
  const autoposition = sizeNode?.attrs.find(([k]) => k === 'autoposition')?.[1];
  const projectProps: [string, PropValue][] = [
    ['name', pc.find((c) => c.tag === 'project')?.text?.trim() || path.basename(guiFile, '.gui')],
    ['width', main[0]], ['height', main[1]],
    ['otherSize', other[0] === main[1] && other[1] === main[0] ? undefined : other],
    ['autoposition', autoposition === 'scale' ? undefined : autoposition ?? null],
    ['properties', propsXml],
  ];
  const project = j('Project', projectProps, [...inline, ...body.map((b) => new Code(b))]);
  jsx('app.jsx', () => `${fileHeader}${imports.join('\n')}${imports.length ? '\n\n' : ''}export default (\n${print(project, '  ')}\n);\n`);

  // fix-ups: compile, compare with the original, adjust what came out different
  const entry = path.join(outDir, 'app.jsx');
  const parent = new Map<XNode, XNode>();
  const link = (n: XNode) => n.children.forEach((c) => (parent.set(c, n), link(c)));
  link(gui);
  let differences: string[] = [];
  for (let pass = 0; pass < 6; pass++) {
    for (const f of jsxFiles) {
      fs.mkdirSync(path.dirname(path.join(outDir, f.rel)), { recursive: true });
      fs.writeFileSync(path.join(outDir, f.rel), f.render());
    }
    let built;
    try {
      built = await compile(entry);
    } catch (e) {
      throw e instanceof IvaError ? new Error(`the decompiled project doesn't compile: ${e.format(outDir)}`) : e;
    }
    const diffs = compareTrees(gui, parseXml(built.xml)[0]);
    differences = diffs.map((x) => x.text);
    if (!diffs.length) break;
    let changed = false;
    const rawed = new Set<XNode>();
    for (const diff of diffs) {
      const jn = diff.node && d.jsxOf.get(diff.node);
      if (diff.attr !== undefined && jn && jn.type !== 'Raw') {
        d.setXml(jn, diff.attr, diff.value ?? null);
        changed = true;
        continue;
      }
      // anything else: the nearest element that can be written as <Raw> where it is
      let n = diff.node;
      while (n && !d.rawable.has(n)) n = parent.get(n);
      if (n && !rawed.has(n) && d.jsxOf.get(n)!.type !== 'Raw') {
        rawed.add(n);
        d.toRaw(n, diff.text);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const f of jsxFiles) written.push(f.rel);
  return { entry, files: written, differences, raw: d.raw, warnings: d.warnings };
}

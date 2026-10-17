/**
 * iva's base elements: one per CommandFusion .gui object, plus helpers.
 * `PROPS` (the props each element takes) drives validation; the interfaces
 * give editors completion. What each becomes in the .gui: docs/components.md.
 */

import { intrinsic, type Child, type VNode } from './runtime.js';
import * as names from './names.js';
import { didYouMean } from './suggest.js';

/** An iva element: used as <Name ...props />. */
export type Component<P> = (props: P) => VNode;

// ── values ─────────────────────────────────────────────────────────

export type JoinType = 'd' | 'a' | 's' | 'l';
/** A join of a given type: a number, or a name iva gives a number to. */
export interface JoinRef {
  $$join: 1;
  type: JoinType;
  id: number | string;
}
const joinRef = (type: JoinType) => (id: number | string): JoinRef => ({ $$join: 1, type, id });
type JoinHelper = (id: number | string) => JoinRef;
/** digital join: `d(12)`, `d('power')` */
export const d: JoinHelper = joinRef('d');
/** analog join */
export const a: JoinHelper = joinRef('a');
/** serial join */
export const s: JoinHelper = joinRef('s');
/** list join */
export const l: JoinHelper = joinRef('l');

/** A join prop whose type the element fixes: `join={12}`, `join="power"` (named) or `d(12)`. */
export type Join = number | string | JoinRef;

/**
 * The folders of the build's image folder that iva's drawings go in, by what
 * they're for (a folder per component type; a dial's, a knob's, a colour
 * picker's drawings in a folder of their own in it). @internal
 */
export const DRAWN_FOLDERS: Record<string, string> = {
  bg: 'backgrounds', clear: 'backgrounds', box: 'boxes', btn: 'buttons', banner: 'banners', row: 'rows',
  fa: 'icons', icon: 'icons',
  dial: 'dials', knob: 'knobs', wheel: 'pickers', ring: 'pickers', cutout: 'pickers',
  track: 'sliders', fill: 'sliders', thumb: 'sliders',
  arc: 'drawn', dot: 'drawn', ticks: 'drawn',
};

/** A drawing's file (no extension) by its kind and an id, in its folder: drawnName('fa', 'a1b2c3d4') -> 'icons/fa-a1b2c3d4'. @internal */
export const drawnName = (kind: string, id: string): string => `${DRAWN_FOLDERS[kind] ?? 'drawn'}/${kind}-${id}`;

/** @internal */
export const drawnFile = names.drawnFile;
/** @internal */
export const drawnSet = names.drawnSet;
/** @internal */
export const drawnFileName = names.fileName;

/** A Font Awesome icon, drawn into an image at build time: fa('lightbulb'). */
export interface IconRef {
  $$icon: 1;
  name: string;
  style?: 'solid' | 'regular' | 'brands';
  color?: string;
  size?: number;
  /** the image's file name (else: from the content) */
  file?: string;
}
export interface IconOptions {
  /** default: the button's text colour (active: its active colour); white on <Image> */
  color?: string;
  /** px (default: half the button's height; the whole <Image>) */
  size?: number;
  /** 'solid' (default), 'regular' or 'brands' (also 'brands:github' as the name) */
  style?: 'solid' | 'regular' | 'brands';
  /** the image's file name (for scripts / list rows that name it) */
  file?: string;
}
/** A Font Awesome (free) icon: fa('lightbulb'), fa('bell', { style: 'regular' }), fa('brands:spotify'). Names: fontawesome.com/search?m=free */
export const fa: (name: string, opts?: IconOptions) => IconRef = (name, opts = {}) => ({ $$icon: 1, name, ...opts });

/**
 * The look being built, with <Project themes={['dark', 'light']}>: the project
 * is built once per look, and colours can depend on it:
 * `bg={variant() === 'light' ? '#FFFFFF' : '#14171A'}`. '' without themes.
 */
export const variant = (): string => (globalThis as { __ivaVariant?: string }).__ivaVariant ?? '';

/** A panel size in pixels. */
export interface ScreenSize {
  width: number;
  height: number;
  /**
   * device pixels per pixel (a size given as '1400x1400@3x'): the GUI is laid
   * out at the size divided by it (467x467), iViewer scales it up to fill the
   * screen and iva draws its images that sharp
   */
  scale?: number;
  /** the screen in device pixels, when there's a scale */
  device?: { width: number; height: number };
}

/**
 * The panel size being built: the <Project>'s own, or the one asked for
 * (`iva build --size 1400x1400`, one of <Project sizes>). Lay out from it and
 * one project fits every screen: `<ui.Card w={screen().width - 32} ...>`.
 */
export const screen = (): ScreenSize => {
  const g = globalThis as { __ivaScreen?: ScreenSize; __ivaScreenUsed?: boolean };
  if (g.__ivaScreen) return { ...g.__ivaScreen };
  // before iva knows the size (a first look at the project, to read its <Project>)
  g.__ivaScreenUsed = true;
  return { width: 1280, height: 800 };
};

/** '1400x1400' -> { width, height }; '1400x1400@3x' -> laid out at 467x467, scale 3; null if it isn't one. @internal */
export function parseSize(size: unknown): ScreenSize | null {
  const m = typeof size === 'string' ? /^(\d{2,5})x(\d{2,5})(?:@(\d+(?:\.\d+)?)x)?$/.exec(size.trim()) : null;
  if (!m) return null;
  const [width, height] = [Number(m[1]), Number(m[2])];
  const scale = m[3] === undefined ? 1 : Number(m[3]);
  if (!(scale >= 1 && scale <= 4)) return null;
  if (scale === 1) return { width, height };
  return { width: Math.round(width / scale), height: Math.round(height / scale), scale, device: { width, height } };
}

/** A size's folder in a build of several (iViewer matches it against a device's screen: 1400w1400h). @internal */
export const sizeFolder = (s: ScreenSize): string => `${(s.device ?? s).width}w${(s.device ?? s).height}h`;

/** How a size reads: 1400x1400, 1400x1400@3x. @internal */
export const sizeLabel = (s: ScreenSize): string => `${(s.device ?? s).width}x${(s.device ?? s).height}${s.scale && s.scale !== 1 ? `@${s.scale}x` : ''}`;

/** Something iva draws into an image (draw.arc(), ...); angles: degrees clockwise from 12 o'clock. */
export type DrawRef = { $$draw: 1; name?: string } & (
  | { kind: 'arc'; size: number; thickness: number; from: number; to: number; color: string }
  | { kind: 'dot'; size: number; ring: number; at: number; diameter: number; color: string }
  | { kind: 'knob'; size: number; color: string; pointer: string; at: number }
  | { kind: 'ticks'; size: number; count: number; from: number; to: number; length: number; width: number; color: string }
  | { kind: 'box'; w: number; h: number; radius?: number; fill?: string; borderWidth?: number; borderColor?: string }
  | { kind: 'wheel'; size: number }
  | { kind: 'ring'; size: number; thickness: number; color: string; outline?: string }
  | { kind: 'cutout'; w: number; h: number; radius: number; color: string }
);
type Drawing<K extends DrawRef['kind']> = Omit<Extract<DrawRef, { kind: K }>, '$$draw' | 'kind'>;
/** Images iva draws, for <Image src>: draw.arc({ size, thickness, from, to, color }), draw.dot(...),
 * draw.knob(...), draw.ticks(...), draw.box({ w, h, radius, fill, borderWidth, borderColor }), draw.wheel({ size }) (hue round, white in the middle),
 * draw.ring({ size, thickness, color, outline }), draw.cutout({ w, h, radius, color }) (a frame
 * with a rounded hole, to round a web view's corners). `name` fixes the file name (else: from the content). */
export const draw: {
  arc: (o: Drawing<'arc'>) => DrawRef;
  dot: (o: Drawing<'dot'>) => DrawRef;
  knob: (o: Drawing<'knob'>) => DrawRef;
  ticks: (o: Drawing<'ticks'>) => DrawRef;
  box: (o: Drawing<'box'>) => DrawRef;
  wheel: (o: Drawing<'wheel'>) => DrawRef;
  ring: (o: Drawing<'ring'>) => DrawRef;
  cutout: (o: Drawing<'cutout'>) => DrawRef;
} = {
  arc: (o) => ({ $$draw: 1, kind: 'arc', ...o }),
  dot: (o) => ({ $$draw: 1, kind: 'dot', ...o }),
  knob: (o) => ({ $$draw: 1, kind: 'knob', ...o }),
  ticks: (o) => ({ $$draw: 1, kind: 'ticks', ...o }),
  box: (o) => ({ $$draw: 1, kind: 'box', ...o }),
  wheel: (o) => ({ $$draw: 1, kind: 'wheel', ...o }),
  ring: (o) => ({ $$draw: 1, kind: 'ring', ...o }),
  cutout: (o) => ({ $$draw: 1, kind: 'cutout', ...o }),
};

export interface ImageRef {
  /** a file, or fa('icon') */
  src: string | IconRef;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** slider thumbs: shift from the track */
  offsetX?: number;
  offsetY?: number;
  /** raw attributes for the element (null removes one) */
  xml?: Record<string, string | number | null>;
}

/** What a button does: a command name (string), or cmd()/macro()/js()/setProps(). */
export interface Action {
  $$action: 1;
  kind: 'command' | 'macro' | 'js';
  value: string;
  delay?: number;
  repeat?: number;
  /** the named joins its script uses (setProps()): the build checks some element has each */
  joins?: JoinRef[];
}
export interface ActionOptions {
  /** ms after the press (release) before it runs */
  delay?: number;
  /** ms between repeats while held */
  repeat?: number;
}
const action = (kind: Action['kind']) => (value: string, opts: ActionOptions = {}): Action => ({ $$action: 1, kind, value, ...opts });
type ActionHelper = (value: string, opts?: ActionOptions) => Action;
/** run a <Command> by name */
export const cmd: ActionHelper = action('command');
/** run a <Macro> by name */
export const macro: ActionHelper = action('macro');
/** run JavaScript */
export const js: ActionHelper = action('js');
export type ActionList = (string | Action)[] | string | Action;

/** by how much, from what CF.getProperties says then: '+100', '-0.5' */
export type Relative = `+${number}` | `-${number}`;

/** What CF.setProperties changes on an element (setProps()). */
export interface Properties {
  x?: number | Relative;
  y?: number | Relative;
  w?: number | Relative;
  h?: number | Relative;
  /** 0 (gone: not tapped either) .. 1 */
  opacity?: number | Relative;
  /** 1: as drawn */
  scale?: number | Relative;
  xscale?: number | Relative;
  yscale?: number | Relative;
  /** degrees, clockwise (more than 180 at once may turn either way: split it, then: ...) */
  zrotation?: number | Relative;
  /** degrees about the X / Y axis: 3D (yrotation 0 -> 90 shows its edge - a card flip) */
  xrotation?: number | Relative;
  yrotation?: number | Relative;
  /** a <Theme> by name: at the end of the delay, not animated */
  theme?: string;
}

export interface SetPropsOptions {
  /** seconds before it starts (default 0) */
  delay?: number;
  /** seconds it takes (default 0: at once) */
  duration?: number;
  /** how it speeds up and slows down (default 'linear') */
  curve?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  /** once it's done: another setProps(), a cmd() / macro() / js(), or a list of them (in turn) */
  then?: Action | Action[];
}

/** An element (or more): its join - d('cube'), s(12) - a tag of elements, or a list of them. */
export type PropsTarget = JoinRef | string | (JoinRef | string)[];

const PROPERTIES = ['x', 'y', 'w', 'h', 'opacity', 'scale', 'xscale', 'yscale', 'zrotation', 'xrotation', 'yrotation', 'theme'];
const CURVES: Record<string, string> = {
  linear: 'CF.AnimationCurveLinear', easeIn: 'CF.AnimationCurveEaseIn', easeOut: 'CF.AnimationCurveEaseOut', easeInOut: 'CF.AnimationCurveEaseInOut',
};
const isJoinRef = (v: unknown): v is JoinRef => !!v && typeof v === 'object' && (v as JoinRef).$$join === 1;
/** a join as the panel's script has it: Joins.d["cube"] (iva-joins.js), "d12"; a tag as it is */
const joinCode = (t: JoinRef | string) =>
  typeof t === 'string' ? JSON.stringify(t) : typeof t.id === 'number' ? JSON.stringify(`${t.type}${t.id}`) : `Joins.${t.type}[${JSON.stringify(t.id)}]`;
/** an action as a script's statement (a callback's) */
const actionCode = (a: Action): string =>
  a.kind === 'js' ? a.value : a.kind === 'macro' ? `CF.runMacro(${JSON.stringify(a.value)});` : `CF.runCommand(null, ${JSON.stringify(a.value)});`;

/**
 * Change elements' properties - move, scale, turn, fade - with CF.setProperties,
 * animated over `duration` with a `curve`, then (`then`) the next thing: a
 * button's action (onPress={setProps(...)}), a script's code (`${setProps(...)}`).
 *
 *   setProps(d('cube'), { scale: 1.5 }, { duration: 0.3, curve: 'easeOut',
 *     then: setProps(d('cube'), { scale: 1 }, { duration: 0.3 }) })
 *   setProps(d('cube'), { x: '+200' })        // from where it is (CF.getProperties)
 *   setProps([d('a'), d('b'), 'menuItems'], { opacity: 0 }, { duration: 0.4 })
 */
export function setProps(target: PropsTarget, props: Properties, opts: SetPropsOptions = {}): Action {
  const targets = Array.isArray(target) ? target : [target];
  if (!targets.length || targets.some((t) => !isJoinRef(t) && (typeof t !== 'string' || !t))) {
    throw new Error('setProps: an element - its join (d(\'cube\'), s(12)) or a tag - or a list of them');
  }
  const keys = Object.keys(props) as (keyof Properties)[];
  if (!keys.length) throw new Error('setProps: no property to change (x, y, w, h, opacity, scale, zrotation ...)');
  for (const k of keys) {
    if (!PROPERTIES.includes(k)) throw new Error(`setProps: no property "${k}"${didYouMean(k, PROPERTIES)}`);
    const v = props[k];
    if (k === 'theme' ? typeof v !== 'string' : !(typeof v === 'number' && Number.isFinite(v)) && !(typeof v === 'string' && /^[+-]\d*\.?\d+$/.test(v))) {
      throw new Error(`setProps: ${k}: ${k === 'theme' ? 'a theme\'s name' : `a number, or '+n' / '-n' (by how much)`} (got ${JSON.stringify(v)})`);
    }
  }
  if (opts.curve !== undefined && !CURVES[opts.curve]) throw new Error(`setProps: curve: 'linear', 'easeIn', 'easeOut' or 'easeInOut'${didYouMean(opts.curve, Object.keys(CURVES))}`);
  const relative = keys.some((k) => k !== 'theme' && typeof props[k] === 'string');
  if (relative && targets.some((t) => !isJoinRef(t))) throw new Error('setProps: \'+n\' / \'-n\' need joins (CF.getProperties reads a join, not a tag)');
  const value = (k: keyof Properties, i: number) => {
    const v = props[k]!;
    if (k === 'theme' || typeof v === 'number') return JSON.stringify(v);
    return `(p[${i}].${k} ${v[0]} ${v.slice(1)})`;
  };
  const change = (t: JoinRef | string, i: number) => `{ join: ${joinCode(t)}${keys.map((k) => `, ${k}: ${value(k, i)}`).join('')} }`;
  const changes = targets.length === 1 ? change(targets[0], 0) : `[${targets.map(change).join(', ')}]`;
  const then = opts.then === undefined ? [] : Array.isArray(opts.then) ? opts.then : [opts.then];
  for (const a of then) if (!a || (a as Action).$$action !== 1) throw new Error('setProps: then: setProps(), cmd(), macro(), js() - or a list of them');
  const timed = opts.delay || opts.duration || opts.curve || then.length;
  const args = timed ? `, ${opts.delay ?? 0}, ${opts.duration ?? 0}, ${CURVES[opts.curve ?? 'linear']}` : '';
  const callback = then.length ? `, function () { ${then.map(actionCode).join(' ')} }` : '';
  let code = `CF.setProperties(${changes}${args}${callback});`;
  if (relative) code = `CF.getProperties([${targets.map(joinCode).join(', ')}], function (p) { ${code} });`;
  const joins = [...targets.filter(isJoinRef), ...then.flatMap((a) => a.joins ?? [])].filter((j) => typeof j.id === 'string');
  const out: Action = { $$action: 1, kind: 'js', value: code, ...(joins.length ? { joins } : {}) };
  // in a script's code too: `${setProps(...)}`
  Object.defineProperty(out, 'toString', { value: () => code });
  return out;
}

// ── style ──────────────────────────────────────────────────────────

/** Turned into a theme (.gui CSS), shared by every element with the same style. */
export interface StyleProps extends XmlProp {
  /** background colour: '#203040', 'rgba(0,0,0,0.5)', '#20304080' */
  bg?: string;
  /** background image (a file, relative to the .jsx; or a drawing: draw.box(...)) */
  image?: string | DrawRef;
  /** a page's / subpage's background image tiled at its own size (GUI Designer's Tiled), not stretched */
  tile?: boolean;
  /** 9-slice the image: px from each edge, `12` or `[top, right, bottom, left]` */
  slice?: number | [number, number, number, number];
  color?: string;
  /** font family, as iOS / Android name it: 'Helvetica Neue', 'Avenir Next', 'Roboto' (default 'Arial') */
  font?: string;
  /** a style of the family other than bold / italic: 'Medium', 'Light', 'Demi Bold', ... */
  fontStyle?: string;
  /** the device's font name (`font-name`); iva finds it from font + style, give it for fonts you ship */
  fontName?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  /** text underlined (text-decoration) */
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** text shadow: CSS text, or { color, x, y, blur } */
  shadow?: string | { color?: string; x?: number; y?: number; blur?: number };
  opacity?: number;
  padding?: number | [number, number, number, number];
  /** corner radius (<Button>, <Subpage>): iva draws the background */
  radius?: number;
  /** a border (<Button>, <Subpage>: drawn; <Input>: CSS) */
  borderWidth?: number;
  borderColor?: string;
  /** extra CSS, appended as is */
  css?: string;
  /** use a <Theme> by name instead of a generated one */
  theme?: string;
}

const STYLE = ['bg', 'image', 'tile', 'slice', 'color', 'font', 'fontStyle', 'fontName', 'fontSize', 'bold', 'italic', 'underline', 'align', 'valign', 'shadow', 'opacity', 'padding', 'radius', 'borderWidth', 'borderColor', 'css', 'theme'];
const GEOM = ['x', 'y', 'w', 'h'];
const METER = ['bg', 'image', 'fill', 'fillImage', 'radius', 'theme'];

interface Geom {
  x?: number;
  y?: number;
  w: number;
  h: number;
  /** iViewer tags (for JS: CF.getJoins by tag) */
  tags?: string | string[];
}

export interface Transition {
  type: 'fade' | 'moveIn' | 'push' | 'reveal' | 'none';
  from?: 'left' | 'right' | 'top' | 'bottom';
  /** seconds */
  time?: number;
  ease?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

interface Placement {
  x?: number;
  y?: number;
  /** digital join that shows / hides it */
  join?: Join;
  /** shown at start (when there's no join) */
  visible?: boolean;
  in?: Transition;
  out?: Transition;
  /** above everything else on the page (iva places it last) */
  topmost?: boolean;
  /** at x / y on the page, whatever <Group> it is in (a sheet centred on the screen) */
  fixed?: boolean;
  clickthrough?: boolean;
  tags?: string | string[];
}

// ── elements ───────────────────────────────────────────────────────

/** Every element takes `xml`: raw attributes for the .gui element, over what
 * iva writes (`null` removes one). For what iva doesn't model. */
interface XmlProp {
  xml?: Record<string, string | number | null>;
}

/** Panel sizes of the devices GUI Designer lists (landscape: width x height). */
export const DEVICES = {
  'iPad Pro 12.9': [1366, 1024],
  'iPad Pro 11': [1194, 834],
  'iPad Air 10.5': [1112, 834],
  iPad: [1024, 768],
  'iPhone XS Max': [896, 414],
  'iPhone X': [812, 375],
  'iPhone 8 Plus': [736, 414],
  'iPhone 8': [667, 375],
  'iPhone 5': [568, 320],
  'iPhone 4': [480, 320],
} as const satisfies Record<string, readonly [number, number]>;
export type Device = keyof typeof DEVICES;

export interface ProjectProps extends XmlProp {
  name: string;
  /** a device's panel size (instead of width / height) */
  device?: Device;
  /** with device: the main orientation (default 'landscape') */
  orientation?: 'landscape' | 'portrait';
  /** the panel size; width > height makes landscape the main orientation */
  width?: number;
  height?: number;
  /** the other orientation's size (default: width and height swapped) */
  otherSize?: [number, number];
  autoposition?: 'scale' | 'none' | null;
  /**
   * other screens to build it for: sizes={['1920x1080', '1400x1400@3x']}. iva
   * build writes a GUI per size (dist/1920w1080h/, a folder named the way
   * iViewer matches a device's screen) and --zip puts them all in one archive:
   * each device loads its own. screen() says which size is being built. @3x:
   * a phone's dense screen - laid out at a third of it (467x467) and scaled up
   * by iViewer, so everything is as big as on a tablet.
   */
  sizes?: (`${number}x${number}` | `${number}x${number}@${number}x`)[];
  /** first number given to named joins (default 1000) */
  joinBase?: number;
  /** a folder whose files all ship with the project; images are also found
   * there by bare name, as iViewer finds them (default './assets', if it exists) */
  assets?: string;
  /** raw XML for <properties> after <size> (default: iva's) */
  properties?: string;
  /**
   * the devices licensed to run it: iViewer's registration data, a name and
   * the code iViewer shows in its unlicensed-mode message for that device:
   * licenses={{ 'Living room iPad': '8437F51DCCD3F92EA6898A980ACA0259' }}
   */
  licenses?: Record<string, string>;
  /**
   * looks the panel switches between at runtime: the project is built once per
   * name (variant() tells which), and IvaTheme.set(name) switches (CF.setProperties
   * with a theme, by tag). The first is the one it starts in, unless `theme` says.
   */
  themes?: string[];
  /** the look it starts in (default: the first of `themes`) */
  theme?: string;
  /**
   * the build's folders (default true): the .gui with images/ next to it
   * (iViewer's asset folder: <imagefolder>), iva's drawings in
   * images/backgrounds, icons, controls, the scripts in images/scripts (iViewer
   * looks for a .gui's scripts in its image folder). false: everything next to
   * the .gui (as GUI Designer saves a project without an image folder)
   */
  folders?: boolean;
  /**
   * the port of the panel's own web server: every <WebApp> and the
   * ColorPicker's swatch (default: the first free from 8900)
   */
  httpPort?: number;
  children?: Child;
}
export interface PageProps extends Pick<StyleProps, 'bg' | 'image' | 'tile' | 'theme'>, XmlProp {
  name: string;
  /** the page shown at start (default: the first page) */
  start?: boolean;
  /** how it comes when flipped to (default: at once): fade, moveIn / push / reveal from a side */
  transition?: Transition;
  tags?: string | string[];
  children?: Child;
}
export interface OrientationProps extends Pick<StyleProps, 'bg' | 'image' | 'tile' | 'theme'>, XmlProp {
  children?: Child;
}
export interface SubpageProps extends Placement, Pick<StyleProps, 'bg' | 'image' | 'tile' | 'radius' | 'borderWidth' | 'borderColor' | 'theme'>, XmlProp {
  name: string;
  /** inside a page: only define it (list rows, ...), don't place it */
  define?: boolean;
  w: number;
  h: number;
  /** clip children to the subpage (default true) */
  clip?: boolean;
  children?: Child;
}
export interface SubpageRefProps extends Placement, XmlProp {
  name: string;
}
export interface ButtonProps extends Geom, StyleProps, XmlProp {
  /** digital join (press / feedback) */
  join?: Join;
  /** feedback: 'momentary' (default), 'toggle', or 'none' (only the join) */
  feedback?: 'momentary' | 'toggle' | 'none';
  text?: string | number;
  /** text when active (default: text) */
  activeText?: string | number;
  /** serial join for the text */
  textJoin?: Join;
  activeTextJoin?: Join;
  /** an image file, fa('icon'), or { src, x, y, w, h } */
  icon?: string | ImageRef | IconRef;
  activeIcon?: string | ImageRef | IconRef;
  /** where an fa() icon goes: 'center' (default), 'left' of the text, or 'top' above it */
  iconAlign?: 'center' | 'left' | 'top';
  /** style when active (pressed / on), over the normal style */
  active?: StyleProps;
  /** go to this page on release ('Return' = previous page) */
  page?: string;
  /** open this on release: "cf://host:port/other.gui" loads that GUI (GUI linking), another URL opens outside */
  href?: string;
  /** run this command on press */
  cmd?: string;
  /** JavaScript run on press (gets join, value, tokens, list, listIndex) */
  js?: string;
  /** repeat cmd / js every N ms while held */
  repeat?: number;
  onPress?: ActionList;
  onRelease?: ActionList;
  onHold?: ActionList;
  /** ms before onHold (default 1000) */
  holdTime?: number;
}
export interface TextProps extends Geom, StyleProps, XmlProp {
  /** serial join for the text */
  join?: Join;
  text?: string | number;
  wrap?: boolean;
  children?: Child;
}
export interface ImageProps extends Geom, XmlProp {
  /** a file (relative to the .jsx, or in assets/), a URL, fa('icon'), or draw.arc(...) etc. */
  src?: string | IconRef | DrawRef;
  /** serial join holding the image file / URL */
  join?: Join;
  clickthrough?: boolean;
  /** a URL's picture loaded again every N ms while it shows (a camera's snapshots), past any cache */
  refresh?: number;
  /** Allow Caching off: every load of a URL a download (else it's kept, and shown again from there) */
  noCache?: boolean;
  /** a spinner while a URL's picture comes */
  downloadIndicator?: boolean;
  /** a new URL clears the picture at once (else the one there stays till the new one's in) */
  clearOnURLChange?: boolean;
  children?: Child;
}
/** How a slider / gauge looks: images, or colours iva draws into images. */
export interface MeterStyle {
  /** track colour (iva draws the image) */
  bg?: string;
  /** track image */
  image?: string;
  /** filled part colour */
  fill?: string;
  /** filled part image */
  fillImage?: string;
  /** corner radius of the drawn track / fill (default: half the thickness) */
  radius?: number;
  /** a <Theme type="gauge"> by name */
  theme?: string;
}
export interface SliderProps extends Geom, MeterStyle, XmlProp {
  /** analog join */
  join?: Join;
  /** digital join, on while pressed */
  pressJoin?: Join;
  min?: number;
  max?: number;
  decimals?: number;
  invert?: boolean;
  feedback?: 'momentary' | 'none';
  /** the thumb image (and its active one) */
  thumb?: string | ImageRef;
  activeThumb?: string | ImageRef;
  /** thumb colour: iva draws a round thumb */
  thumbColor?: string;
  /** drawn thumb diameter (default: the slider's thickness) */
  thumbSize?: number;
  /** commands run while dragging / on press / on release ([sliderval] = the value) */
  dragCmd?: string;
  pressCmd?: string;
  releaseCmd?: string;
}
export interface GaugeProps extends Geom, MeterStyle, XmlProp {
  /** analog join */
  join?: Join;
}
/** an item coming or going, as a table's rows do; the items after it slide */
export type ListTransition = 'fade' | 'left' | 'right' | 'top' | 'bottom' | 'middle' | 'none';
export interface ListProps extends Geom, Pick<StyleProps, 'bg' | 'theme'>, XmlProp {
  /** list join */
  join?: Join;
  orientation?: 'vertical' | 'horizontal';
  /** subpage for each item: a name, or a <Subpage> defined right here */
  item?: string | VNode;
  header?: string | VNode;
  title?: string | VNode;
  footer?: string | VNode;
  /** a swipe left on an item shows Delete; tapped, the item goes (in deleteTransition) */
  swipeDelete?: boolean;
  /** how an item CF.listAdd puts in comes (iViewer's own attribute, not GUI Designer's): default fade */
  insertTransition?: ListTransition;
  /** how an item CF.listRemove (or a swipe delete) takes out goes: default fade */
  deleteTransition?: ListTransition;
  scrollCmd?: string;
  scrollInterval?: number;
  listEndCmd?: string;
  listEndOffset?: number;
}
export interface InputProps extends Geom, StyleProps, XmlProp {
  /** serial join with the text */
  join?: Join;
  /** initial text */
  text?: string | number;
  password?: boolean;
  autoFocus?: boolean;
  /** a command sent when the user is done (Return): `[inputval]` in it is the text */
  cmd?: string;
  /** a macro run when the user is done (Return) */
  macro?: string;
  /** a command sent on each change (`[inputval]`: the text so far) */
  changeCmd?: string;
  /** a macro run on each change */
  changeMacro?: string;
}
export interface WebProps extends Geom, XmlProp {
  /** what it loads first: a URL, a file of the project (`page.html`), or `panel:/path` (a page of the panel's own web server) */
  url: string;
  /** serial join: the URL (setting it loads it) */
  join?: Join;
  /** serial join: the page's title */
  titleJoin?: Join;
  /** digital joins: back, forward, reload, stop (on a press) */
  backJoin?: Join;
  forwardJoin?: Join;
  refreshJoin?: Join;
  stopJoin?: Join;
}
/**
 * A web page the panel serves itself: iva bundles `entry` (a JavaScript /
 * TypeScript module, with the npm packages it imports - uplot, chart.js and
 * three come with iva - and `iva/web` to talk to the panel) into one script
 * shipped with the .gui; the panel's own web server (one TCP system for all
 * of them, <Project httpPort>) sends it to the web view, at /<name>/.
 */
export interface WebAppProps extends Geom, XmlProp {
  /** the app's module ('./web/house.js'), or one iva brings ('iva:trend', 'iva:chart') */
  entry: string;
  /** names it: its path on the panel's web server (/<name>/) and its file in the build (default: from the entry's file name) */
  name?: string;
  /** joins the app sees and sets, by the names it uses: { kitchen: d('kitchenLight'), temp: a('temp') } */
  joins?: Record<string, Join>;
  /** settings for the app, as JSON (panel.options) */
  options?: Record<string, unknown>;
  /** panel functions it may call (panel.call(name, ...args)), by name: { history: 'plantHistory' } */
  handlers?: Record<string, string>;
  /** the panel keeps the joins' numbers every `every` seconds, the last `keep` (panel.history) */
  record?: { every?: number; keep?: number; names?: string[] };
  /** the page's colour until it draws (default black) */
  bg?: string;
  title?: string;
  tags?: string | string[];
}
/**
 * An HTTP server on the panel: a TCP system accepting connections on `port`
 * and `handler(req, res)` (a panel function: its name, or a function as
 * text) answering each request - see IvaHttp.serve.
 */
export interface HttpServerProps {
  name: string;
  port: number;
  handler: string;
}
export interface VideoProps extends Geom, XmlProp {
  url: string;
  join?: number;
  playJoin?: number;
  stopJoin?: number;
  format?: 'mjpeg' | 'mpeg4';
  autoplay?: boolean;
  controls?: boolean;
  bg?: string;
  cache?: boolean;
  auth?: { user?: string; password?: string; realm?: string; host?: string; method?: 'basic' | 'digest'; proxy?: string };
}
/** js code, or set a join: { join: 'd10', value: 1 } ([x], [y] tokens allowed) */
/**
 * What a gesture phase does: a script, or any of - a join set to a value
 * (its [x] [y] [deltax] [scale] [rotation] [velocity] ... tokens and {{math}}
 * in), a token set (on `tokenJoin`, else a global one), a command, a macro,
 * a page flipped to (in `transition`, which also goes for the subpages it
 * shows or hides), after `delay` ms.
 */
export type GestureAction = string | {
  js?: string;
  join?: string | JoinRef;
  value?: string | number;
  token?: string;
  tokenJoin?: string | JoinRef;
  cmd?: string;
  macro?: string;
  page?: string;
  transition?: Transition;
  /** ms */
  delay?: number;
};
export interface GestureProps extends XmlProp {
  type: 'tap' | 'swipe' | 'pan' | 'press' | 'rotate' | 'pinch';
  name?: string;
  touches?: number;
  taps?: number;
  direction?: 'left' | 'right' | 'up' | 'down';
  onBegin?: GestureAction | GestureAction[];
  onChange?: GestureAction | GestureAction[];
  onEnd?: GestureAction | GestureAction[];
}
export interface SystemProps extends XmlProp {
  name: string;
  /** IP or host name of the remote ('127.0.0.1' = loopback, handled inside the panel; '0.0.0.0' for a server) */
  host: string;
  /** the remote port (a TCP server listens on localPort) */
  port: number;
  /** 'tcp' (default), 'udp', 'http' */
  protocol?: 'tcp' | 'udp' | 'http' | 'sip';
  /** local port: the source port; a TCP server's listening port */
  localPort?: number;
  /** TCP: be a server (accept connections); UDP: accept incoming (default true) */
  accept?: boolean;
  /** UDP: accept broadcasts (default true) */
  acceptBroadcasts?: boolean;
  /** end of message, e.g. '\\x0D' */
  eom?: string;
  /** TCP client: 'alwaysOn' (default) stays connected; 'transitory' connects to send, then
   * disconnects after idleTimeout; 'dialog' also waits for each reply (dialogTimeout) */
  mode?: 'alwaysOn' | 'transitory' | 'dialog';
  /** ms a transitory / dialog connection stays open with no traffic */
  idleTimeout?: number;
  /** ms to wait for a reply in dialog mode (0 = for ever) */
  dialogTimeout?: number;
  /** TCP: queue what's sent while offline (default true) */
  offlineQueue?: boolean;
  /** digital join, on while connected */
  connectJoin?: Join;
  /** digital join, on while disconnected */
  disconnectJoin?: Join;
  /** heartbeat: 'reply' answers rx with tx; 'initiate' sends tx and expects rx */
  heartbeat?: { mode: 'reply' | 'initiate'; tx?: string; rx?: string };
  ssl?: boolean;
  textEncoding?: string;
  /** name of a JavaScript function that sends the data instead of the system */
  sendHandler?: string;
  startupCmd?: string;
  startupMacro?: string;
  /** TCP server: connections at most (0 = no limit) */
  maxConnections?: number;
  children?: Child;
}
export interface CommandProps extends XmlProp {
  name: string;
  /** what it sends (also as children); \\xNN escapes, [tokens] */
  send?: string;
  js?: string;
  /** js sends the data itself (default: the command sends too) */
  jsSendsCommand?: boolean;
  /** set a join instead of / besides sending: target 'd10', value '1' */
  target?: string | JoinRef;
  value?: string | number;
  folder?: string;
  children?: Child;
}
export interface FeedbackProps extends XmlProp {
  name: string;
  /** regular expression; (?ims) flags allowed at the start */
  regex: string;
  children?: Child;
}
export interface CaptureProps extends XmlProp {
  /** how the capture is read (default: the join's type): 'a' = a number
   * (transform, min / max), 'd' = on / off (onVal / offVal), 's' = text.
   * `type="a" join="s2"` puts a number, transformed, into serial join 2. */
  type?: 'd' | 'a' | 's';
  /** capture group (default 1) */
  index?: number;
  /** the join that gets it: d(5), 's:title', 'a10' ... */
  join: string | JoinRef;
  /** token name for <OnMatch> ($name$) */
  name?: string;
  /** digital: these captures turn it on / off */
  onVal?: string;
  offVal?: string;
  /** analog: '{{value * 2}}' */
  transform?: string;
  min?: number;
  max?: number;
  unit?: 'decimal' | 'hex' | 'hexb';
  setToken?: boolean;
}
export interface OnMatchProps extends XmlProp {
  target?: string | JoinRef;
  value?: string | number;
  cmd?: string;
  token?: string;
}
export interface MacroProps extends XmlProp {
  name: string;
  children?: Child;
}
export interface StepProps extends XmlProp {
  /** command name */
  command: string;
  /** ms after the previous step runs (the delays add up, as iViewer runs a macro; the first: after the start) */
  delay?: number;
}
export interface TokenProps extends XmlProp {
  /** [brackets] optional */
  name: string;
  value?: string | number;
  persist?: boolean;
}
export interface ScriptProps extends XmlProp {
  /** a .js file (relative to the .jsx) */
  src?: string;
  /** name in the project (default: the file name) */
  name?: string;
  /** inline code instead of src */
  code?: string;
}
export interface SoundProps extends XmlProp {
  name: string;
  src: string;
  /** digital join that plays it */
  join?: Join;
  loop?: boolean;
  releaseStop?: boolean;
}
export interface ThemeProps extends Omit<StyleProps, 'theme'>, XmlProp {
  name: string;
  /** the CSS of each state, exactly as written (instead of style props) */
  states?: string[];
  type: 'button' | 'text' | 'background' | 'gauge' | 'input' | 'list';
  /** style when active (buttons) */
  active?: StyleProps;
}

/** A drawn rounded rectangle (an image that lets touches through): card / bar / track backgrounds. */
export interface BoxProps extends Geom, XmlProp {
  bg?: string;
  radius?: number;
  borderWidth?: number;
  borderColor?: string;
}
/** Its children, moved by x / y: lay a card's content out relative to the card. */
export interface GroupProps {
  x?: number;
  y?: number;
  children?: Child;
}
/** JavaScript run once the panel has started (all OnStart code: one CF.modules setup, in order). */
export interface OnStartProps {
  js: string;
  /** joins the code uses that no element does (so named ones get numbers): d('x'), 's12', ... */
  joins?: (string | JoinRef)[];
}

/** A .gui element written as is: `<Raw xml='<timer j="1" interval="0" />' />` */
export interface RawProps {
  xml: string;
}

export const Raw: Component<RawProps> = intrinsic<RawProps>('Raw');
export const Box: Component<BoxProps> = intrinsic<BoxProps>('Box');
export const Group: Component<GroupProps> = intrinsic<GroupProps>('Group');
export const OnStart: Component<OnStartProps> = intrinsic<OnStartProps>('OnStart');
export const Project: Component<ProjectProps> = intrinsic<ProjectProps>('Project');
export const Page: Component<PageProps> = intrinsic<PageProps>('Page');
export const Landscape: Component<OrientationProps> = intrinsic<OrientationProps>('Landscape');
export const Portrait: Component<OrientationProps> = intrinsic<OrientationProps>('Portrait');
export const Subpage: Component<SubpageProps> = intrinsic<SubpageProps>('Subpage');
export const SubpageRef: Component<SubpageRefProps> = intrinsic<SubpageRefProps>('SubpageRef');
export const Button: Component<ButtonProps> = intrinsic<ButtonProps>('Button');
export const Text: Component<TextProps> = intrinsic<TextProps>('Text');
export const Image: Component<ImageProps> = intrinsic<ImageProps>('Image');
export const Slider: Component<SliderProps> = intrinsic<SliderProps>('Slider');
export const Gauge: Component<GaugeProps> = intrinsic<GaugeProps>('Gauge');
export const List: Component<ListProps> = intrinsic<ListProps>('List');
export const Input: Component<InputProps> = intrinsic<InputProps>('Input');
export const Web: Component<WebProps> = intrinsic<WebProps>('Web');
export const Video: Component<VideoProps> = intrinsic<VideoProps>('Video');
export const WebApp: Component<WebAppProps> = intrinsic<WebAppProps>('WebApp');
export const HttpServer: Component<HttpServerProps> = intrinsic<HttpServerProps>('HttpServer');
export const Gesture: Component<GestureProps> = intrinsic<GestureProps>('Gesture');
export const System: Component<SystemProps> = intrinsic<SystemProps>('System');
export const Command: Component<CommandProps> = intrinsic<CommandProps>('Command');
export const Feedback: Component<FeedbackProps> = intrinsic<FeedbackProps>('Feedback');
export const Capture: Component<CaptureProps> = intrinsic<CaptureProps>('Capture');
export const OnMatch: Component<OnMatchProps> = intrinsic<OnMatchProps>('OnMatch');
export const Macro: Component<MacroProps> = intrinsic<MacroProps>('Macro');
export const Step: Component<StepProps> = intrinsic<StepProps>('Step');
export const Token: Component<TokenProps> = intrinsic<TokenProps>('Token');
export const Script: Component<ScriptProps> = intrinsic<ScriptProps>('Script');
export const Sound: Component<SoundProps> = intrinsic<SoundProps>('Sound');
export const Theme: Component<ThemeProps> = intrinsic<ThemeProps>('Theme');

const PLACEMENT = ['x', 'y', 'join', 'visible', 'in', 'out', 'topmost', 'fixed', 'clickthrough', 'tags'];

/** The props each element takes (children aside).
 * @internal */
export const PROPS: Record<string, string[]> = {
  Project: ['name', 'device', 'orientation', 'width', 'height', 'otherSize', 'autoposition', 'sizes', 'joinBase', 'assets', 'properties', 'licenses', 'themes', 'theme', 'folders', 'httpPort'],
  Page: ['name', 'start', 'bg', 'image', 'tile', 'theme', 'tags', 'transition'],
  Landscape: ['bg', 'image', 'tile', 'theme'],
  Portrait: ['bg', 'image', 'tile', 'theme'],
  Subpage: ['name', 'w', 'h', 'clip', 'define', 'bg', 'image', 'tile', 'radius', 'borderWidth', 'borderColor', 'theme', ...PLACEMENT],
  SubpageRef: ['name', ...PLACEMENT],
  Button: [...GEOM, 'tags', 'join', 'feedback', 'text', 'activeText', 'textJoin', 'activeTextJoin', 'icon', 'activeIcon', 'active',
    'iconAlign', 'page', 'href', 'cmd', 'js', 'repeat', 'onPress', 'onRelease', 'onHold', 'holdTime', ...STYLE],
  Text: [...GEOM, 'tags', 'join', 'text', 'wrap', ...STYLE],
  Image: [...GEOM, 'tags', 'src', 'join', 'clickthrough', 'refresh', 'noCache', 'downloadIndicator', 'clearOnURLChange'],
  Slider: [...GEOM, 'tags', 'join', 'pressJoin', 'min', 'max', 'decimals', 'invert', 'feedback', 'thumb', 'activeThumb', 'thumbColor', 'thumbSize',
    'dragCmd', 'pressCmd', 'releaseCmd', ...METER],
  Gauge: [...GEOM, 'tags', 'join', ...METER],
  List: [...GEOM, 'tags', 'join', 'orientation', 'item', 'header', 'title', 'footer', 'swipeDelete', 'insertTransition', 'deleteTransition', 'scrollCmd', 'scrollInterval', 'listEndCmd', 'listEndOffset', 'bg', 'theme'],
  Input: [...GEOM, 'tags', 'join', 'text', 'password', 'autoFocus', 'cmd', 'macro', 'changeCmd', 'changeMacro', ...STYLE],
  Web: [...GEOM, 'tags', 'url', 'join', 'titleJoin', 'backJoin', 'forwardJoin', 'refreshJoin', 'stopJoin'],
  Video: [...GEOM, 'tags', 'url', 'join', 'playJoin', 'stopJoin', 'format', 'autoplay', 'controls', 'bg', 'cache', 'auth'],
  WebApp: [...GEOM, 'tags', 'entry', 'name', 'joins', 'options', 'handlers', 'record', 'bg', 'title'],
  HttpServer: ['name', 'port', 'handler'],
  Gesture: ['type', 'name', 'touches', 'taps', 'direction', 'onBegin', 'onChange', 'onEnd'],
  System: ['name', 'host', 'port', 'protocol', 'localPort', 'accept', 'acceptBroadcasts', 'eom', 'mode', 'idleTimeout', 'dialogTimeout', 'offlineQueue',
    'connectJoin', 'disconnectJoin', 'heartbeat', 'ssl', 'textEncoding', 'sendHandler', 'startupCmd', 'startupMacro', 'maxConnections'],
  Command: ['name', 'send', 'js', 'jsSendsCommand', 'target', 'value', 'folder'],
  Feedback: ['name', 'regex'],
  Capture: ['index', 'join', 'type', 'name', 'onVal', 'offVal', 'transform', 'min', 'max', 'unit', 'setToken'],
  OnMatch: ['target', 'value', 'cmd', 'token'],
  Macro: ['name'],
  Step: ['command', 'delay'],
  Token: ['name', 'value', 'persist'],
  Script: ['src', 'name', 'code'],
  Sound: ['name', 'src', 'join', 'loop', 'releaseStop'],
  Theme: ['name', 'type', 'active', 'states', ...STYLE.filter((p) => p !== 'theme')],
  Raw: ['xml'],
  Box: [...GEOM, 'tags', 'bg', 'radius', 'borderWidth', 'borderColor'],
  Group: ['x', 'y'],
  OnStart: ['js', 'joins'],
};
for (const [name, props] of Object.entries(PROPS)) if (!['Raw', 'Group', 'OnStart', 'HttpServer'].includes(name)) props.push('xml');

/** Required props (a missing one is an error).
 * @internal */
export const REQUIRED: Record<string, string[]> = {
  Project: ['name'],
  Page: ['name'],
  Subpage: ['name', 'w', 'h'],
  SubpageRef: ['name'],
  Button: ['w', 'h'], Text: ['w', 'h'], Image: ['w', 'h'], Slider: ['w', 'h'], Gauge: ['w', 'h'],
  List: ['w', 'h'], Input: ['w', 'h'], Web: ['w', 'h', 'url'], Video: ['w', 'h', 'url'],
  WebApp: ['w', 'h', 'entry'], HttpServer: ['name', 'port', 'handler'],
  Gesture: ['type'],
  System: ['name', 'host', 'port'],
  Command: ['name'],
  Feedback: ['name', 'regex'],
  Capture: ['join'],
  Macro: ['name'],
  Step: ['command'],
  Token: ['name'],
  Sound: ['name', 'src'],
  Theme: ['name', 'type'],
  Raw: ['xml'],
  Box: ['w', 'h'],
  OnStart: ['js'],
};

/** Style props allowed inside `active={{...}}` and <Theme>.
 * @internal */
export const STYLE_PROPS = STYLE;

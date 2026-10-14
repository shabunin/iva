/**
 * iva's base elements: one per CommandFusion .gui object, plus helpers.
 * `PROPS` (the props each element takes) drives validation; the interfaces
 * give editors completion. What each becomes in the .gui: docs/components.md.
 */

import { intrinsic, type Child, type VNode } from './runtime.js';

// ── values ─────────────────────────────────────────────────────────

export type JoinType = 'd' | 'a' | 's' | 'l';
/** A join of a given type: a number, or a name iva gives a number to. */
export interface JoinRef {
  $$join: 1;
  type: JoinType;
  id: number | string;
}
const joinRef = (type: JoinType) => (id: number | string): JoinRef => ({ $$join: 1, type, id });
/** digital join: `d(12)`, `d('power')` */
export const d = joinRef('d');
/** analog join */
export const a = joinRef('a');
/** serial join */
export const s = joinRef('s');
/** list join */
export const l = joinRef('l');

/** A join prop whose type the element fixes: `join={12}`, `join="power"` (named) or `d(12)`. */
export type Join = number | string | JoinRef;

export interface ImageRef {
  src: string;
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

/** What a button does: a command name (string), or cmd()/macro()/js(). */
export interface Action {
  $$action: 1;
  kind: 'command' | 'macro' | 'js';
  value: string;
  delay?: number;
  repeat?: number;
}
export interface ActionOptions {
  /** ms after the press (release) before it runs */
  delay?: number;
  /** ms between repeats while held */
  repeat?: number;
}
const action = (kind: Action['kind']) => (value: string, opts: ActionOptions = {}): Action => ({ $$action: 1, kind, value, ...opts });
/** run a <Command> by name */
export const cmd = action('command');
/** run a <Macro> by name */
export const macro = action('macro');
/** run JavaScript */
export const js = action('js');
export type ActionList = (string | Action)[] | string | Action;

// ── style ──────────────────────────────────────────────────────────

/** Turned into a theme (.gui CSS), shared by every element with the same style. */
export interface StyleProps extends XmlProp {
  /** background colour: '#203040', 'rgba(0,0,0,0.5)', '#20304080' */
  bg?: string;
  /** background image (a file, relative to the .jsx) */
  image?: string;
  /** 9-slice the image: px from each edge, `12` or `[top, right, bottom, left]` */
  slice?: number | [number, number, number, number];
  color?: string;
  font?: string;
  /** iOS font name (CSS `font-name`), e.g. 'HelveticaNeue-Bold' */
  fontName?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  /** text shadow: CSS text, or { color, x, y, blur } */
  shadow?: string | { color?: string; x?: number; y?: number; blur?: number };
  opacity?: number;
  padding?: number | [number, number, number, number];
  borderWidth?: number;
  borderColor?: string;
  /** extra CSS, appended as is */
  css?: string;
  /** use a <Theme> by name instead of a generated one */
  theme?: string;
}

const STYLE = ['bg', 'image', 'slice', 'color', 'font', 'fontName', 'fontSize', 'bold', 'italic', 'align', 'valign', 'shadow', 'opacity', 'padding', 'borderWidth', 'borderColor', 'css', 'theme'];
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
  topmost?: boolean;
  clickthrough?: boolean;
  tags?: string | string[];
}

// ── elements ───────────────────────────────────────────────────────

/** Every element takes `xml`: raw attributes for the .gui element, over what
 * iva writes (`null` removes one). For what iva doesn't model. */
interface XmlProp {
  xml?: Record<string, string | number | null>;
}

export interface ProjectProps extends XmlProp {
  name: string;
  /** the panel size; width > height makes landscape the main orientation */
  width: number;
  height: number;
  /** the other orientation's size (default: width and height swapped) */
  otherSize?: [number, number];
  autoposition?: 'scale' | 'none' | null;
  /** first number given to named joins (default 1000) */
  joinBase?: number;
  /** a folder whose files all ship with the project; images are also found
   * there by bare name, as iViewer finds them (default './assets', if it exists) */
  assets?: string;
  /** raw XML for <properties> after <size> (default: iva's) */
  properties?: string;
  children?: Child;
}
export interface PageProps extends Pick<StyleProps, 'bg' | 'image' | 'theme'>, XmlProp {
  name: string;
  /** the page shown at start (default: the first page) */
  start?: boolean;
  tags?: string | string[];
  children?: Child;
}
export interface OrientationProps extends Pick<StyleProps, 'bg' | 'image' | 'theme'>, XmlProp {
  children?: Child;
}
export interface SubpageProps extends Placement, Pick<StyleProps, 'bg' | 'image' | 'theme'>, XmlProp {
  name: string;
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
  icon?: string | ImageRef;
  activeIcon?: string | ImageRef;
  /** style when active (pressed / on), over the normal style */
  active?: StyleProps;
  /** go to this page on release ('Return' = previous page) */
  page?: string;
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
  /** a file (relative to the .jsx) or a URL */
  src?: string;
  /** serial join holding the image file / URL */
  join?: Join;
  clickthrough?: boolean;
  /** reload a URL every N ms */
  refresh?: number;
  noCache?: boolean;
  downloadIndicator?: boolean;
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
export interface ListProps extends Geom, Pick<StyleProps, 'bg' | 'theme'>, XmlProp {
  /** list join */
  join?: Join;
  orientation?: 'vertical' | 'horizontal';
  /** subpage for each item: a name, or a <Subpage> defined right here */
  item?: string | VNode;
  header?: string | VNode;
  title?: string | VNode;
  footer?: string | VNode;
  swipeDelete?: boolean;
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
}
export interface WebProps extends Geom, XmlProp {
  url: string;
  join?: number;
  titleJoin?: number;
  backJoin?: number;
  forwardJoin?: number;
  refreshJoin?: number;
  stopJoin?: number;
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
export type GestureAction = string | { js?: string; join?: string | JoinRef; value?: string | number };
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
  /** IP or host name ('127.0.0.1' = loopback, handled inside the panel) */
  host: string;
  port: number;
  protocol?: 'tcp' | 'udp';
  /** local (source) port */
  localPort?: number;
  /** listen for connections (server) */
  accept?: boolean;
  acceptBroadcasts?: boolean;
  /** end of message, e.g. '\\x0D' */
  eom?: string;
  /** keep connected (default true) */
  alwaysOn?: boolean;
  offlineQueue?: boolean;
  /** digital join, on while connected */
  connectJoin?: Join;
  disconnectJoin?: Join;
  heartbeat?: { tx?: string; rx?: string; mode?: number };
  startupCmd?: string;
  startupMacro?: string;
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
  /** ms from the macro start */
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

/** A .gui element written as is: `<Raw xml='<timer j="1" interval="0" />' />` */
export interface RawProps {
  xml: string;
}

export const Raw = intrinsic<RawProps>('Raw');
export const Project = intrinsic<ProjectProps>('Project');
export const Page = intrinsic<PageProps>('Page');
export const Landscape = intrinsic<OrientationProps>('Landscape');
export const Portrait = intrinsic<OrientationProps>('Portrait');
export const Subpage = intrinsic<SubpageProps>('Subpage');
export const SubpageRef = intrinsic<SubpageRefProps>('SubpageRef');
export const Button = intrinsic<ButtonProps>('Button');
export const Text = intrinsic<TextProps>('Text');
export const Image = intrinsic<ImageProps>('Image');
export const Slider = intrinsic<SliderProps>('Slider');
export const Gauge = intrinsic<GaugeProps>('Gauge');
export const List = intrinsic<ListProps>('List');
export const Input = intrinsic<InputProps>('Input');
export const Web = intrinsic<WebProps>('Web');
export const Video = intrinsic<VideoProps>('Video');
export const Gesture = intrinsic<GestureProps>('Gesture');
export const System = intrinsic<SystemProps>('System');
export const Command = intrinsic<CommandProps>('Command');
export const Feedback = intrinsic<FeedbackProps>('Feedback');
export const Capture = intrinsic<CaptureProps>('Capture');
export const OnMatch = intrinsic<OnMatchProps>('OnMatch');
export const Macro = intrinsic<MacroProps>('Macro');
export const Step = intrinsic<StepProps>('Step');
export const Token = intrinsic<TokenProps>('Token');
export const Script = intrinsic<ScriptProps>('Script');
export const Sound = intrinsic<SoundProps>('Sound');
export const Theme = intrinsic<ThemeProps>('Theme');

const PLACEMENT = ['x', 'y', 'join', 'visible', 'in', 'out', 'topmost', 'clickthrough', 'tags'];

/** The props each element takes (children aside). */
export const PROPS: Record<string, string[]> = {
  Project: ['name', 'width', 'height', 'otherSize', 'autoposition', 'joinBase', 'assets', 'properties'],
  Page: ['name', 'start', 'bg', 'image', 'theme', 'tags'],
  Landscape: ['bg', 'image', 'theme'],
  Portrait: ['bg', 'image', 'theme'],
  Subpage: ['name', 'w', 'h', 'clip', 'bg', 'image', 'theme', ...PLACEMENT],
  SubpageRef: ['name', ...PLACEMENT],
  Button: [...GEOM, 'tags', 'join', 'feedback', 'text', 'activeText', 'textJoin', 'activeTextJoin', 'icon', 'activeIcon', 'active',
    'page', 'cmd', 'js', 'repeat', 'onPress', 'onRelease', 'onHold', 'holdTime', ...STYLE],
  Text: [...GEOM, 'tags', 'join', 'text', 'wrap', ...STYLE],
  Image: [...GEOM, 'tags', 'src', 'join', 'clickthrough', 'refresh', 'noCache', 'downloadIndicator', 'clearOnURLChange'],
  Slider: [...GEOM, 'tags', 'join', 'pressJoin', 'min', 'max', 'decimals', 'invert', 'feedback', 'thumb', 'activeThumb', 'thumbColor', 'thumbSize',
    'dragCmd', 'pressCmd', 'releaseCmd', ...METER],
  Gauge: [...GEOM, 'tags', 'join', ...METER],
  List: [...GEOM, 'tags', 'join', 'orientation', 'item', 'header', 'title', 'footer', 'swipeDelete', 'scrollCmd', 'scrollInterval', 'listEndCmd', 'listEndOffset', 'bg', 'theme'],
  Input: [...GEOM, 'tags', 'join', 'text', 'password', 'autoFocus', ...STYLE],
  Web: [...GEOM, 'tags', 'url', 'join', 'titleJoin', 'backJoin', 'forwardJoin', 'refreshJoin', 'stopJoin'],
  Video: [...GEOM, 'tags', 'url', 'join', 'playJoin', 'stopJoin', 'format', 'autoplay', 'controls', 'bg', 'cache', 'auth'],
  Gesture: ['type', 'name', 'touches', 'taps', 'direction', 'onBegin', 'onChange', 'onEnd'],
  System: ['name', 'host', 'port', 'protocol', 'localPort', 'accept', 'acceptBroadcasts', 'eom', 'alwaysOn', 'offlineQueue', 'connectJoin', 'disconnectJoin',
    'heartbeat', 'startupCmd', 'startupMacro', 'maxConnections'],
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
};
for (const [name, props] of Object.entries(PROPS)) if (name !== 'Raw') props.push('xml');

/** Required props (a missing one is an error). */
export const REQUIRED: Record<string, string[]> = {
  Project: ['name', 'width', 'height'],
  Page: ['name'],
  Subpage: ['name', 'w', 'h'],
  SubpageRef: ['name'],
  Button: ['w', 'h'], Text: ['w', 'h'], Image: ['w', 'h'], Slider: ['w', 'h'], Gauge: ['w', 'h'],
  List: ['w', 'h'], Input: ['w', 'h'], Web: ['w', 'h', 'url'], Video: ['w', 'h', 'url'],
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
};

/** Style props allowed inside `active={{...}}` and <Theme>. */
export const STYLE_PROPS = STYLE;

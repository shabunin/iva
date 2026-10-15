/**
 * iva/ui - components for iViewer panels, in a theme.
 *
 *   import { createUi } from 'iva/ui';
 *   export const ui = createUi({ accent: '#0A84FF' });   // components/ui.js
 *   const { Card, Tile, Toggle } = ui;
 *
 * or with the default look:  import { Card, Tile } from 'iva/ui';
 *
 * Every component returns ordinary iva elements (Button, Text, Box, Slider,
 * Subpage...), so what it makes is what the .gui holds. Rounded shapes and
 * icons are drawn by iva (Font Awesome names: icon="lightbulb"). What has to
 * happen on the panel (value labels, steppers, one-of-several, the clock,
 * the side menu) is a small script, iva-ui.js, that comes with them.
 */

import {
  Box, Button as IvaButton, Feedback, Gesture, Group, Image, Input, List, OnStart, Script, Slider as IvaSlider, Subpage, System, Text as IvaText, Web,
  a, d, draw, fa, js as jsAction, l, s, variant,
  type ButtonProps, type Child, type IconRef, type Join, type JoinRef, type TextProps, type VNode,
} from 'iva';
import { UI_RUNTIME } from './runtime.js';

export interface UiTheme {
  /** page background */
  page: string;
  /** header / side menu */
  bar: string;
  /** cards, tiles */
  surface: string;
  /** buttons, tracks, rows on a surface */
  raised: string;
  /** on / active / progress */
  accent: string;
  text: string;
  /** secondary text, inactive icons */
  muted: string;
  danger: string;
  warning: string;
  /** font family (iOS / Android name) */
  font: string;
  /** corner radius of rounded shapes */
  radius: number;
  /** the panel size: Header, SideMenu, dialogs use it */
  panel: { width: number; height: number };
}

export const defaultTheme: UiTheme = {
  page: '#14171A',
  bar: '#1C2024',
  surface: '#22272C',
  raised: '#2B3137',
  accent: '#00BC97',
  text: '#FFFFFF',
  muted: '#8A949C',
  danger: '#E5484D',
  warning: '#FFB000',
  font: 'Helvetica Neue',
  radius: 12,
  panel: { width: 1280, height: 800 },
};

/** The light look, the same keys: <Project themes={['dark', 'light']}> builds the panel in both. */
export const lightTheme: UiTheme = {
  ...defaultTheme,
  page: '#EEF1F4',
  bar: '#FFFFFF',
  surface: '#FFFFFF',
  raised: '#E3E7EB',
  accent: '#00A884',
  text: '#14171A',
  muted: '#66717B',
  danger: '#D93A3F',
  warning: '#E08A00',
};

type Tone = 'accent' | 'danger' | 'warning' | 'muted';
/** Button props a component passes through: what it does when pressed. */
type Actions = Pick<ButtonProps, 'cmd' | 'js' | 'page' | 'onPress' | 'onRelease' | 'onHold' | 'holdTime' | 'repeat'>;

export interface CardProps {
  title?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** placed relative to the card */
  children?: Child;
}
export interface IconProps {
  icon: string;
  size?: number;
  color?: string;
  x?: number;
  y?: number;
}
export interface IconButtonProps extends Actions {
  icon?: string;
  text?: string;
  /** 'raised' (default), 'accent', 'danger', or 'flat' (no background) */
  tone?: 'raised' | 'accent' | 'danger' | 'flat';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** icon size (default: 40 % of the height) */
  size?: number;
  join?: Join;
  feedback?: ButtonProps['feedback'];
}
export interface TileProps extends Actions {
  icon: string;
  title: string;
  status?: string;
  /** serial join for the status line */
  statusJoin?: Join;
  /** digital join: on = the tile lit */
  join?: Join;
  feedback?: ButtonProps['feedback'];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface BadgeProps {
  text?: string;
  tone?: Tone;
  /** a dot before the text */
  dot?: boolean;
  /** digital join: shows `on` (in the tone) / `off` (muted) */
  join?: Join;
  on?: string;
  off?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface StatProps {
  icon: string;
  label: string;
  value?: string;
  /** serial join with the value */
  valueJoin?: Join;
  color?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface ToggleProps extends Actions {
  label?: string;
  /** digital join */
  join: Join;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface SliderProps {
  label?: string;
  /** analog join (0..65535, standing for min..max) */
  join: Join;
  min?: number;
  max?: number;
  /** where it starts, in min..max */
  value?: number;
  /** the value next to the bar ('%' default; '' none) */
  unit?: string;
  decimals?: number;
  showValue?: boolean;
  /** command run while dragging ([sliderval] = the value) */
  dragCmd?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface StepperProps {
  /** analog join (0..65535, standing for min..max) */
  join: Join;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface SegmentedProps {
  options: string[];
  /** analog join: the index chosen */
  join: Join;
  value?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface SceneBarProps {
  scenes: { icon: string; title: string; cmd?: string }[];
  /** analog join: the index of the scene on */
  join: Join;
  value?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  gap?: number;
}
export interface DimmerProps {
  label: string;
  icon?: string;
  /** digital join: on / off */
  on: Join;
  /** analog join: the level, 0..100 */
  level: Join;
  x?: number;
  y?: number;
  w?: number;
}
export interface BlindsProps {
  label: string;
  /** analog join: the position, 0..100 */
  position: Join;
  /** commands for the buttons */
  onOpen?: string;
  onStop?: string;
  onClose?: string;
  x?: number;
  y?: number;
  w?: number;
}
export interface DialProps {
  /** analog join (0..65535, standing for min..max) */
  join: Join;
  min?: number;
  max?: number;
  /** where it starts, in min..max */
  value?: number;
  /** a touch / the -+ buttons snap to this */
  step?: number;
  decimals?: number;
  unit?: string;
  /** under the value */
  label?: string;
  /** serial join for the label */
  labelJoin?: Join;
  size?: number;
  /** ring thickness (default: 7.5 % of the size) */
  thickness?: number;
  color?: string;
  /** degrees of the ring (default 270, the gap at the bottom) */
  sweep?: number;
  /** arc frames drawn (default 50: every 2 %) */
  steps?: number;
  x?: number;
  y?: number;
}
export interface KnobProps {
  /** analog join (0..65535, standing for min..max) */
  join: Join;
  min?: number;
  max?: number;
  value?: number;
  step?: number;
  decimals?: number;
  unit?: string;
  label?: string;
  size?: number;
  /** the knob */
  color?: string;
  /** its pointer */
  pointer?: string;
  sweep?: number;
  x?: number;
  y?: number;
}
export interface ThermostatProps {
  /** analog join: the setpoint (0..65535, standing for min..max) */
  setpoint: Join;
  value?: number;
  /** the room temperature: text, or a serial join */
  current?: string;
  currentJoin?: Join;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  size?: number;
  /** modes under it (Segmented), the index in `mode` */
  modes?: string[];
  mode?: Join;
  modeValue?: number;
  x?: number;
  y?: number;
}
export interface RadioGroupProps {
  options: string[];
  /** analog join: the index chosen */
  join: Join;
  value?: number;
  x?: number;
  y?: number;
  w?: number;
  /** a row's height */
  rowH?: number;
}
export interface CheckBoxProps {
  label: string;
  /** digital join */
  join: Join;
  value?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface CheckBoxGroupProps {
  options: { label: string; join: Join; value?: boolean }[];
  x?: number;
  y?: number;
  w?: number;
  rowH?: number;
}
export interface SelectBoxProps {
  options: string[];
  /** analog join: the index chosen */
  join: Join;
  value?: number;
  /** the sheet's title */
  title?: string;
  /** 'sheet' (default: a dialog over the page) or 'dropdown' (a list under the field) */
  mode?: 'sheet' | 'dropdown';
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface ListRowProps extends Actions {
  icon?: string;
  title: string;
  subtitle?: string;
  /** on the right: a value (text, or a serial join) */
  value?: string;
  valueJoin?: Join;
  /** on the right: an ON / OFF toggle on this digital join */
  toggle?: Join;
  /** on the right: a chevron (the row goes somewhere: page / js / cmd) */
  chevron?: boolean;
  divider?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export type DataListItem =
  | { header: string }
  | { spacer: true }
  | { icon?: string; title: string; subtitle?: string; value?: string; alert?: boolean };
export interface DataListProps {
  /** list join */
  join: Join;
  items: DataListItem[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface ScrollBoxProps {
  /** list join */
  join: Join;
  lines: string[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rowH?: number;
}
export interface WeekDaysProps {
  /** analog join: the bitmask (Mon 1, Tue 2, Wed 4 ... Sun 64) */
  join: Join;
  value?: number;
  /** 'mon' (default) or 'sun' first */
  first?: 'mon' | 'sun';
  /** seven labels, Monday first (default Mo Tu We Th Fr Sa Su) */
  labels?: string[];
  /** a serial join that gets the summary ("Weekdays", "Sun, Mon", ...) */
  textJoin?: Join;
  size?: number;
  gap?: number;
  x?: number;
  y?: number;
}
export interface PinPadProps {
  /** serial join: OK writes the code here */
  code?: Join;
  /** JavaScript run on OK, with `code` (a string) */
  onEnter?: string;
  length?: number;
  /** show dots, not the digits (default true) */
  mask?: boolean;
  placeholder?: string;
  /** a key's size */
  size?: number;
  gap?: number;
  x?: number;
  y?: number;
}
export interface ColorPickerProps {
  /** analog joins: red, green, blue, 0..255 - written as you pick, followed when they change elsewhere */
  r: Join;
  g: Join;
  b: Join;
  /** serial join: the colour as #RRGGBB */
  hex?: Join;
  /** the colour at start ('#FFB000'); default: what r / g / b hold */
  value?: string;
  /** the wheel's diameter */
  size?: number;
  /** colours one tap away (false: none) */
  swatches?: string[] | false;
  /** JavaScript run on each pick, with r, g, b (numbers) and hex */
  onChange?: string;
  /** the port of the panel's own HTTP server that shows the swatch (a web view loads the colour from it) */
  port?: number;
  /** what's behind it (the swatch's corners are drawn in it): default the card colour */
  bg?: string;
  x?: number;
  y?: number;
}
export interface TextFieldProps {
  /** serial join: the text (typing writes it) */
  join: Join;
  label?: string;
  /** the text at start */
  value?: string;
  /** shown while it's empty */
  placeholder?: string;
  password?: boolean;
  /** a Font Awesome icon on the left */
  icon?: string;
  /** a command sent on Return ([inputval]: the text) */
  cmd?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
/** Where a picker opens: 'sheet' (a dialog in the middle of the panel) or 'dropdown' (under the field). */
type PopupMode = 'sheet' | 'dropdown';
interface FieldProps {
  mode?: PopupMode;
  /** the sheet's title */
  title?: string;
  /** the field's text size */
  fontSize?: number;
  /** the icon at the field's right (default true) */
  showIcon?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface SearchSelectProps extends FieldProps {
  /** the options; or `source` */
  options?: string[];
  /** serial join with the options as a JSON array (strings, or { label }): a script or a feedback fills it */
  source?: Join;
  /** analog join: the index of the option picked */
  join: Join;
  /** the option picked at start */
  value?: number;
  /** the field's text while nothing is picked */
  placeholder?: string;
  /** shown in the list when nothing matches */
  empty?: string;
  /** rows shown at once */
  rows?: number;
  rowH?: number;
}
export interface TimePickerProps extends FieldProps {
  /** analog joins: the hour (0-23) and the minute (0-59), as numbers */
  hour: Join;
  minute: Join;
  /** the time at start ('07:30') */
  value?: string;
  /** the minutes drum in steps (5: 00, 05, 10 ...) */
  minuteStep?: number;
  /** 12 hours and AM / PM */
  ampm?: boolean;
  /** a button turning the drums to the panel's time: its text ('Now') */
  now?: string;
  ok?: string;
  cancel?: string;
}
export interface DatePickerProps extends FieldProps {
  /** analog joins: the day (1-31), month (1-12) and year, as numbers */
  day: Join;
  month: Join;
  year: Join;
  /** the date at start ('2026-10-08') */
  value?: string;
  /** the field's text: D DD M MM MMM MMMM YYYY (default 'DD.MM.YYYY') */
  format?: string;
  /** the drums' order */
  order?: 'dmy' | 'mdy' | 'ymd';
  /** the years on the drum (default: 10 years either side of this one) */
  minYear?: number;
  maxYear?: number;
  /** the 12 months' names, January first (another language) */
  months?: string[];
  /** a button turning the drums to today: its text (default 'Today'; false: none) */
  today?: string | false;
  /** the field's text while no date is set */
  placeholder?: string;
  ok?: string;
  cancel?: string;
}
export interface NumberFieldProps extends FieldProps {
  /** analog join: the value, min..max as 0..65535 (as Slider, Stepper) */
  join: Join;
  /** the value at start */
  value?: number;
  min?: number;
  max?: number;
  /** digits after the point */
  decimals?: number;
  /** digits at most */
  digits?: number;
  /** after the number ('%', '\u00B0C') */
  unit?: string;
  ok?: string;
  cancel?: string;
  /** the messages for a bad number: invalid ('Not a number'), range ('From {min} to {max}') */
  words?: { invalid?: string; range?: string };
}
export interface AlarmCardProps {
  title: string;
  /** digital join: the alarm on */
  on: Join;
  onValue?: boolean;
  /** analog joins: the hour (0-23) and the minute (0-59), as numbers (a TimePicker) */
  hour: Join;
  minute: Join;
  /** the time it starts at: "06:45" */
  value?: string;
  /** the minutes drum in steps (5: 00, 05, 10 ...) */
  minuteStep?: number;
  /** 12 h with AM / PM */
  ampm?: boolean;
  /** the time picker's title (default: the card's) */
  timeTitle?: string;
  /** analog join: the days (WeekDays bitmask) */
  days: Join;
  daysValue?: number;
  x?: number;
  y?: number;
  w?: number;
}
export interface NavCardProps {
  icon: string;
  title: string;
  text?: string;
  page: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface HeaderProps {
  title: string;
  /** the section shown: breadcrumbs "Home › section" */
  section?: string;
  /** the page "Home" goes to */
  home?: string;
  /** digital join opening the SideMenu (default 'menu'); false: no menu button */
  menu?: Join | false;
  clock?: boolean;
  /** a button switching the look (with <Project themes>: IvaTheme.toggle()) */
  themeToggle?: boolean;
  w?: number;
  h?: number;
}
export interface SideMenuProps {
  title?: string;
  subtitle?: string;
  items: { icon: string; text: string; page: string }[];
  /** digital join: open (default 'menu') */
  menu?: Join;
  w?: number;
  /** slide in from the left (default: fade in) */
  slide?: boolean;
}
export interface ConfirmDialogProps {
  /** digital join: shown while on */
  join: Join;
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** command run on confirm */
  onConfirm?: string;
  w?: number;
  h?: number;
}

export interface Ui {
  theme: UiTheme;
  Card: (p: CardProps) => VNode;
  Icon: (p: IconProps) => VNode;
  IconButton: (p: IconButtonProps) => VNode;
  Tile: (p: TileProps) => VNode;
  Badge: (p: BadgeProps) => VNode;
  Stat: (p: StatProps) => VNode;
  Toggle: (p: ToggleProps) => VNode;
  Slider: (p: SliderProps) => VNode;
  Stepper: (p: StepperProps) => VNode;
  Segmented: (p: SegmentedProps) => VNode;
  SceneBar: (p: SceneBarProps) => VNode;
  Dimmer: (p: DimmerProps) => VNode;
  Dial: (p: DialProps) => VNode;
  RadioGroup: (p: RadioGroupProps) => VNode;
  CheckBox: (p: CheckBoxProps) => VNode;
  CheckBoxGroup: (p: CheckBoxGroupProps) => VNode;
  SelectBox: (p: SelectBoxProps) => VNode;
  ListRow: (p: ListRowProps) => VNode;
  DataList: (p: DataListProps) => VNode;
  ScrollBox: (p: ScrollBoxProps) => VNode;
  WeekDays: (p: WeekDaysProps) => VNode;
  PinPad: (p: PinPadProps) => VNode;
  ColorPicker: (p: ColorPickerProps) => VNode;
  TextField: (p: TextFieldProps) => VNode;
  SearchSelect: (p: SearchSelectProps) => VNode;
  TimePicker: (p: TimePickerProps) => VNode;
  DatePicker: (p: DatePickerProps) => VNode;
  NumberField: (p: NumberFieldProps) => VNode;
  AlarmCard: (p: AlarmCardProps) => VNode;
  Knob: (p: KnobProps) => VNode;
  Thermostat: (p: ThermostatProps) => VNode;
  Blinds: (p: BlindsProps) => VNode;
  NavCard: (p: NavCardProps) => VNode;
  Header: (p: HeaderProps) => VNode;
  SideMenu: (p: SideMenuProps) => VNode;
  ConfirmDialog: (p: ConfirmDialogProps) => VNode;
}

/** A join as a JavaScript expression ("d12", or Joins.d.name for a named one). */
export function jsJoin(type: 'd' | 'a' | 's' | 'l', j: Join): string {
  if (typeof j === 'number') return JSON.stringify(`${type}${j}`);
  if (typeof j === 'string') return /^\d+$/.test(j) ? JSON.stringify(type + j) : `Joins.${type}[${JSON.stringify(j)}]`;
  return typeof j.id === 'number' ? JSON.stringify(`${j.type}${j.id}`) : `Joins.${j.type}[${JSON.stringify(j.id)}]`;
}

/** A name for joins a component makes for itself, from the join it was given. */
const keyOf = (j: Join): string => (typeof j === 'object' ? `${j.type}${j.id}` : String(j)).replace(/[^\w]/g, '_');

/** A short stable hash (file names for drawings that look the same). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** A colour lighter (amount > 0) or darker. */
function shade(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Components in a theme: createUi({ accent: '#0A84FF' }); what isn't given
 * comes from defaultTheme - or, with <Project themes={['dark', 'light']}>,
 * from the look being built (lightTheme for 'light'), and `looks` changes a
 * look's own colours: createUi({ accent: '#0A84FF' }, { light: { accent: '#0060DF' } }).
 */
export function createUi(theme: Partial<UiTheme> = {}, looks: Record<string, Partial<UiTheme>> = {}): Ui {
  const look = variant();
  const base = look === 'light' ? lightTheme : defaultTheme;
  const own = looks[look] ?? {};
  const t: UiTheme = { ...base, ...theme, ...own, panel: { ...base.panel, ...(theme.panel ?? {}), ...(own.panel ?? {}) } };
  const font = t.font;
  // text in the look's colour unless a component says otherwise (white would vanish on a light look)
  const Text = (props: TextProps): VNode => <IvaText color={t.text} {...props} />;
  const Button = (props: ButtonProps): VNode => <IvaButton color={t.text} {...props} />;
  const runtime = <Script name="iva-ui.js" code={UI_RUNTIME} />;
  const tones: Record<Tone, { fg: string; bg: string }> = {
    accent: { fg: t.accent, bg: shade(t.accent, -0.75) },
    danger: { fg: t.danger, bg: shade(t.danger, -0.72) },
    warning: { fg: t.warning, bg: shade(t.warning, -0.75) },
    muted: { fg: t.muted, bg: t.raised },
  };

  function Card({ title, x = 0, y = 0, w = 380, h = 280, children }: CardProps): VNode {
    return (
      <Group x={x} y={y}>
        <Box w={w} h={h} bg={t.surface} radius={t.radius + 4} />
        {title && <Text x={28} y={18} w={w - 56} h={30} text={title.toUpperCase()} color={t.muted} font={font} fontSize={15} />}
        {children}
      </Group>
    );
  }

  function Icon({ icon, size = 24, color = t.text, x = 0, y = 0 }: IconProps): VNode {
    return <Image x={x} y={y} w={size} h={size} src={fa(icon, { color, size })} />;
  }

  function IconButton({ icon, text, tone = 'raised', x = 0, y = 0, w, h = 64, size, join, feedback, ...actions }: IconButtonProps): VNode {
    const flat = tone === 'flat';
    const bg = flat ? undefined : { raised: t.raised, accent: t.accent, danger: t.danger }[tone];
    const color = flat ? t.accent : t.text;
    const width = w ?? (text ? Math.max(120, 64 + text.length * 12 + (icon ? 40 : 0)) : h);
    return (
      <Button x={x} y={y} w={width} h={h} text={text} join={join} feedback={feedback}
              icon={icon ? fa(icon, { size: size ?? Math.round(h * 0.4) }) : undefined} iconAlign={text ? 'left' : 'center'}
              radius={bg ? t.radius : undefined} bg={bg} color={color} font={font} fontSize={20}
              active={flat ? { color: shade(t.accent, 0.4) } : { bg: tone === 'raised' ? t.accent : shade(bg!, -0.25) }} {...actions} />
    );
  }

  function Tile({ icon, title, status, statusJoin, join, feedback = 'toggle', x = 0, y = 0, w = 180, h = 180, ...actions }: TileProps): VNode {
    const size = Math.round(Math.min(w, h) * 0.2);
    return (
      <Group x={x} y={y}>
        <Button w={w} h={h} join={join} feedback={feedback} radius={t.radius + 4} bg={t.raised} active={{ bg: t.accent }}
                icon={{ src: fa(icon, { size, color: t.accent }), x: 22, y: 22 }}
                activeIcon={{ src: fa(icon, { size, color: t.text }), x: 22, y: 22 }} {...actions} />
        <Text x={22} y={h - (status || statusJoin ? 74 : 54)} w={w - 44} h={32} text={title} font={font} fontSize={21} />
        {(status || statusJoin) && <Text x={22} y={h - 44} w={w - 44} h={24} text={status} join={statusJoin} color={t.muted} font={font} fontSize={16} />}
      </Group>
    );
  }

  function Badge({ text = '', tone = 'accent', dot = false, join, on, off, x = 0, y = 0, w, h = 28 }: BadgeProps): VNode {
    const tn = tones[tone];
    const base = join ? tones.muted : tn;
    const label = join ? off ?? text : text;
    const longest = Math.max(label.length, (on ?? '').length);
    const width = w ?? Math.round(longest * 8.5 + (dot ? 46 : 30));
    return (
      <Button x={x} y={y} w={width} h={h} feedback="none" join={join} text={label} activeText={join ? on ?? text : undefined}
              radius={h / 2} bg={base.bg} color={base.fg} font={font} fontSize={14}
              active={join ? { bg: tn.bg, color: tn.fg } : undefined}
              icon={dot ? fa('circle', { size: 8, color: base.fg }) : undefined}
              activeIcon={dot && join ? fa('circle', { size: 8, color: tn.fg }) : undefined} iconAlign="left" />
    );
  }

  function Stat({ icon, label, value, valueJoin, color = t.text, x = 0, y = 0, w = 240, h = 96 }: StatProps): VNode {
    return (
      <Group x={x} y={y}>
        <Image x={0} y={Math.round((h - 44) / 2)} w={36} h={44} src={fa(icon, { color: t.accent, size: 36 })} />
        <Text x={52} y={0} w={w - 52} h={60} text={value} join={valueJoin} color={color} font={font} fontSize={46} />
        <Text x={52} y={62} w={w - 52} h={28} text={label} color={t.muted} font={font} fontSize={18} />
      </Group>
    );
  }

  function Toggle({ label, join, x = 0, y = 0, w = 332, h = 48, ...actions }: ToggleProps): VNode {
    return (
      <Group x={x} y={y}>
        {label && <Text w={w - 110} h={h} text={label} font={font} fontSize={20} />}
        <Button x={w - 96} y={Math.round((h - 36) / 2)} w={96} h={36} join={join} feedback="toggle" text="OFF" activeText="ON"
                radius={18} bg={t.raised} color={t.muted} active={{ bg: t.accent, color: t.text }} font={font} fontSize={15} {...actions} />
      </Group>
    );
  }

  function Slider({ label, join, min = 0, max = 100, value, unit = '%', decimals = 0, showValue = true, dragCmd, x = 0, y = 0, w = 332, h = 16 }: SliderProps): VNode {
    const text: JoinRef = s(`ui_${keyOf(join)}_value`);
    const valueW = showValue ? 90 : 0;
    const top = label ? 36 : 0;
    return (
      <Group x={x} y={y}>
        {label && <Text w={w} h={28} text={label} color={t.muted} font={font} fontSize={17} />}
        <IvaSlider y={top} w={w - valueW} h={h} join={join} min={min} max={max} bg={t.raised} fill={t.accent} radius={3} dragCmd={dragCmd} />
        {showValue && <Text x={w - valueW + 12} y={top + Math.round(h / 2) - 16} w={valueW - 12} h={32} join={text} align="right" font={font} fontSize={20} />}
        {showValue && runtime}
        {showValue && <OnStart js={`IvaUI.value(${jsJoin('a', join)}, ${jsJoin('s', text)}, ${JSON.stringify(unit)}, ${decimals}, ${min}, ${max});`} joins={[text]} />}
        {value !== undefined && runtime}
        {value !== undefined && <OnStart js={`IvaUI.set(${jsJoin('a', join)}, ${value}, ${min}, ${max});`} />}
      </Group>
    );
  }

  function Stepper({ join, value = 0, min = 0, max = 100, step = 1, decimals = 0, unit = '', x = 0, y = 0, w = 200, h = 56 }: StepperProps): VNode {
    const id = JSON.stringify(keyOf(join));
    const text: JoinRef = s(`ui_${keyOf(join)}_value`);
    const btn = { radius: t.radius, bg: shade(t.raised, 0.08), active: { bg: t.accent }, font };
    return (
      <Group x={x} y={y}>
        <Box w={w} h={h} bg={t.raised} radius={t.radius} />
        <Button w={h} h={h} icon={fa('minus', { size: Math.round(h * 0.36) })} js={`IvaUI.step(${id}, -1)`} {...btn} />
        <Text x={h} w={w - 2 * h} h={h} join={text} align="center" font={font} fontSize={22} />
        <Button x={w - h} w={h} h={h} icon={fa('plus', { size: Math.round(h * 0.36) })} js={`IvaUI.step(${id}, 1)`} {...btn} />
        {runtime}
        <OnStart js={`IvaUI.stepper(${id}, ${jsJoin('a', join)}, ${jsJoin('s', text)}, ${JSON.stringify({ value, min, max, step, decimals, unit })});`}
                 joins={[typeof join === 'object' ? join : a(join), text]} />
      </Group>
    );
  }

  /** one of several: each option a button on its own digital join, the index in `join` */
  function oneOf(join: Join, count: number, value: number, labels?: string[], labelJoin?: JoinRef) {
    const id = JSON.stringify(keyOf(join));
    const option = (i: number): JoinRef => d(`ui_${keyOf(join)}_${i}`);
    const extra = labels && labelJoin ? `, ${JSON.stringify(labels)}, ${jsJoin('s', labelJoin)}` : '';
    const start = (
      <OnStart js={`IvaUI.group(${id}, ${jsJoin('a', join)}, [${Array.from({ length: count }, (_, i) => jsJoin('d', option(i))).join(', ')}], ${value}${extra});`}
               joins={[typeof join === 'object' ? join : a(join), ...(labelJoin ? [labelJoin] : [])]} />
    );
    return { option, pick: (i: number) => `IvaUI.pick(${id}, ${i})`, start };
  }

  function Segmented({ options, join, value = 0, x = 0, y = 0, w = 332, h = 48 }: SegmentedProps): VNode {
    const g = oneOf(join, options.length, value);
    const seg = (w - 8) / options.length;
    return (
      <Group x={x} y={y}>
        <Box w={w} h={h} bg={t.raised} radius={t.radius} />
        {options.map((o, i) => (
          <Button x={4 + Math.round(i * seg)} y={4} w={Math.round((i + 1) * seg) - Math.round(i * seg)} h={h - 8} text={o} join={g.option(i)} feedback="none"
                  js={g.pick(i)} radius={t.radius - 3} bg={t.raised} color={t.muted} active={{ bg: t.accent, color: t.text }} font={font} fontSize={18} />
        ))}
        {runtime}
        {g.start}
      </Group>
    );
  }

  function SceneBar({ scenes, join, value = 0, x = 0, y = 0, w = 742, h = 120, gap = 12 }: SceneBarProps): VNode {
    const g = oneOf(join, scenes.length, value);
    const each = (w - gap * (scenes.length - 1)) / scenes.length;
    return (
      <Group x={x} y={y}>
        {scenes.map((sc, i) => (
          <Button x={Math.round(i * (each + gap))} w={Math.round(each)} h={h} text={sc.title} join={g.option(i)} feedback="none"
                  js={g.pick(i)} cmd={sc.cmd} icon={fa(sc.icon, { size: Math.round(h * 0.28) })} iconAlign="top"
                  radius={t.radius} bg={t.raised} active={{ bg: t.accent }} font={font} fontSize={19} />
        ))}
        {runtime}
        {g.start}
      </Group>
    );
  }

  function Dimmer({ label, icon = 'lightbulb', on, level, x = 0, y = 0, w = 332 }: DimmerProps): VNode {
    return (
      <Group x={x} y={y}>
        <Image y={8} w={28} h={32} src={fa(icon, { color: t.accent, size: 28 })} />
        <Group x={44}>
          <Toggle label={label} join={on} w={w - 44} />
        </Group>
        <Slider y={64} join={level} w={w} />
      </Group>
    );
  }

  function Blinds({ label, position, onOpen, onStop, onClose, x = 0, y = 0, w = 332 }: BlindsProps): VNode {
    const bw = Math.round((w - 24) / 3);
    const b = { y: 48, w: bw, h: 56, radius: t.radius, bg: t.raised, active: { bg: t.accent } };
    return (
      <Group x={x} y={y}>
        <Text w={w} h={36} text={label} font={font} fontSize={21} />
        <Button {...b} icon={fa('chevron-up', { size: 22 })} cmd={onOpen} />
        <Button {...b} x={bw + 12} icon={fa('stop', { size: 20 })} cmd={onStop} />
        <Button {...b} x={2 * (bw + 12)} icon={fa('chevron-down', { size: 22 })} cmd={onClose} />
        <Slider y={128} join={position} w={w} />
      </Group>
    );
  }

  /**
   * A ring the value runs round: a track, an arc (drawn frames: iViewer has no
   * arcs), a thumb that turns with the value, the value in the middle.
   * Touch or drag anywhere on the ring.
   */
  function Dial({ join, min = 0, max = 100, value, step, decimals = 0, unit = '%', label, labelJoin, size = 220, thickness, color = t.accent,
                  sweep = 270, steps = 50, x = 0, y = 0 }: DialProps): VNode {
    const th = thickness ?? Math.max(8, Math.round(size * 0.075));
    const key = keyOf(join);
    const id = JSON.stringify(key);
    const from = -sweep / 2;
    const prefix = `iva_dial_${hash(`${size}|${th}|${sweep}|${steps}|${color}`)}_`;
    const frames = Array.from({ length: steps + 1 }, (_, i) => draw.arc({ size, thickness: th, from, to: from + (sweep * i) / steps, color, name: `${prefix}${i}` }));
    const arcJoin: JoinRef = s(`ui_${key}_arc`);
    const thumbJoin: JoinRef = s(`ui_${key}_thumb`);
    const text: JoinRef = s(`ui_${key}_value`);
    const touch = `IvaUI.dialTouch(${id}, gesture.x, gesture.y)`;
    const o = { prefix, steps, sweep, size, min, max, step: step ?? 0, decimals, unit };
    return (
      <Group x={x} y={y}>
        <Image w={size} h={size} src={draw.arc({ size, thickness: th, from, to: -from, color: t.raised })}>
          <Gesture type="tap" onBegin={touch} />
          <Gesture type="pan" onBegin={touch} onChange={touch} />
        </Image>
        <Image w={size} h={size} join={arcJoin} src={frames[0]} clickthrough />
        <Image w={size} h={size} join={thumbJoin} src={draw.dot({ size, ring: size / 2 - th / 2 - 1, at: from, diameter: Math.round(th * 1.7), color: '#FFFFFF' })} clickthrough />
        <Text y={Math.round(size * 0.33)} w={size} h={Math.round(size * 0.26)} join={text} align="center" font={font} fontSize={Math.round(size * 0.18)} />
        {(label || labelJoin) && (
          <Text y={Math.round(size * 0.58)} w={size} h={Math.round(size * 0.12)} text={label} join={labelJoin} align="center" color={t.muted} font={font} fontSize={Math.round(size * 0.075)} />
        )}
        {/* every frame in the project (iViewer ships / caches what the .gui names), out of sight */}
        <Subpage name={`ui_frames_${prefix}`} w={1} h={1} visible={false}>
          {frames.map((f) => <Image w={1} h={1} src={f} />)}
        </Subpage>
        {runtime}
        <OnStart js={`IvaUI.dial(${id}, ${JSON.stringify(o).slice(0, -1)}, join: ${jsJoin('a', join)}, arc: ${jsJoin('s', arcJoin)}, thumb: ${jsJoin('s', thumbJoin)}, text: ${jsJoin('s', text)} });`}
                 joins={[typeof join === 'object' ? join : a(join), arcJoin, thumbJoin, text]} />
        {value !== undefined && <OnStart js={`IvaUI.set(${jsJoin('a', join)}, ${value}, ${min}, ${max});`} />}
      </Group>
    );
  }

  /** A knob that turns, tick marks round it (GUI Designer's Dial demo); the value under it. */
  function Knob({ join, min = 0, max = 100, value, step, decimals = 0, unit = '%', label, size = 200, color = t.raised, pointer = t.accent,
                  sweep = 270, x = 0, y = 0 }: KnobProps): VNode {
    const key = keyOf(join);
    const id = JSON.stringify(key);
    const from = -sweep / 2;
    const disc = Math.round(size * 0.72);
    const knobJoin: JoinRef = s(`ui_${key}_knob`);
    const text: JoinRef = s(`ui_${key}_value`);
    const touch = `IvaUI.dialTouch(${id}, gesture.x, gesture.y)`;
    const o = { prefix: '', steps: 0, sweep, size, min, max, step: step ?? 0, decimals, unit };
    return (
      <Group x={x} y={y}>
        <Image w={size} h={size} src={draw.ticks({ size, count: 28, from, to: -from, length: Math.round(size * 0.07), width: 2, color: t.muted })}>
          <Gesture type="tap" onBegin={touch} />
          <Gesture type="pan" onBegin={touch} onChange={touch} />
        </Image>
        <Image x={(size - disc) / 2} y={(size - disc) / 2} w={disc} h={disc} join={knobJoin} clickthrough
               src={draw.knob({ size: disc, color, pointer, at: from })} />
        <Text y={size + 4} w={size} h={36} join={text} align="center" font={font} fontSize={24} />
        {label && <Text y={size + 40} w={size} h={24} text={label} align="center" color={t.muted} font={font} fontSize={16} />}
        {runtime}
        <OnStart js={`IvaUI.dial(${id}, ${JSON.stringify(o).slice(0, -1)}, join: ${jsJoin('a', join)}, thumb: ${jsJoin('s', knobJoin)}, text: ${jsJoin('s', text)} });`}
                 joins={[typeof join === 'object' ? join : a(join), knobJoin, text]} />
        {value !== undefined && <OnStart js={`IvaUI.set(${jsJoin('a', join)}, ${value}, ${min}, ${max});`} />}
      </Group>
    );
  }

  /** A setpoint dial, the room temperature, - and + under it; modes (Segmented) below. */
  function Thermostat({ setpoint, value, current, currentJoin, min = 16, max = 30, step = 0.5, unit = '\u00B0', size = 240, modes, mode, modeValue = 0, x = 0, y = 0 }: ThermostatProps): VNode {
    const id = JSON.stringify(keyOf(setpoint));
    const b = Math.round(size * 0.18);
    const btn = { w: b, h: b, radius: b / 2, bg: t.raised, active: { bg: t.accent }, font };
    const segW = Math.round(size * 0.85);
    return (
      <Group x={x} y={y}>
        <Dial join={setpoint} value={value} min={min} max={max} step={step} decimals={1} unit={unit} size={size}
              label={current !== undefined ? `Now ${current}` : undefined} labelJoin={currentJoin} />
        <Button x={Math.round(size / 2 - b * 1.45)} y={size - b - 4} {...btn} icon={fa('minus', { size: Math.round(b * 0.4) })} js={`IvaUI.dialStep(${id}, -1)`} />
        <Button x={Math.round(size / 2 + b * 0.45)} y={size - b - 4} {...btn} icon={fa('plus', { size: Math.round(b * 0.4) })} js={`IvaUI.dialStep(${id}, 1)`} />
        {modes && mode !== undefined && <Segmented x={Math.round((size - segW) / 2)} y={size + 14} w={segW} h={44} options={modes} join={mode} value={modeValue} />}
      </Group>
    );
  }

  // ── forms ───────────────────────────────────────────────────────

  /** A row that toggles or picks: a transparent button, an icon per state, the label beside (left-aligned everywhere). */
  function row(y: number, w: number, h: number, label: string, iconOff: IconRef, iconOn: IconRef, button: Partial<ButtonProps>) {
    const size = 24;
    const icon = (ic: IconRef) => ({ src: ic, x: 0, y: Math.round((h - size) / 2) });
    return (
      <Group y={y}>
        <Button w={w} h={h} icon={icon(iconOff)} activeIcon={icon(iconOn)} {...button} />
        <Text x={size + 16} w={w - size - 16} h={h} text={label} font={font} fontSize={21} />
      </Group>
    );
  }

  function RadioGroup({ options, join, value = 0, x = 0, y = 0, w = 320, rowH = 48 }: RadioGroupProps): VNode {
    const g = oneOf(join, options.length, value);
    const off = fa('circle', { style: 'regular', size: 24, color: t.muted });
    const on = fa('circle-dot', { size: 24, color: t.accent });
    return (
      <Group x={x} y={y}>
        {options.map((o, i) => row(i * rowH, w, rowH - 4, o, off, on, { join: g.option(i), feedback: 'none', js: g.pick(i) }))}
        {runtime}
        {g.start}
      </Group>
    );
  }

  function CheckBox({ label, join, value, x = 0, y = 0, w = 320, h = 44 }: CheckBoxProps): VNode {
    const off = fa('square', { style: 'regular', size: 24, color: t.muted });
    const on = fa('square-check', { size: 24, color: t.accent });
    return (
      <Group x={x} y={y}>
        {row(0, w, h, label, off, on, { join, feedback: 'toggle' })}
        {value && <OnStart js={`CF.setJoin(${jsJoin('d', join)}, 1);`} />}
      </Group>
    );
  }

  function CheckBoxGroup({ options, x = 0, y = 0, w = 320, rowH = 48 }: CheckBoxGroupProps): VNode {
    return (
      <Group x={x} y={y}>
        {options.map((o, i) => <CheckBox y={i * rowH} w={w} h={rowH - 4} label={o.label} join={o.join} value={o.value} />)}
      </Group>
    );
  }

  function SelectBox({ options, join, value = 0, title, mode = 'sheet', x = 0, y = 0, w = 340, h = 48 }: SelectBoxProps): VNode {
    const key = keyOf(join);
    const open: JoinRef = d(`ui_${key}_open`);
    const label: JoinRef = s(`ui_${key}_label`);
    const g = oneOf(join, options.length, value, options, label);
    const close = `IvaUI.off(${jsJoin('d', open)})`;
    const { width: W, height: H } = t.panel;
    const rowH = 52;
    const optionRows = (rw: number) =>
      options.map((o, i) => (
        <Group y={i * rowH}>
          <Button w={rw} h={rowH - 4} join={g.option(i)} feedback="none" js={`${g.pick(i)}; ${close}`} radius={t.radius} active={{ bg: t.raised }}
                  activeIcon={{ src: fa('check', { size: 18, color: t.accent }), x: rw - 36, y: Math.round((rowH - 4 - 18) / 2) }} />
          <Text x={16} w={rw - 60} h={rowH - 4} text={o} font={font} fontSize={20} />
        </Group>
      ));
    const sheetW = 420;
    const sheetH = 84 + options.length * rowH + 12;
    return (
      <Group x={x} y={y}>
        <Box w={w} h={h} bg={t.raised} radius={t.radius} />
        <Text x={16} w={w - 56} h={h} join={label} font={font} fontSize={21} />
        <Image x={w - 36} y={Math.round((h - 18) / 2)} w={18} h={18} src={fa('chevron-down', { size: 18, color: t.muted })} />
        <Button w={w} h={h} feedback="none" js={`CF.setJoin(${jsJoin('d', open)}, 1)`} />
        {mode === 'sheet' ? (
          <Subpage name={`ui_select_${key}`} fixed topmost w={W} h={H} join={open} bg="#000000a0" in={{ type: 'fade', time: 0.15 }} out={{ type: 'fade', time: 0.15 }}>
            <Button w={W} h={H} feedback="none" js={close} />
            <Group x={Math.round((W - sheetW) / 2)} y={Math.round((H - sheetH) / 2)}>
              <Box w={sheetW} h={sheetH} bg={t.surface} radius={t.radius + 4} borderWidth={1} borderColor={t.raised} />
              {/* taps on the sheet stay on it */}
              <Button w={sheetW} h={sheetH} feedback="none" />
              <Text x={24} y={16} w={sheetW - 90} h={44} text={title ?? ''} font={font} fontSize={26} />
              <Button x={sheetW - 60} y={14} w={48} h={48} icon={fa('xmark', { size: 22, color: t.muted })} feedback="none" js={close} />
              <Group x={8} y={76}>{optionRows(sheetW - 16)}</Group>
            </Group>
          </Subpage>
        ) : (
          <Group>
            <Subpage name={`ui_select_${key}_away`} fixed topmost w={W} h={H} join={open}>
              <Button w={W} h={H} feedback="none" js={close} />
            </Subpage>
            <Subpage name={`ui_select_${key}`} topmost y={h + 6} w={w} h={options.length * rowH + 8} join={open} bg={t.surface} radius={t.radius}
                     borderWidth={1} borderColor={t.raised} in={{ type: 'fade', time: 0.15 }} out={{ type: 'fade', time: 0.15 }}>
              <Group x={4} y={4}>{optionRows(w - 8)}</Group>
            </Subpage>
          </Group>
        )}
        {runtime}
        {g.start}
      </Group>
    );
  }

  // ── lists ───────────────────────────────────────────────────────

  function ListRow({ icon, title, subtitle, value, valueJoin, toggle, chevron, divider = true, x = 0, y = 0, w = 542, h = 64, ...actions }: ListRowProps): VNode {
    const left = icon ? 48 : 0;
    const pressable = chevron || actions.page || actions.js || actions.cmd;
    return (
      <Group x={x} y={y}>
        {pressable && <Button w={w} h={h} feedback="none" radius={t.radius} active={{ bg: t.raised }} {...actions} />}
        {icon && <Image y={Math.round((h - 28) / 2)} w={28} h={28} src={fa(icon, { size: 24, color: t.muted })} />}
        <Text x={left} y={subtitle ? 6 : 0} w={w - left - 140} h={subtitle ? 32 : h} text={title} font={font} fontSize={21} />
        {subtitle && <Text x={left} y={36} w={w - left - 140} h={22} text={subtitle} color={t.muted} font={font} fontSize={15} />}
        {(value || valueJoin) && <Text x={w - 160} w={160} h={h} text={value} join={valueJoin} align="right" color={t.muted} font={font} fontSize={19} />}
        {toggle && <Button x={w - 96} y={Math.round((h - 36) / 2)} w={96} h={36} join={toggle} feedback="toggle" text="OFF" activeText="ON"
                           radius={18} bg={t.raised} color={t.muted} active={{ bg: t.accent, color: t.text }} font={font} fontSize={15} />}
        {chevron && <Image x={w - 26} y={Math.round((h - 18) / 2)} w={18} h={18} src={fa('chevron-right', { size: 18, color: t.muted })} />}
        {divider && <Box x={left} y={h - 1} w={w - left} h={1} bg={t.raised} />}
      </Group>
    );
  }

  /** Rows of a CF list: headers, rows (icon, title, subtitle, value), alerts, spacers - filled at start. */
  function DataList({ join, items, x = 0, y = 0, w = 560, h = 480 }: DataListProps): VNode {
    const key = keyOf(join);
    const sub = (kind: string) => `ui_dl_${w}_${kind}`;
    const iconFile = (name: string, color: string) => `iva_icon_${hash(`${name}|${color}`)}`;
    const used = new Map<string, IconRef>();
    const rows = items.map((it) => {
      if ('header' in it) return { subpage: sub('header'), s1: it.header };
      if ('spacer' in it) return { subpage: sub('spacer') };
      const color = it.alert ? t.danger : t.accent;
      const row: Record<string, string> = { subpage: sub(it.alert ? 'alert' : 'row'), s1: it.title, s2: it.subtitle ?? '', s3: it.value ?? '' };
      if (it.icon) {
        const file = iconFile(it.icon, color);
        used.set(file, fa(it.icon, { size: 26, color, file }));
        row.s4 = `${file}.png`;
      }
      return row;
    });
    const rowBody = (danger: boolean) => (
      <>
        {danger && <Box w={4} h={64} bg={t.danger} />}
        <Image x={16} y={18} w={28} h={28} join={4} />
        <Text x={60} y={6} w={w - 240} h={32} join={1} font={font} fontSize={21} />
        <Text x={60} y={36} w={w - 240} h={22} join={2} color={t.muted} font={font} fontSize={15} />
        {danger
          ? <Box x={w - 130} y={20} w={110} h={26} bg={t.danger} radius={13} />
          : <Text x={w - 180} w={160} h={64} join={3} align="right" color={t.muted} font={font} fontSize={19} />}
        {danger && <Text x={w - 130} y={20} w={110} h={26} text="!" align="center" font={font} fontSize={16} />}
        <Box x={60} y={63} w={w - 80} h={1} bg={t.raised} />
      </>
    );
    return (
      <Group x={x} y={y}>
        <Subpage name={sub('header')} define w={w} h={52}>
          <Text x={16} y={14} w={w - 32} h={36} join={1} color={t.accent} font={font} fontSize={18} />
        </Subpage>
        <Subpage name={sub('row')} define w={w} h={64}>{rowBody(false)}</Subpage>
        <Subpage name={sub('alert')} define w={w} h={64}>{rowBody(true)}</Subpage>
        <Subpage name={sub('spacer')} define w={w} h={24} />
        {/* the row icons, named in the .gui so they ship with it */}
        <Subpage name={`ui_icons_${key}`} define w={1} h={1}>
          {[...used.values()].map((src) => <Image w={1} h={1} src={src} />)}
        </Subpage>
        <List w={w} h={h} join={typeof join === 'object' ? join : l(join)} item={sub('row')} />
        {runtime}
        <OnStart js={`IvaUI.fill(${jsJoin('l', join)}, ${JSON.stringify(rows)});`} />
      </Group>
    );
  }

  function ScrollBox({ join, lines, x = 0, y = 0, w = 232, h = 232, rowH = 50 }: ScrollBoxProps): VNode {
    const sub = `ui_scroll_${w}_${rowH}`;
    return (
      <Group x={x} y={y}>
        <Subpage name={sub} define w={w} h={rowH}>
          <Box w={w} h={rowH - 6} bg={t.raised} radius={t.radius + 4} />
          <Text x={8} w={w - 16} h={rowH - 6} join={1} font={font} fontSize={19} />
        </Subpage>
        <List w={w} h={h} join={typeof join === 'object' ? join : l(join)} item={sub} />
        {runtime}
        <OnStart js={`IvaUI.fill(${jsJoin('l', join)}, ${JSON.stringify(lines.map((ln) => ({ subpage: sub, s1: ln })))});`} />
      </Group>
    );
  }

  // ── schedule & security ─────────────────────────────────────────

  function WeekDays({ join, value = 31, first = 'mon', labels = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'], textJoin, size = 48, gap = 8, x = 0, y = 0 }: WeekDaysProps): VNode {
    const key = keyOf(join);
    const order = first === 'sun' ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    const day = (i: number): JoinRef => d(`ui_${key}_day${i}`);
    return (
      <Group x={x} y={y}>
        {order.map((dIdx, i) => (
          <Button x={i * (size + gap)} w={size} h={size} join={day(i)} feedback="toggle" text={labels[dIdx]} radius={size / 2}
                  bg={t.raised} color={t.muted} active={{ bg: t.accent, color: t.text }} font={font} fontSize={Math.round(size * 0.4)} />
        ))}
        {runtime}
        <OnStart js={`IvaUI.days(${JSON.stringify(key)}, { mask: ${jsJoin('a', join)}, joins: [${order.map((_, i) => jsJoin('d', day(i))).join(', ')}], order: ${JSON.stringify(order)}, value: ${value}${textJoin ? `, text: ${jsJoin('s', textJoin)}` : ''} });`}
                 joins={[typeof join === 'object' ? join : a(join), ...(textJoin && typeof textJoin === 'object' ? [textJoin] : [])]} />
      </Group>
    );
  }

  function PinPad({ code, onEnter, length = 8, mask = true, placeholder = 'Enter code', size = 72, gap = 12, x = 0, y = 0 }: PinPadProps): VNode {
    const id = JSON.stringify(`pin_${hash(`${x}|${y}|${placeholder}`)}`);
    const display: JoinRef = s(`ui_${JSON.parse(id)}_display`);
    const w = 3 * size + 2 * gap;
    const key = (k: string, i: number) => {
      const col = i % 3;
      const r = Math.floor(i / 3);
      const pos = { x: col * (size + gap), y: 76 + r * (size + gap), w: size, h: size, radius: t.radius + 2, font };
      if (k === 'back') return <Button {...pos} bg={t.raised} active={{ bg: t.accent }} icon={fa('delete-left', { size: 24, color: t.muted })} js={`IvaUI.pinBack(${id})`} onHold={[jsAction(`IvaUI.pinClear(${id})`)]} />;
      if (k === 'ok') return <Button {...pos} bg={t.accent} active={{ bg: shade(t.accent, -0.25) }} text="OK" fontSize={26} js={`IvaUI.pinEnter(${id})`} />;
      return <Button {...pos} bg={t.raised} active={{ bg: t.accent }} text={k} fontSize={30} js={`IvaUI.pinKey(${id}, ${JSON.stringify(k)})`} />;
    };
    return (
      <Group x={x} y={y}>
        <Box w={w} h={64} bg={t.raised} radius={t.radius + 2} />
        <Text w={w} h={64} join={display} align="center" font={font} fontSize={30} />
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'].map(key)}
        {runtime}
        <OnStart js={`IvaUI.pin(${id}, { display: ${jsJoin('s', display)}, length: ${length}, mask: ${mask}, placeholder: ${JSON.stringify(placeholder)}${code ? `, code: ${jsJoin('s', code)}` : ''} }${onEnter ? `, function (code) { ${onEnter} }` : ''});`}
                 joins={[display, ...(code && typeof code === 'object' ? [code] : [])]} />
      </Group>
    );
  }

  /** An alarm: its title, on / off, the time (a TimePicker: a tap opens the drums), the days and their summary. */
  function AlarmCard({ title, on, onValue, hour, minute, value = '07:00', minuteStep = 1, ampm = false, timeTitle, days, daysValue = 31,
                       x = 0, y = 0, w = 620 }: AlarmCardProps): VNode {
    const summary: JoinRef = s(`ui_${keyOf(days)}_summary`);
    const h = 210;
    return (
      <Group x={x} y={y}>
        <Box w={w} h={h} bg={t.surface} radius={t.radius + 4} />
        <Text x={28} y={12} w={w - 160} h={40} text={title} color={t.muted} font={font} fontSize={21} />
        <Button x={w - 124} y={12} w={96} h={36} join={on} feedback="toggle" text="OFF" activeText="ON" radius={18} bg={t.raised} color={t.muted}
                active={{ bg: t.accent, color: t.text }} font={font} fontSize={15} />
        <TimePicker x={24} y={56} w={ampm ? 260 : 200} h={64} hour={hour} minute={minute} value={value} minuteStep={minuteStep} ampm={ampm}
                    title={timeTitle ?? title} fontSize={40} />
        <Text x={w - 220} y={56} w={192} h={64} join={summary} align="right" color={t.muted} font={font} fontSize={21} />
        <WeekDays x={24} y={138} join={days} value={daysValue} textJoin={summary} size={52} />
        {onValue && <OnStart js={`CF.setJoin(${jsJoin('d', on)}, 1);`} />}
      </Group>
    );
  }

  function NavCard({ icon, title, text, page, x = 0, y = 0, w = 380, h = 180 }: NavCardProps): VNode {
    return (
      <Group x={x} y={y}>
        <Button w={w} h={h} page={page} radius={t.radius + 4} bg={t.surface} active={{ bg: t.raised }}
                icon={{ src: fa(icon, { size: 36, color: t.accent }), x: 22, y: 22 }} />
        <Text x={22} y={h - 74} w={w - 44} h={32} text={title} font={font} fontSize={22} />
        {text && <Text x={22} y={h - 44} w={w - 44} h={24} text={text} color={t.muted} font={font} fontSize={16} />}
      </Group>
    );
  }

  function Header({ title, section, home = 'Overview', menu = 'menu', clock = true, themeToggle = false, w = t.panel.width, h = 72 }: HeaderProps): VNode {
    const left = menu === false ? 24 : 84;
    const clockJoin: JoinRef = s('ui_clock');
    const titleW = Math.round(title.length * 15 + 30);
    return (
      <Group>
        <Box w={w} h={h} bg={t.bar} />
        {menu !== false && (
          <Button x={12} y={Math.round((h - 56) / 2)} w={56} h={56} icon={fa('bars', { size: 26 })} feedback="none"
                  js={`CF.setJoin(${jsJoin('d', menu)}, 1)`} />
        )}
        <Text x={left} w={titleW} h={h} text={title} font={font} fontSize={30} />
        {section && (
          <Group x={left + titleW + 30}>
            <Button w={70} h={h} text="Home" page={home} feedback="none" color={t.accent} active={{ color: shade(t.accent, 0.4) }} font={font} fontSize={20} />
            <Text x={74} w={20} h={h} text={'›'} color={t.muted} font={font} fontSize={20} />
            <Text x={100} w={400} h={h} text={section} font={font} fontSize={20} />
          </Group>
        )}
        {themeToggle && (
          <Button x={w - (clock ? 230 : 80)} y={Math.round((h - 56) / 2)} w={56} h={56} icon={fa('circle-half-stroke', { size: 26 })} feedback="none"
                  js="if (typeof IvaTheme !== 'undefined') IvaTheme.toggle();" />
        )}
        {clock && <Text x={w - 160} w={136} h={h} join={clockJoin} align="right" color={t.muted} font={font} fontSize={30} />}
        {clock && runtime}
        {clock && <OnStart js={`IvaUI.clock(${jsJoin('s', clockJoin)});`} joins={[clockJoin]} />}
      </Group>
    );
  }

  function SideMenu({ title, subtitle, items, menu = 'menu', w = 314, slide = false }: SideMenuProps): VNode {
    const { width: W, height: H } = t.panel;
    const close = `IvaUI.off(${jsJoin('d', menu)})`;
    const itemJoin = (page: string): JoinRef => d(`ui_menu_${page.replace(/[^\w]/g, '_')}`);
    const top = title ? 100 : 16;
    return (
      <Group>
        <Subpage name="ui_menu_scrim" w={W} h={H} join={menu} bg="#000000a0" in={{ type: 'fade', time: 0.2 }} out={{ type: 'fade', time: 0.2 }}>
          <Button w={W} h={H} feedback="none" js={close} />
        </Subpage>
        <Subpage name="ui_menu" w={w} h={H} join={menu} bg={t.bar} in={slide ? { type: 'moveIn', from: 'left', time: 0.25 } : { type: 'fade', time: 0.2 }}
                 out={{ type: 'fade', time: 0.2 }}>
          {title && <Text x={26} y={18} w={w - 52} h={40} text={title} font={font} fontSize={28} />}
          {subtitle && <Text x={26} y={56} w={w - 52} h={24} text={subtitle} color={t.muted} font={font} fontSize={16} />}
          {title && <Box x={20} y={88} w={w - 40} h={1} bg={t.raised} />}
          {items.map((it, i) => (
            <Button x={8} y={top + i * 60} w={w - 16} h={52} page={it.page} js={close} join={itemJoin(it.page)} feedback="none"
                    icon={fa(it.icon, { size: 24, color: t.accent })} iconAlign="left" text={it.text}
                    radius={t.radius} bg={t.bar} active={{ bg: t.raised }} font={font} fontSize={20} />
          ))}
        </Subpage>
        {runtime}
        <OnStart js={`IvaUI.menu({ ${items.map((it) => `${JSON.stringify(it.page)}: ${jsJoin('d', itemJoin(it.page))}`).join(', ')} });`} />
      </Group>
    );
  }

  function ConfirmDialog({ join, title = 'Are you sure?', message, confirmText = 'OK', cancelText = 'Cancel', danger = false, onConfirm, w = 520, h = 280 }: ConfirmDialogProps): VNode {
    const { width: W, height: H } = t.panel;
    const close = `IvaUI.off(${jsJoin('d', join)})`;
    const name = `ui_dialog_${keyOf(join)}`;
    return (
      <Group>
        <Subpage name={name} w={W} h={H} join={join} bg="#000000a0" in={{ type: 'fade', time: 0.2 }} out={{ type: 'fade', time: 0.2 }}>
          <Box x={(W - w) / 2} y={(H - h) / 2} w={w} h={h} bg={t.surface} radius={t.radius + 6} />
          <Group x={(W - w) / 2} y={(H - h) / 2}>
            <Text x={32} y={28} w={w - 64} h={40} text={title} font={font} fontSize={26} />
            {message && <Text x={32} y={80} w={w - 64} h={h - 190} text={message} color={t.muted} font={font} fontSize={18} wrap />}
            <IconButton x={w - 32 - 140 - 16 - 140} y={h - 92} w={140} text={cancelText} js={close} />
            <IconButton x={w - 32 - 140} y={h - 92} w={140} text={confirmText} tone={danger ? 'danger' : 'accent'} js={close} cmd={onConfirm} />
          </Group>
        </Subpage>
      </Group>
    );
  }

  /**
   * A colour wheel (hue round it, white in the middle), a brightness slider,
   * a swatch of the colour with its hex, and colours one tap away. iViewer
   * can't colour anything from a script, so the swatch is a web view showing
   * a page of that colour, served by the panel itself (as CommandFusion's
   * ColorPicker2 demo does): a TCP system accepting connections on `port`.
   */
  function ColorPicker({ r, g, b, hex, value, size = 210, swatches = ['#FFFFFF', '#FFE2B8', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#AF52DE'],
                         onChange, port = 8890, bg = t.surface, x = 0, y = 0 }: ColorPickerProps): VNode {
    const key = keyOf(r);
    const id = JSON.stringify(key);
    const m = Math.max(20, Math.round(size * 0.13));
    const mark: JoinRef = s(`ui_${key}_cp_mark`);
    const level: JoinRef = a(`ui_${key}_cp_v`);
    const url: JoinRef = s(`ui_${key}_cp_url`);
    const hexJoin: JoinRef = hex === undefined ? s(`ui_${key}_cp_hex`) : typeof hex === 'object' ? hex : s(hex);
    const system = `IvaUI HTTP ${port}`;
    const right = size + 24;
    const rw = 160;
    const sw = 32;
    const gap = (rw - 4 * sw) / 3;
    const touch = `IvaUI.colorTouch(${id}, gesture.x, gesture.y)`;
    const o = `{ size: ${size}, markSize: ${m}, mark: ${jsJoin('s', mark)}, v: ${jsJoin('a', level)}, r: ${jsJoin('a', r)}, g: ${jsJoin('a', g)}, b: ${jsJoin('a', b)}, ` +
      `hex: ${jsJoin('s', hexJoin)}, url: ${jsJoin('s', url)}, system: ${JSON.stringify(system)}, port: ${port}, value: ${JSON.stringify(value ?? '')} }`;
    const ref = (j: Join): JoinRef => (typeof j === 'object' ? j : a(j));
    return (
      <Group x={x} y={y}>
        {/* in a subpage of its own: the marker moves in the wheel's coordinates, wherever the wheel is */}
        <Subpage name={`ui_cp_${key}`} w={size} h={size}>
          <Image w={size} h={size} src={draw.wheel({ size })}>
            <Gesture type="tap" onBegin={touch} />
            <Gesture type="pan" onBegin={touch} onChange={touch} />
          </Image>
          <Image x={(size - m) / 2} y={(size - m) / 2} w={m} h={m} join={mark} clickthrough
                 src={draw.ring({ size: m, thickness: 3, color: '#FFFFFF', outline: '#00000099' })} />
        </Subpage>
        <Image y={size + 22} w={18} h={18} src={fa('sun', { color: t.muted, size: 14, style: 'regular' })} />
        <IvaSlider x={28} y={size + 25} w={size - 56} h={12} join={level} min={0} max={100} bg={t.raised} fill={t.text} radius={3} />
        <Image x={size - 20} y={size + 20} w={22} h={22} src={fa('sun', { color: t.text, size: 20 })} />
        <Web x={right} w={rw} h={72} join={url} url={`http://127.0.0.1:${port}/iva-color/000000`} />
        <Image x={right} w={rw} h={72} src={draw.cutout({ w: rw, h: 72, radius: t.radius, color: bg })} clickthrough />
        <Text x={right} y={84} w={rw} h={30} join={hexJoin} font={font} fontSize={22} />
        {(swatches || []).slice(0, 8).map((c, i) => (
          <Button x={right + Math.round((i % 4) * (sw + gap))} y={128 + Math.floor(i / 4) * (sw + 12)} w={sw} h={sw} radius={sw / 2} bg={c}
                  borderWidth={1} borderColor={shade(bg, 0.25)} js={`IvaUI.colorSet(${id}, ${JSON.stringify(c)})`} />
        ))}
        <System name={system} protocol="tcp" accept host="0.0.0.0" port={port} localPort={port}>
          <Feedback name="request" regex={'(?msi)^.*?\\r\\n\\r\\n'} />
        </System>
        {runtime}
        <OnStart js={`IvaUI.color(${id}, ${o}, function (r, g, b, hex) { ${onChange ?? ''} });`}
                 joins={[ref(r), ref(g), ref(b), hexJoin, mark, level, url]} />
      </Group>
    );
  }

  /** A text field: a label, the field (an icon, a placeholder while it's empty), the text in a serial join. */
  function TextField({ join, label, value, placeholder, password, icon, cmd, x = 0, y = 0, w = 340, h = 48 }: TextFieldProps): VNode {
    const key = keyOf(join);
    const hint: JoinRef = s(`ui_${key}_hint`);
    const top = label ? 32 : 0;
    const left = icon ? h - 6 : 14;
    const fontSize = Math.round(h * 0.4);
    return (
      <Group x={x} y={y}>
        {label && <Text w={w} h={26} text={label} color={t.muted} font={font} fontSize={16} />}
        <Box y={top} w={w} h={h} bg={t.raised} radius={t.radius} />
        {icon && <Image x={Math.round((h - 20) / 2)} y={top + Math.round((h - 20) / 2)} w={20} h={20} src={fa(icon, { color: t.muted, size: 18 })} />}
        {placeholder && <Text x={left} y={top} w={w - left - 12} h={h} join={hint} color={t.muted} font={font} fontSize={fontSize} />}
        <Input x={left} y={top} w={w - left - 12} h={h} join={join} text={value} password={password} cmd={cmd} color={t.text} font={font} fontSize={fontSize} />
        {placeholder && runtime}
        {placeholder && <OnStart js={`IvaUI.hint(${jsJoin('s', join)}, ${jsJoin('s', hint)}, ${JSON.stringify(placeholder)});`} joins={[hint]} />}
      </Group>
    );
  }

  // ── pickers: a field, and a sheet or a dropdown it opens ─────────

  const HEAD = 64; // a sheet's title row

  /** A field: its text (a serial join), an icon on the right; a tap runs `js`. */
  function field(label: JoinRef, js: string, w: number, h: number, icon: IconRef | false, fontSize: number) {
    const size = Math.min(20, Math.round(h * 0.4));
    return (
      <>
        <Box w={w} h={h} bg={t.raised} radius={t.radius} />
        <Text x={16} w={w - (icon ? 56 : 32)} h={h} join={label} font={font} fontSize={fontSize} />
        {icon && <Image x={w - 16 - size} y={Math.round((h - size) / 2)} w={size} h={size} src={icon} />}
        <Button w={w} h={h} feedback="none" js={js} />
      </>
    );
  }

  /**
   * What a field opens on a digital join: a sheet in the middle of the panel
   * (dimmed behind it, a title, a close button) or a dropdown under the field.
   * A tap outside closes it. `body` is laid out from (0, 0), `pw` x `bh`.
   */
  function popup(name: string, open: JoinRef, mode: PopupMode, fieldH: number, title: string, pw: number, bh: number, body: VNode) {
    const { width: W, height: H } = t.panel;
    const close = `IvaUI.off(${jsJoin('d', open)})`;
    const fade = { type: 'fade' as const, time: 0.15 };
    if (mode === 'sheet') {
      const ph = HEAD + bh + 16;
      return (
        <Subpage name={name} fixed topmost w={W} h={H} join={open} bg="#000000a0" in={fade} out={fade}>
          <Button w={W} h={H} feedback="none" js={close} />
          <Group x={Math.round((W - pw) / 2)} y={Math.round((H - ph) / 2)}>
            <Box w={pw} h={ph} bg={t.surface} radius={t.radius + 4} borderWidth={1} borderColor={t.raised} />
            {/* taps on the sheet stay on it */}
            <Button w={pw} h={ph} feedback="none" />
            <Text x={24} y={12} w={pw - 90} h={44} text={title} font={font} fontSize={24} />
            <Button x={pw - 60} y={10} w={48} h={48} icon={fa('xmark', { size: 22, color: t.muted })} feedback="none" js={close} />
            <Group y={HEAD}>{body}</Group>
          </Group>
        </Subpage>
      );
    }
    return (
      <Group>
        <Subpage name={`${name}_away`} fixed topmost w={W} h={H} join={open}>
          <Button w={W} h={H} feedback="none" js={close} />
        </Subpage>
        <Subpage name={name} topmost y={fieldH + 6} w={pw} h={bh + 16} join={open} bg={t.surface} radius={t.radius}
                 borderWidth={1} borderColor={t.raised} in={fade} out={fade}>
          <Button w={pw} h={bh + 16} feedback="none" />
          <Group y={8}>{body}</Group>
        </Subpage>
      </Group>
    );
  }

  /** Buttons in a row at the foot of a popup: the last one the main one. */
  function footer(buttons: { text: string; js: string; tone?: 'accent' | 'link' }[], pw: number, y: number, h = 52) {
    const gap = 12;
    const bw = Math.floor((pw - 32 - gap * (buttons.length - 1)) / buttons.length);
    return buttons.map((b, i) => (
      <Button x={16 + i * (bw + gap)} y={y} w={bw} h={h} text={b.text} js={b.js} radius={t.radius} font={font} fontSize={19}
              bg={b.tone === 'accent' ? t.accent : t.raised} color={b.tone === 'link' ? t.accent : t.text}
              active={{ bg: b.tone === 'accent' ? shade(t.accent, -0.2) : shade(t.raised, 0.12) }} />
    ));
  }

  /**
   * Drums: one CF list each, a row per value (two blank rows either side, so
   * a value can reach the middle), turned by a finger and snapping to a row;
   * a tap on a row turns it to the middle. The row in the middle (over a band)
   * is the one picked.
   */
  function drums(lists: { list: JoinRef; w: number }[], rowH: number, gap: number, between: (k: number) => string | undefined = () => undefined) {
    const visible = 5;
    const width = lists.reduce((sum, dr) => sum + dr.w, 0) + gap * (lists.length - 1);
    const row = (w: number) => `ui_drum_${w}_${rowH}`;
    const fontSize = Math.round(rowH * 0.56);
    let at = 0;
    const placed = lists.map((dr) => {
      const x = at;
      at += dr.w + gap;
      return { ...dr, x };
    });
    return {
      width,
      height: visible * rowH,
      body: (
        <>
          {[...new Set(lists.map((dr) => dr.w))].map((w) => (
            <Subpage name={row(w)} define w={w} h={rowH}>
              <Text w={w} h={rowH} join={1} align="center" font={font} fontSize={fontSize} />
              <Button w={w} h={rowH} feedback="none" onPress={[jsAction('IvaUI.rowDown(list)')]} onRelease={[jsAction('IvaUI.drumTap(list, listIndex)')]} />
            </Subpage>
          ))}
          <Box x={-8} y={2 * rowH} w={width + 16} h={rowH} bg={t.raised} radius={t.radius} />
          {/* what goes between two drums (the time's colon) */}
          {placed.map((dr, k) => k > 0 && between(k) && (
            <Text x={dr.x - gap} y={2 * rowH} w={gap} h={rowH} text={between(k)} align="center" font={font} fontSize={fontSize} />
          ))}
          {placed.map((dr) => <List x={dr.x} w={dr.w} h={visible * rowH} join={dr.list} item={row(dr.w)} />)}
        </>
      ),
    };
  }

  /** A time field and its drums (see the runtime's IvaUI.picker). */
  function TimePicker({ hour, minute, value, minuteStep = 1, ampm = false, now, mode = 'sheet', title = 'Time', ok = 'OK', cancel = 'Cancel',
                        fontSize = 20, showIcon = true, x = 0, y = 0, w = 332, h = 48 }: TimePickerProps): VNode {
    // two pickers on the same joins that look different: a popup each
    const key = `${keyOf(hour)}_${hash(JSON.stringify([minuteStep, ampm, now, mode, title, ok, cancel, w])).slice(0, 4)}`;
    const id = JSON.stringify(`time_${key}`);
    const open: JoinRef = d(`ui_${key}_tp_open`);
    const label: JoinRef = s(`ui_${key}_tp_text`);
    const step = Math.max(1, Math.min(30, Math.round(minuteStep)));
    const pad = (n: number) => String(n).padStart(2, '0');
    const values = [
      ampm ? Array.from({ length: 12 }, (_, i) => pad(i + 1)) : Array.from({ length: 24 }, (_, i) => pad(i)),
      Array.from({ length: Math.ceil(60 / step) }, (_, i) => pad(i * step)),
      ...(ampm ? [['AM', 'PM']] : []),
    ];
    const lists = values.map((_, k) => ({ list: l(`ui_${key}_tp_${k}`), w: k === 2 ? 76 : 84 }));
    const rowH = 48;
    const dr = drums(lists, rowH, 28, (k) => (k === 1 ? ':' : undefined));
    const pw = Math.max(mode === 'dropdown' ? w : 320, dr.width + 64);
    const bh = dr.height + 16 + 52;
    const buttons = [
      ...(now ? [{ text: now, js: `IvaUI.pickerNow(${id})`, tone: 'link' as const }] : []),
      { text: cancel, js: `IvaUI.off(${jsJoin('d', open)})` },
      { text: ok, js: `IvaUI.pickerOk(${id})`, tone: 'accent' as const },
    ];
    const o = `{ kind: 'time', open: ${jsJoin('d', open)}, label: ${jsJoin('s', label)}, rowH: ${rowH}, watch: [${jsJoin('a', hour)}, ${jsJoin('a', minute)}], ` +
      `step: ${step}, ampm: ${ampm}, value: ${JSON.stringify(value ?? '')}, drums: [${lists.map((ls, k) => `{ list: ${jsJoin('l', ls.list)}, row: ${JSON.stringify(`ui_drum_${ls.w}_${rowH}`)}, values: ${JSON.stringify(values[k])} }`).join(', ')}] }`;
    const ref = (j: Join): JoinRef => (typeof j === 'object' ? j : a(j));
    return (
      <Group x={x} y={y}>
        {field(label, `IvaUI.pickerOpen(${id})`, w, h, showIcon && fa('clock', { style: 'regular', size: 18, color: t.muted }), fontSize)}
        {popup(`ui_tp_${key}`, open, mode, h, title, pw, bh, (
          <>
            <Group x={Math.round((pw - dr.width) / 2)}>{dr.body}</Group>
            {footer(buttons, pw, dr.height + 16)}
          </>
        ))}
        {runtime}
        <OnStart js={`IvaUI.picker(${id}, ${o});`} joins={[ref(hour), ref(minute), open, label, ...lists.map((ls) => ls.list)]} />
      </Group>
    );
  }

  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  /** A date field and its drums (see the runtime's IvaUI.picker). */
  function DatePicker({ day, month, year, value, format = 'DD.MM.YYYY', order = 'dmy', minYear, maxYear, months = MONTHS, today = 'Today',
                        placeholder = 'Pick a date', mode = 'sheet', title = 'Date', ok = 'OK', cancel = 'Cancel', fontSize = 20, showIcon = true,
                        x = 0, y = 0, w = 332, h = 48 }: DatePickerProps): VNode {
    const key = `${keyOf(day)}_${hash(JSON.stringify([format, order, minYear, maxYear, months, today, placeholder, mode, title, ok, cancel, w])).slice(0, 4)}`;
    const id = JSON.stringify(`date_${key}`);
    const open: JoinRef = d(`ui_${key}_dp_open`);
    const label: JoinRef = s(`ui_${key}_dp_text`);
    const thisYear = new Date().getFullYear();
    const y0 = minYear ?? thisYear - 10;
    const y1 = Math.max(y0, maxYear ?? thisYear + 10);
    const values: Record<string, string[]> = {
      d: Array.from({ length: 31 }, (_, i) => String(i + 1)),
      m: months.map((m) => m.slice(0, 3)),
      y: Array.from({ length: y1 - y0 + 1 }, (_, i) => String(y0 + i)),
    };
    const kinds = [...order] as ('d' | 'm' | 'y')[];
    const widths = { d: 72, m: 96, y: 104 };
    const lists = kinds.map((k) => ({ list: l(`ui_${key}_dp_${k}`), w: widths[k] }));
    const rowH = 48;
    const dr = drums(lists, rowH, 24);
    const pw = Math.max(mode === 'dropdown' ? w : 320, dr.width + 64, today ? 340 : 0);
    const bh = dr.height + 16 + 52;
    const buttons = [
      ...(today ? [{ text: today, js: `IvaUI.pickerNow(${id})`, tone: 'link' as const }] : []),
      { text: cancel, js: `IvaUI.off(${jsJoin('d', open)})` },
      { text: ok, js: `IvaUI.pickerOk(${id})`, tone: 'accent' as const },
    ];
    const o = `{ kind: 'date', open: ${jsJoin('d', open)}, label: ${jsJoin('s', label)}, rowH: ${rowH}, watch: [${jsJoin('a', day)}, ${jsJoin('a', month)}, ${jsJoin('a', year)}], ` +
      `order: ${JSON.stringify(order)}, minYear: ${y0}, format: ${JSON.stringify(format)}, months: ${JSON.stringify(months)}, placeholder: ${JSON.stringify(placeholder)}, ` +
      `value: ${JSON.stringify(value ?? '')}, drums: [${lists.map((ls, i) => `{ list: ${jsJoin('l', ls.list)}, row: ${JSON.stringify(`ui_drum_${ls.w}_${rowH}`)}, values: ${JSON.stringify(values[kinds[i]])} }`).join(', ')}] }`;
    const ref = (j: Join): JoinRef => (typeof j === 'object' ? j : a(j));
    return (
      <Group x={x} y={y}>
        {field(label, `IvaUI.pickerOpen(${id})`, w, h, showIcon && fa('calendar', { style: 'regular', size: 18, color: t.muted }), fontSize)}
        {popup(`ui_dp_${key}`, open, mode, h, title, pw, bh, (
          <>
            <Group x={Math.round((pw - dr.width) / 2)}>{dr.body}</Group>
            {footer(buttons, pw, dr.height + 16)}
          </>
        ))}
        {runtime}
        <OnStart js={`IvaUI.picker(${id}, ${o});`} joins={[ref(day), ref(month), ref(year), open, label, ...lists.map((ls) => ls.list)]} />
      </Group>
    );
  }

  /** A number field: a tap opens a keypad on the value; OK checks it's min..max. */
  function NumberField({ join, value, min = 0, max = 100, decimals = 0, digits, unit = '', words = {}, mode = 'sheet', title = 'Value', ok = 'OK',
                         cancel = 'Cancel', fontSize = 20, showIcon = true, x = 0, y = 0, w = 332, h = 48 }: NumberFieldProps): VNode {
    const key = `${keyOf(join)}_${hash(JSON.stringify([min, max, decimals, digits, unit, words, mode, title, ok, cancel, w])).slice(0, 4)}`;
    const id = JSON.stringify(key);
    const open: JoinRef = d(`ui_${key}_nf_open`);
    const label: JoinRef = s(`ui_${key}_nf_text`);
    const display: JoinRef = s(`ui_${key}_nf_entry`);
    const error: JoinRef = s(`ui_${key}_nf_error`);
    const kw = 88;
    const kh = 52;
    const gap = 10;
    const pw = Math.max(mode === 'dropdown' ? w : 0, 3 * kw + 2 * gap + 32);
    const kx = Math.round((pw - (3 * kw + 2 * gap)) / 2);
    const key4 = [min < 0 ? '±' : '', '0', decimals > 0 ? '.' : ''];
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ...key4];
    const press = (k: string) => (k === '±' ? `IvaUI.numKey(${id}, '-')` : `IvaUI.numKey(${id}, ${JSON.stringify(k)})`);
    const top = 52 + 26;
    const bh = top + 4 * kh + 3 * gap + 16 + 52;
    const btn = { radius: t.radius, bg: t.raised, active: { bg: shade(t.raised, 0.12) }, font };
    const range = (words.range ?? 'From {min} to {max}').replace('{min}', String(min)).replace('{max}', String(max));
    const o = { min, max, decimals, digits: digits ?? 0, unit, value, words: { invalid: words.invalid ?? 'Not a number', range } };
    return (
      <Group x={x} y={y}>
        {field(label, `IvaUI.numOpen(${id})`, w, h, showIcon && fa('pen', { size: 16, color: t.muted }), fontSize)}
        {popup(`ui_nf_${key}`, open, mode, h, title, pw, bh, (
          <>
            <Box x={16} w={pw - 32} h={52} bg={t.page} radius={t.radius} />
            <Text x={32} w={pw - 112} h={52} join={display} font={font} fontSize={26} />
            <Button x={pw - 76} y={2} w={56} h={48} icon={fa('delete-left', { size: 22, color: t.muted })} feedback="none" js={`IvaUI.numBack(${id})`} />
            <Text x={16} y={54} w={pw - 32} h={22} join={error} color={t.danger} font={font} fontSize={15} />
            {keys.map((k, i) => k && (
              <Button x={kx + (i % 3) * (kw + gap)} y={top + Math.floor(i / 3) * (kh + gap)} w={kw} h={kh} text={k} js={press(k)} fontSize={24} {...btn} />
            ))}
            {footer([{ text: cancel, js: `IvaUI.off(${jsJoin('d', open)})` }, { text: ok, js: `IvaUI.numOk(${id})`, tone: 'accent' }], pw, top + 4 * kh + 3 * gap + 16)}
          </>
        ))}
        {runtime}
        <OnStart js={`IvaUI.num(${id}, ${JSON.stringify(o).slice(0, -1)}, join: ${jsJoin('a', join)}, open: ${jsJoin('d', open)}, label: ${jsJoin('s', label)}, ` +
                     `display: ${jsJoin('s', display)}, error: ${jsJoin('s', error)} });`}
                 joins={[typeof join === 'object' ? join : a(join), open, label, display, error]} />
      </Group>
    );
  }

  /**
   * A select box with a search field, for long lists: the field opens a sheet
   * (or a dropdown) with a text field over the options; they filter as you
   * type, a tap picks one. Options fixed, or a JSON array in a serial join.
   */
  function SearchSelect({ options, source, join, value, placeholder = 'Pick one', empty = 'Nothing found', rows = 6, rowH = 52, mode = 'sheet', title = '',
                          fontSize = 20, showIcon = true, x = 0, y = 0, w = 340, h = 48 }: SearchSelectProps): VNode {
    const key = `${keyOf(join)}_${hash(JSON.stringify([options, source, placeholder, empty, rows, rowH, mode, title, w])).slice(0, 4)}`;
    const id = JSON.stringify(key);
    const open: JoinRef = d(`ui_${key}_ss_open`);
    const label: JoinRef = s(`ui_${key}_ss_text`);
    const input: JoinRef = s(`ui_${key}_ss_input`);
    const hint: JoinRef = s(`ui_${key}_ss_hint`);
    const none: JoinRef = s(`ui_${key}_ss_none`);
    const list: JoinRef = l(`ui_${key}_ss_list`);
    const pw = mode === 'dropdown' ? w : 440;
    const lw = pw - 32;
    const row = `ui_ss_row_${lw}_${rowH}`;
    const bh = 48 + 8 + rows * rowH;
    const o = `{ join: ${jsJoin('a', join)}, label: ${jsJoin('s', label)}, input: ${jsJoin('s', input)}, hint: ${jsJoin('s', hint)}, none: ${jsJoin('s', none)}, ` +
      `list: ${jsJoin('l', list)}, open: ${jsJoin('d', open)}, row: ${JSON.stringify(row)}, options: ${JSON.stringify(options ?? [])}, ` +
      `source: ${source === undefined ? 'null' : jsJoin('s', source)}, placeholder: ${JSON.stringify(placeholder)}, empty: ${JSON.stringify(empty)}` +
      `${value !== undefined ? `, value: ${value}` : ''} }`;
    return (
      <Group x={x} y={y}>
        {field(label, `IvaUI.selectOpen(${id})`, w, h, showIcon && fa('chevron-down', { size: 18, color: t.muted }), fontSize)}
        <Subpage name={row} define w={lw} h={rowH}>
          <Text x={8} w={lw - 16} h={rowH} join={1} font={font} fontSize={20} />
          <Box x={8} y={rowH - 1} w={lw - 16} h={1} bg={t.raised} />
          <Button w={lw} h={rowH} feedback="none" active={{ bg: '#FFFFFF14' }}
                  onPress={[jsAction('IvaUI.rowDown(list)')]} onRelease={[jsAction('IvaUI.selectPick(list, listIndex)')]} />
        </Subpage>
        {popup(`ui_ss_${key}`, open, mode, h, title, pw, bh, (
          <>
            <Box x={16} w={pw - 32} h={48} bg={t.raised} radius={t.radius} />
            <Image x={30} y={14} w={20} h={20} src={fa('magnifying-glass', { size: 18, color: t.muted })} />
            <Text x={60} w={pw - 92} h={48} join={hint} color={t.muted} font={font} fontSize={19} />
            <Input x={60} w={pw - 92} h={48} join={input} color={t.text} font={font} fontSize={19} />
            <Text x={24} y={64} w={pw - 48} h={rowH} join={none} color={t.muted} font={font} fontSize={18} />
            <List x={16} y={56} w={lw} h={rows * rowH} join={list} item={row} />
          </>
        ))}
        {runtime}
        <OnStart js={`IvaUI.select(${id}, ${o});`}
                 joins={[typeof join === 'object' ? join : a(join), open, label, input, hint, none, list, ...(source !== undefined ? [typeof source === 'object' ? source : s(source)] : [])]} />
      </Group>
    );
  }

  return {
    theme: t, Card, Icon, IconButton, Tile, Badge, Stat, Toggle, Slider, Stepper, Segmented, SceneBar, Dimmer, Dial, Knob, Thermostat, Blinds,
    RadioGroup, CheckBox, CheckBoxGroup, SelectBox, ListRow, DataList, ScrollBox, WeekDays, PinPad, AlarmCard, NavCard, Header, SideMenu, ConfirmDialog,
    ColorPicker, TextField, SearchSelect, TimePicker, DatePicker, NumberField,
  };
}

/** The components in the default theme. */
export const ui: Ui = createUi();
export const Card: Ui['Card'] = ui.Card;
export const Icon: Ui['Icon'] = ui.Icon;
export const IconButton: Ui['IconButton'] = ui.IconButton;
export const Tile: Ui['Tile'] = ui.Tile;
export const Badge: Ui['Badge'] = ui.Badge;
export const Stat: Ui['Stat'] = ui.Stat;
export const Toggle: Ui['Toggle'] = ui.Toggle;
export const Slider: Ui['Slider'] = ui.Slider;
export const Stepper: Ui['Stepper'] = ui.Stepper;
export const Segmented: Ui['Segmented'] = ui.Segmented;
export const SceneBar: Ui['SceneBar'] = ui.SceneBar;
export const Dimmer: Ui['Dimmer'] = ui.Dimmer;
export const Blinds: Ui['Blinds'] = ui.Blinds;
export const Dial: Ui['Dial'] = ui.Dial;
export const Knob: Ui['Knob'] = ui.Knob;
export const Thermostat: Ui['Thermostat'] = ui.Thermostat;
export const RadioGroup: Ui['RadioGroup'] = ui.RadioGroup;
export const CheckBox: Ui['CheckBox'] = ui.CheckBox;
export const CheckBoxGroup: Ui['CheckBoxGroup'] = ui.CheckBoxGroup;
export const SelectBox: Ui['SelectBox'] = ui.SelectBox;
export const ListRow: Ui['ListRow'] = ui.ListRow;
export const DataList: Ui['DataList'] = ui.DataList;
export const ScrollBox: Ui['ScrollBox'] = ui.ScrollBox;
export const WeekDays: Ui['WeekDays'] = ui.WeekDays;
export const PinPad: Ui['PinPad'] = ui.PinPad;
export const AlarmCard: Ui['AlarmCard'] = ui.AlarmCard;
export const ColorPicker: Ui['ColorPicker'] = ui.ColorPicker;
export const TextField: Ui['TextField'] = ui.TextField;
export const SearchSelect: Ui['SearchSelect'] = ui.SearchSelect;
export const TimePicker: Ui['TimePicker'] = ui.TimePicker;
export const DatePicker: Ui['DatePicker'] = ui.DatePicker;
export const NumberField: Ui['NumberField'] = ui.NumberField;
export const NavCard: Ui['NavCard'] = ui.NavCard;
export const Header: Ui['Header'] = ui.Header;
export const SideMenu: Ui['SideMenu'] = ui.SideMenu;
export const ConfirmDialog: Ui['ConfirmDialog'] = ui.ConfirmDialog;
export default ui;

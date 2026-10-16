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
  Box, Button as IvaButton, Gesture, Group, Image, Input, List, OnStart, Page, Script, Slider as IvaSlider, Subpage, Text as IvaText, Web, WebApp,
  a, d, draw, drawnFile, drawnFileName, drawnSet, fa, js as jsAction, l, s, screen, variant,
  type ButtonProps, type Child, type IconRef, type Join, type JoinRef, type TextProps, type Transition, type VNode,
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
  /** the panel size: Header, SideMenu, dialogs use it (default: screen(), the size being built) */
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
  /** how far down the content sits (grid(): centred in a card taller than it's laid out for) */
  dy?: number;
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
  /** list join: lines need one (a script fills them); children don't */
  join?: Join;
  /** lines of text, a row each; or children: anything, scrolled as one */
  lines?: string[];
  children?: Child;
  /** the children's height (default: as far down as they go); horizontal: their width */
  contentH?: number;
  /** children scrolled sideways */
  horizontal?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  rowH?: number;
}
export interface ScrollAreaProps {
  /** the area: default the panel below the header (y 72) */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** placed as on the page; they scroll when they go further down than the area */
  children?: Child;
}
export interface ScreensProps {
  /** the section's page: its first screen (a menu, a NavCard flips to it); the others are pages named `name / title` */
  name: string;
  /** a tab each: its title, and what's on it - placed as on a page, in ui.screenArea (under the tabs); it scrolls when it goes further down */
  screens: { title: string; content: Child }[];
  /** on every screen, over its content: the header, the side menu */
  shell?: Child;
  /** the pages' background (default: the theme's page colour) */
  bg?: string;
  /** how its page comes when flipped to, a section of one screen (a page transition: { type, from, time, ease }); tabTransition's default */
  transition?: Transition;
  /**
   * with tabs: how each screen's page comes, the first one's too - from a
   * menu as well (default: transition). iViewer plays a page's own
   * transition whoever flips to it, a tab or a menu
   */
  tabTransition?: Transition;
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
export interface TrendCurve {
  /** an analog join (0..65535 stands for `scale`), or a serial one with the number as text: s('supply') */
  join: Join;
  label: string;
  color?: string;
  scale?: [number, number];
  decimals?: number;
  unit?: string;
  /** an axis of its own, on the right */
  side?: 'left' | 'right';
  width?: number;
}
export interface TrendProps {
  curves: TrendCurve[];
  title?: string;
  /** the range buttons, in seconds (default 5 min, 15 min, 1 h) */
  ranges?: number[];
  /** the range shown first */
  range?: number;
  /** the left axis (default: to fit) and the right one */
  min?: number;
  max?: number;
  rightMin?: number;
  rightMax?: number;
  /** the panel samples the joins every so many seconds (default 1) */
  every?: number;
  /** a panel function answering history(from, to) (ms) with { names, rows } - a database, say; default: what the panel recorded */
  history?: string;
  /** names its web app (default: from the curves) */
  name?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface ChartDataset {
  label?: string;
  data?: number[];
  /** a join per label, live: analog (0..65535 stands for `scale`) or serial with a number */
  joins?: Join[];
  scale?: [number, number];
  color?: string;
  /** a colour per value (pie, doughnut) */
  colors?: string[];
  fill?: boolean;
}
export interface ChartProps {
  type?: 'bar' | 'line' | 'doughnut' | 'pie' | 'radar' | 'polarArea';
  labels?: string[];
  datasets?: ChartDataset[];
  /** serial join: the data as JSON - { labels, datasets: [{ data }] } or [numbers] - redrawn when it changes */
  source?: Join;
  /** bars across */
  horizontal?: boolean;
  stacked?: boolean;
  min?: number;
  max?: number;
  unit?: string;
  legend?: boolean;
  title?: string;
  /** names its web app (default: from what it shows) */
  name?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

/** A row tone (DataTable, AlarmTable): a tint behind the row, and its badge. */
export type RowTone = 'alarm' | 'warning' | 'ok' | 'muted' | 'running' | 'heating' | 'cooling' | 'offline' | 'alarmAck' | 'warningAck';
export interface TableColumn {
  /** the row field it shows */
  key: string;
  title: string;
  /** width (default: an equal share of what's left) */
  w?: number;
  align?: 'left' | 'center' | 'right';
  /** digits after the point, for numbers */
  decimals?: number;
  /** shown as a badge in the row's tone */
  badge?: boolean;
}
export interface DataTableProps {
  columns: TableColumn[];
  /** the rows; or `source` */
  data?: Record<string, unknown>[];
  /** serial join with the rows as a JSON array (a script or a feedback fills it) */
  source?: Join;
  /** the field that names a row: a tap selects it, `selected` gets it */
  keyField?: string;
  /** serial join: the selected row's key (both ways) */
  selected?: Join;
  /** the field naming the row's tone (alarm, warning, ok, muted, running, heating, cooling, offline) */
  toneKey?: string;
  /** a search field over the table (default true) */
  search?: boolean;
  placeholder?: string;
  /** JavaScript run on a tap, with `row` (the row's object) */
  onSelect?: string;
  words?: { rows?: string; of?: string; empty?: string };
  rowH?: number;
  fontSize?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface AlarmCondition {
  /** the alarm's id */
  id: string;
  text: string;
  source?: string;
  severity?: 'alarm' | 'warning';
  /** the join watched ('d12', d('door'), a('temp')) */
  join: Join;
  /** active while the join's value is above / below / equal to */
  above?: number;
  below?: number;
  equals?: number | string;
}
export interface AlarmTableProps {
  /** names it for AlarmBanner and IvaAlarms (IvaAlarms.raise('plant', {...})) */
  name: string;
  /** alarms raised and cleared on the panel, from joins */
  conditions?: AlarmCondition[];
  /** serial join with alarms as a JSON array ({ id, text, source, severity, active, acked }) */
  source?: Join;
  /** serial join: the counts as text ("2 alarms · 1 warning · 3 unacked") */
  summary?: Join;
  rowH?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface AlarmBannerProps {
  /** the AlarmTable's name */
  alarms: string;
  /** a tap: a page, or JavaScript */
  page?: string;
  js?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}
export interface BreadcrumbsProps {
  /** where you are: strings or { label, page, js }; all but the last are links */
  items: (string | { label: string; page?: string; js?: string })[];
  /** a back arrow first (to the previous page) */
  back?: boolean;
  separator?: string;
  fontSize?: number;
  x?: number;
  y?: number;
  h?: number;
}
export interface LoaderProps {
  /** digital join: shown while on */
  join: Join;
  /** the text under the spinner, or a serial join's */
  text?: string;
  textJoin?: Join;
  icon?: string;
}
export interface DragItem {
  id: string;
  label: string;
  /** a Font Awesome icon's name */
  icon?: string;
  /** where it is (default: in a row, in order) */
  x?: number;
  y?: number;
}
export interface DropTarget {
  id: string;
  label: string;
  icon?: string;
  /** serial join: the label of the item dropped on it (shown on it) */
  value?: Join;
  /** the items it takes (default: all) */
  accept?: string[];
  x?: number;
  y?: number;
}
export interface DragDropProps {
  /** names its joins */
  name: string;
  /** what can be dragged: tiles of an icon and a label (they stay where they are: a palette) */
  items: DragItem[];
  /** where they go: cards that light up under a dragged item, showing the last one dropped */
  targets: DropTarget[];
  /** JavaScript run on a drop, with `item` and `target` (ids) */
  onDrop?: string;
  /** shown on a target with nothing on it */
  placeholder?: string;
  itemW?: number;
  itemH?: number;
  targetW?: number;
  targetH?: number;
  gap?: number;
  x?: number;
  y?: number;
  w: number;
  h: number;
}
export interface PagerProps {
  /** analog join: the page shown (0, 1, ...), both ways */
  join: Join;
  /** the first page shown */
  value?: number;
  /** the dots under the pages (default true) */
  dots?: boolean;
  x?: number;
  y?: number;
  w: number;
  h: number;
  /** one page per child */
  children?: Child;
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
  /** default 210; taller: the time and the days in the middle of it */
  h?: number;
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
  /** slide in from the left and back out (default); false: fade */
  slide?: boolean;
  /** open by a swipe from the left edge, closed by one to the left (default true) */
  swipe?: boolean;
  /** where the edge a swipe opens it from starts (under the header: default 72) */
  top?: number;
  /** how wide that edge is (default 16) */
  edge?: number;
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
  /**
   * Cards on the panel, whatever its size: items by name (the size each is
   * laid out at), rows of names stretched across, taller when there's room
   * (lists, tables, charts take it: grow). A Cell per name: <Card {...cells.x}>.
   */
  grid: <K extends string>(items: Record<K, GridItem>, rows: GridRow<K>[], o?: GridOptions) => Record<K, Cell>;
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
  ScrollArea: (p: ScrollAreaProps) => VNode;
  /**
   * A section as screens a tab apart, a page each: what a ScrollArea can't
   * scroll (lists, subpages, gestures - in iViewer a list's rows hold none)
   * gets a screen of its own on a phone.
   */
  Screens: (p: ScreensProps) => VNode;
  /** Where a screen's content goes (ui.Screens: under its tabs): grid(items, rows, ui.screenArea), <Card {...ui.screenArea}>. */
  screenArea: { x: number; y: number; w: number; h: number };
  WeekDays: (p: WeekDaysProps) => VNode;
  PinPad: (p: PinPadProps) => VNode;
  ColorPicker: (p: ColorPickerProps) => VNode;
  TextField: (p: TextFieldProps) => VNode;
  SearchSelect: (p: SearchSelectProps) => VNode;
  TimePicker: (p: TimePickerProps) => VNode;
  DatePicker: (p: DatePickerProps) => VNode;
  NumberField: (p: NumberFieldProps) => VNode;
  DataTable: (p: DataTableProps) => VNode;
  Trend: (p: TrendProps) => VNode;
  Chart: (p: ChartProps) => VNode;
  AlarmTable: (p: AlarmTableProps) => VNode;
  AlarmBanner: (p: AlarmBannerProps) => VNode;
  Breadcrumbs: (p: BreadcrumbsProps) => VNode;
  Loader: (p: LoaderProps) => VNode;
  Pager: (p: PagerProps) => VNode;
  DragDrop: (p: DragDropProps) => VNode;
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

// ── the drawings' names (iva's names.ts: readable, one a drawing) ──────────
/** a join as a name: its own (join="temp", a('temp')), else the component's and its number (dial 120) */
const joinLabel = (j: Join | undefined, kind: string): string => {
  const id = typeof j === 'object' ? j.id : j;
  return typeof id === 'string' && !/^\d+$/.test(id) ? id : `${kind} ${id ?? ''}`.trim();
};
/** what a drawn box looks like: 600x46-r8-1e2329-b2-ff3b30 (size, corner radius, fill, border) */
const boxLook = (o: { w: number; h: number; radius?: number; fill?: string; borderWidth?: number; borderColor?: string }): string =>
  [`${Math.round(o.w)}x${Math.round(o.h)}`, o.radius ? `r${Math.round(o.radius)}` : '', drawnFileName(o.fill ?? ''),
    o.borderWidth && o.borderColor ? `b${o.borderWidth}-${drawnFileName(o.borderColor)}` : ''].filter(Boolean).join('-');
/** an icon's file: icons/<its name>, else with its colour, else its size too */
const iconFileOf = (name: string, color: string, size: number): string => {
  const n = `icons/${drawnFileName(name) || 'icon'}`;
  return drawnFile(`icon|${name}|${color}|${size}`, [n, `${n}-${drawnFileName(color)}`, `${n}-${drawnFileName(color)}-${size}`]);
};
/** a set's place among its kind's (the 2nd dial): the same in each look's evaluation, as the looks are the same elements */
const places = new Map<string, number>();
const placeOf = (kind: string): string => {
  const n = places.get(kind) ?? 0;
  places.set(kind, n + 1);
  return String(n);
};
/** a see-through image (a layer for the finger): backgrounds/clear-WxH */
const clearOf = (w: number, h: number): string => drawnFile(`clear|${w}x${h}`, [`backgrounds/clear-${Math.round(w)}x${Math.round(h)}`]);

/** How far right elements go (x + w), groups' offsets added: a sideways ScrollBox's content width. */
function rightOf(c: Child, dx = 0): number {
  if (Array.isArray(c)) return c.reduce<number>((m, k) => Math.max(m, rightOf(k, dx)), 0);
  if (!c || typeof c !== 'object') return 0;
  const n = c as VNode;
  if (n.type === 'Subpage' && n.props.define) return 0;
  const x = dx + (Number(n.props?.x) || 0);
  if (n.type === 'Group') return rightOf(n.children, x);
  return n.props?.w !== undefined ? x + Number(n.props.w) : 0;
}

/**
 * Subpages over the whole panel (fixed: a sheet, a dialog) taken out of what a
 * list scrolls, to go on the page - in the list they'd scroll with it. A
 * dropdown's (its own subpage of the same join stays) stays with it.
 */
function liftFixed(children: Child): { content: Child; lifted: VNode[] } {
  const lifted: VNode[] = [];
  const stays = new Set<string>();
  const scan = (c: Child) => {
    if (Array.isArray(c)) return c.forEach(scan);
    if (!c || typeof c !== 'object') return;
    const n = c as VNode;
    if (n.type === 'Subpage' && !n.props.fixed && n.props.join !== undefined) stays.add(JSON.stringify(n.props.join));
    n.children?.forEach(scan);
  };
  scan(children);
  const walk = (c: Child): Child => {
    if (Array.isArray(c)) return c.map(walk);
    if (!c || typeof c !== 'object') return c;
    const n = c as VNode;
    if (n.type === 'Subpage' && n.props.fixed && !stays.has(JSON.stringify(n.props.join))) {
      lifted.push(n);
      return null;
    }
    return n.children?.length ? { ...n, children: n.children.map(walk) } : n;
  };
  return { content: walk(children), lifted };
}

/**
 * How far down elements go (y + h), groups' offsets added: a ScrollBox's
 * content height. What's over it doesn't count: a sheet over the panel
 * (fixed), a dropdown (a topmost subpage).
 */
function bottomOf(c: Child, dy = 0): number {
  if (Array.isArray(c)) return c.reduce<number>((m, k) => Math.max(m, bottomOf(k, dy)), 0);
  if (!c || typeof c !== 'object') return 0;
  const n = c as VNode;
  if (n.type === 'Subpage' && (n.props.define || n.props.fixed || n.props.topmost)) return 0;
  const y = dy + (Number(n.props?.y) || 0);
  if (n.type === 'Group') return bottomOf(n.children, y);
  return n.props?.h !== undefined ? y + Number(n.props.h) : 0;
}

/** A short stable hash (file names for drawings that look the same). */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * About how wide a text is drawn (Helvetica / Arial advances, 1/1000 em):
 * enough to place things after a label sized to it.
 */
const ADVANCES: Record<string, number> = Object.fromEntries([
  ...[...' !,./:;I[\\]ijlt|'].map((c) => [c, c === 'i' || c === 'j' || c === 'l' ? 222 : c === 't' || c === 'I' ? 278 : 278]),
  ...[...'frJ"()*-`{}'].map((c) => [c, c === 'J' ? 500 : c === '"' ? 355 : c === '*' ? 389 : 333]),
  ...[...'cksvxyz'].map((c) => [c, 500]),
  ...[...'FTZL'].map((c) => [c, c === 'L' ? 556 : 611]),
  ...[...'ABEKPSVXY'].map((c) => [c, 667]),
  ...[...'CDHNRUw'].map((c) => [c, 722]),
  ...[...'GOQ'].map((c) => [c, 778]),
  ...[...'Mm'].map((c) => [c, 833]),
  ['W', 944], ['%', 889], ['@', 1015], ['&', 667],
]);
function textWidth(text: string, size: number): number {
  let w = 0;
  for (const c of text) w += ADVANCES[c] ?? (c.charCodeAt(0) > 0x2e80 ? 1000 : 556);
  return Math.ceil((w * size) / 1000);
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
  // the panel: the size being built (screen()), unless the theme says
  const t: UiTheme = { ...base, ...theme, ...own, panel: { ...screen(), ...(theme.panel ?? {}), ...(own.panel ?? {}) } };
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

  function Card({ title, x = 0, y = 0, w = 380, h = 280, dy = 0, children }: CardProps): VNode {
    return (
      <Group x={x} y={y}>
        <Box w={w} h={h} bg={t.surface} radius={t.radius + 4} />
        {title && <Text x={28} y={18} w={w - 56} h={30} text={title.toUpperCase()} color={t.muted} font={font} fontSize={15} />}
        {dy ? <Group y={dy}>{children}</Group> : children}
      </Group>
    );
  }

  /** Cards laid out on the panel, below the header by default (layoutGrid). */
  function grid<K extends string>(items: Record<K, GridItem>, rows: GridRow<K>[], { x = 16, y = 88, w, h, gap = 16 }: GridOptions = {}): Record<K, Cell> {
    return layoutGrid(items, rows, { x, y, w: w ?? t.panel.width - 2 * x, h: h ?? t.panel.height - y - 16 }, gap);
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
    // its drawings in a folder of its own, named after it (dials/thermostat/): the frames 0.png ..., the track, the dot
    const prefix = `${drawnSet('dials', `${size}|${th}|${sweep}|${steps}|${color}|${t.raised}`, label ?? joinLabel(join, 'dial'), 'dial', variant(), placeOf('dials'))}/`;
    const frames = Array.from({ length: steps + 1 }, (_, i) => draw.arc({ size, thickness: th, from, to: from + (sweep * i) / steps, color, name: `${prefix}${i}` }));
    const arcJoin: JoinRef = s(`ui_${key}_arc`);
    const thumbJoin: JoinRef = s(`ui_${key}_thumb`);
    const text: JoinRef = s(`ui_${key}_value`);
    const touch = `IvaUI.dialTouch(${id}, gesture.x, gesture.y)`;
    const o = { prefix, steps, sweep, size, min, max, step: step ?? 0, decimals, unit };
    return (
      <Group x={x} y={y}>
        <Image w={size} h={size} src={draw.arc({ size, thickness: th, from, to: -from, color: t.raised, name: `${prefix}track` })}>
          <Gesture type="tap" onBegin={touch} />
          <Gesture type="pan" onBegin={touch} onChange={touch} />
        </Image>
        <Image w={size} h={size} join={arcJoin} src={frames[0]} clickthrough />
        <Image w={size} h={size} join={thumbJoin} src={draw.dot({ size, ring: size / 2 - th / 2 - 1, at: from, diameter: Math.round(th * 1.7), color: '#FFFFFF', name: `${prefix}dot` })} clickthrough />
        <Text y={Math.round(size * 0.33)} w={size} h={Math.round(size * 0.26)} join={text} align="center" font={font} fontSize={Math.round(size * 0.18)} />
        {(label || labelJoin) && (
          <Text y={Math.round(size * 0.58)} w={size} h={Math.round(size * 0.12)} text={label} join={labelJoin} align="center" color={t.muted} font={font} fontSize={Math.round(size * 0.075)} />
        )}
        {/* every frame in the .gui, so iViewer ships / caches them: in a subpage only defined - one on the page,
            hidden or not, had the device load all 51 at full size each time the page showed */}
        <Subpage name={`ui_frames_${prefix.replace(/\W/g, '_')}`} define w={1} h={1}>
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
    // its drawings in a folder of its own, named after it (knobs/volume/): the ticks, the knob
    const folder = drawnSet('knobs', `${size}|${disc}|${color}|${pointer}|${sweep}|${t.muted}`, label ?? joinLabel(join, 'knob'), 'knob', variant(), placeOf('knobs'));
    return (
      <Group x={x} y={y}>
        <Image w={size} h={size} src={draw.ticks({ size, count: 28, from, to: -from, length: Math.round(size * 0.07), width: 2, color: t.muted, name: `${folder}/ticks` })}>
          <Gesture type="tap" onBegin={touch} />
          <Gesture type="pan" onBegin={touch} onChange={touch} />
        </Image>
        <Image x={(size - disc) / 2} y={(size - disc) / 2} w={disc} h={disc} join={knobJoin} clickthrough
               src={draw.knob({ size: disc, color, pointer, at: from, name: `${folder}/knob` })} />
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
    const iconFile = (name: string, color: string) => iconFileOf(name, color, 26);
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

  /**
   * Lines of text to drag through; or `children` scrolled as one (iViewer
   * scrolls lists only): a list with no rows whose header subpage they are, as
   * GUI Designer projects scroll a panel of controls - everything in it works
   * as anywhere, its joins the page's own. Sheets over the whole panel go on
   * the page (in the list they'd scroll away).
   */
  function ScrollBox({ join, lines = [], children, contentH, horizontal = false, x = 0, y = 0, w = 232, h = 232, rowH = 50 }: ScrollBoxProps): VNode {
    if (children !== undefined) {
      // the list's header subpage (no rows: nothing to fill, the joins in it the page's own), as
      // GUI Designer projects scroll a panel of controls; sheets over the panel go on the page
      const { content, lifted } = liftFixed(children);
      // named after what's in it, its colours aside (the same name in every look): the same content (a
      // side menu on every page) is one subpage
      const look = /^#[0-9a-f]{3,8}$|iva_\w*[0-9a-f]{8}/i;
      const shape = JSON.stringify([content, w, h, horizontal], (_k, v) => (typeof v === 'string' && look.test(v) ? '' : v));
      const sub = `ui_scroll_${join !== undefined ? keyOf(join) : hash(shape)}`;
      const size = contentH ?? (horizontal ? Math.max(w, rightOf(content)) : Math.max(h, bottomOf(content)));
      return (
        <Group x={x} y={y}>
          <Subpage name={sub} define w={horizontal ? size : w} h={horizontal ? h : size}>{content}</Subpage>
          <List w={w} h={h} join={join === undefined ? undefined : typeof join === 'object' ? join : l(join)} header={sub}
                orientation={horizontal ? 'horizontal' : undefined} />
          {lifted}
        </Group>
      );
    }
    if (join === undefined) throw new Error('ScrollBox: lines need a join (a list a script fills)');
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

  /**
   * A page's content that scrolls when it goes further down than the panel:
   * placed as on the page, it goes in a ScrollBox below the header then (a
   * list with it as its header subpage); else it's placed as it is.
   */
  function ScrollArea({ x = 0, y = 72, w = t.panel.width, h, children }: ScrollAreaProps): VNode {
    const height = h ?? t.panel.height - y;
    const bottom = bottomOf(children) + 16;
    if (bottom <= y + height) return <Group>{children}</Group>;
    return (
      <ScrollBox x={x} y={y} w={w} h={height} contentH={bottom - y}>
        <Group x={-x} y={-y}>{children}</Group>
      </ScrollBox>
    );
  }

  /** ui.Screens' tabs: under the header */
  const tabs = { y: 80, h: 40 };
  const screenArea = { x: 16, y: tabs.y + tabs.h + 12, w: t.panel.width - 32, h: t.panel.height - (tabs.y + tabs.h + 12) - 16 };

  /**
   * A section as screens a tab apart: a page each (the first named `name`,
   * the others `name / title`), the tabs under the header - a tap on one
   * flips to its page. In iViewer a ScrollArea is a list, and a list's
   * rows (its header too) hold no list, subpage or gesture: a DataList, a
   * Pager, a Dial in one stay empty or dead. Where a page of them doesn't fit
   * (a phone), they get screens of their own; content that goes further down
   * than the screen scrolls, if it can.
   */
  function Screens({ name, screens, shell, bg = t.page, transition, tabTransition = transition }: ScreensProps): VNode {
    const W = t.panel.width;
    const names = screens.map((sc, i) => (i ? `${name} / ${sc.title}` : name));
    const seg = (W - 32 - 8) / screens.length;
    // a page comes with its own transition, whoever flips to it (a button can't give its own): with
    // tabs the first screen is a tab too - a tab back to it would come in as the section does
    const own = screens.length > 1 ? tabTransition : transition;
    return (
      <>
        {screens.map((sc, i) => (
          <Page name={names[i]} bg={bg} transition={own}>
            <Box x={16} y={tabs.y} w={W - 32} h={tabs.h} bg={t.raised} radius={t.radius} />
            {screens.map((tab, k) => (
              <Button x={20 + Math.round(k * seg)} y={tabs.y + 4} w={Math.round((k + 1) * seg) - Math.round(k * seg)} h={tabs.h - 8} text={tab.title}
                      radius={t.radius - 3} font={font} fontSize={16}
                      {...(k === i ? { bg: t.accent, color: t.text } : { bg: t.raised, color: t.muted, active: { bg: shade(t.raised, 0.12), color: t.text }, page: names[k] })} />
            ))}
            <ScrollArea y={tabs.y + tabs.h + 4}>{sc.content}</ScrollArea>
            {shell}
          </Page>
        ))}
      </>
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
                       x = 0, y = 0, w = 620, h = 210 }: AlarmCardProps): VNode {
    const summary: JoinRef = s(`ui_${keyOf(days)}_summary`);
    const dy = Math.max(0, Math.round((h - 210) / 2));
    return (
      <Group x={x} y={y}>
        <Box w={w} h={h} bg={t.surface} radius={t.radius + 4} />
        <Text x={28} y={12} w={w - 160} h={40} text={title} color={t.muted} font={font} fontSize={21} />
        <Button x={w - 124} y={12} w={96} h={36} join={on} feedback="toggle" text="OFF" activeText="ON" radius={18} bg={t.raised} color={t.muted}
                active={{ bg: t.accent, color: t.text }} font={font} fontSize={15} />
        <TimePicker x={24} y={56 + dy} w={ampm ? 260 : 200} h={64} hour={hour} minute={minute} value={value} minuteStep={minuteStep} ampm={ampm}
                    title={timeTitle ?? title} fontSize={40} />
        <Text x={w - 220} y={56 + dy} w={192} h={64} join={summary} align="right" color={t.muted} font={font} fontSize={21} />
        <WeekDays x={24} y={138 + dy} join={days} value={daysValue} textJoin={summary} size={Math.min(52, Math.floor((w - 48 - 48) / 7))} />
        {onValue && <OnStart js={`CF.setJoin(${jsJoin('d', on)}, 1);`} />}
      </Group>
    );
  }

  function NavCard({ icon, title, text, page, x = 0, y = 0, w = 380, h = 180 }: NavCardProps): VNode {
    // a narrow card (two across a phone): smaller, the title on up to two lines, the text under it on three
    if (w < 260) {
      const m = 18;
      return (
        <Group x={x} y={y}>
          <Button w={w} h={h} page={page} radius={t.radius + 4} bg={t.surface} active={{ bg: t.raised }}
                  icon={{ src: fa(icon, { size: 30, color: t.accent }), x: m, y: m }} />
          <Text x={m} y={m + 42} w={w - 2 * m} h={48} text={title} wrap valign="top" font={font} fontSize={18} />
          {text && <Text x={m} y={m + 92} w={w - 2 * m} h={Math.max(20, h - m - 102)} text={text} wrap valign="top" color={t.muted} font={font} fontSize={14} />}
        </Group>
      );
    }
    return (
      <Group x={x} y={y}>
        <Button w={w} h={h} page={page} radius={t.radius + 4} bg={t.surface} active={{ bg: t.raised }}
                icon={{ src: fa(icon, { size: 36, color: t.accent }), x: 22, y: 22 }} />
        {/* a tall card: the text on two lines, from the top, when it's long; a short one: one line, below the icon */}
        <Text x={22} y={h - (h >= 170 ? 92 : 74)} w={w - 44} h={32} text={title} font={font} fontSize={22} />
        {text && (h >= 170
          ? <Text x={22} y={h - 58} w={w - 44} h={44} text={text} wrap valign="top" color={t.muted} font={font} fontSize={16} />
          : <Text x={22} y={h - 44} w={w - 44} h={24} text={text} color={t.muted} font={font} fontSize={16} />)}
      </Group>
    );
  }

  function Header({ title, section, home = 'Overview', menu = 'menu', clock = true, themeToggle = false, w = t.panel.width, h = 72 }: HeaderProps): VNode {
    const left = menu === false ? 24 : 84;
    const clockJoin: JoinRef = s('ui_clock');
    const titleW = Math.round(title.length * 15 + 30);
    // on a narrow panel the clock goes first, then the breadcrumbs
    const free = w - left - titleW - (themeToggle ? 80 : 0);
    const crumbsW = section ? 30 + 100 + textWidth(section, 20) + 16 : 0;
    const withClock = clock && free >= 160 + crumbsW;
    const withCrumbs = !!section && free >= crumbsW + (withClock ? 160 : 0);
    const showClock = clock && (withClock || (!withCrumbs && free >= 160));
    const showCrumbs = withCrumbs;
    return (
      <Group>
        <Box w={w} h={h} bg={t.bar} />
        {menu !== false && (
          <Button x={12} y={Math.round((h - 56) / 2)} w={56} h={56} icon={fa('bars', { size: 26 })} feedback="none"
                  js={`CF.setJoin(${jsJoin('d', menu)}, 1)`} />
        )}
        <Text x={left} w={titleW} h={h} text={title} font={font} fontSize={30} />
        {showCrumbs && (
          <Group x={left + titleW + 30}>
            <Button w={70} h={h} text="Home" page={home} feedback="none" color={t.accent} active={{ color: shade(t.accent, 0.4) }} font={font} fontSize={20} />
            <Text x={74} w={20} h={h} text={'›'} color={t.muted} font={font} fontSize={20} />
            <Text x={100} w={400} h={h} text={section} font={font} fontSize={20} />
          </Group>
        )}
        {themeToggle && (
          <Button x={w - (showClock ? 230 : 80)} y={Math.round((h - 56) / 2)} w={56} h={56} icon={fa('circle-half-stroke', { size: 26 })} feedback="none"
                  js="if (typeof IvaTheme !== 'undefined') IvaTheme.toggle();" />
        )}
        {showClock && <Text x={w - 160} w={136} h={h} join={clockJoin} align="right" color={t.muted} font={font} fontSize={30} />}
        {showClock && runtime}
        {showClock && <OnStart js={`IvaUI.clock(${jsJoin('s', clockJoin)});`} joins={[clockJoin]} />}
      </Group>
    );
  }

  /**
   * The side menu: over a dimmed page, sliding in from the left (the header's
   * button sets its join). A swipe from the left edge opens it, one to the
   * left (or a tap on the dimmed page) closes it. Only swipes: iViewer moves a
   * subpage by its transitions, not under a finger.
   */
  function SideMenu({ title, subtitle, items, menu = 'menu', w = 314, slide = true, swipe = true, top: from = 72, edge = 16 }: SideMenuProps): VNode {
    const { width: W, height: H } = t.panel;
    const join = jsJoin('d', menu);
    const close = `IvaUI.off(${join})`;
    const itemJoin = (page: string): JoinRef => d(`ui_menu_${page.replace(/[^\w]/g, '_')}`);
    const top = title ? 100 : 16;
    /** a swipe to the right opens it (from the edge), one to the left closes it */
    const swiped = (open: boolean) => swipe && (
      <Gesture type="swipe" direction={open ? 'right' : 'left'} onBegin={open ? `CF.setJoin(${join}, 1)` : close} />
    );
    const fade = { type: 'fade' as const, time: 0.2 };
    return (
      <Group>
        {swipe && (
          <Image x={0} y={from} w={edge} h={H - from} src={draw.box({ w: 4, h: 4, fill: '#00000000', name: clearOf(4, 4) })}>{swiped(true)}</Image>
        )}
        <Subpage name="ui_menu_scrim" w={W} h={H} join={menu} bg="#000000a0" in={fade} out={fade}>
          {/* a tap on the dimmed page closes it (a gesture: a swipe here isn't a tap) */}
          <Gesture type="tap" onBegin={close} />
          {swiped(false)}
        </Subpage>
        <Subpage name="ui_menu" w={w} h={H} join={menu} bg={t.bar}
                 in={slide ? { type: 'moveIn', from: 'left', time: 0.25, ease: 'easeOut' } : fade}
                 out={slide ? { type: 'moveIn', from: 'left', time: 0.2, ease: 'easeIn' } : fade}>
          {title && <Text x={26} y={18} w={w - 52} h={40} text={title} font={font} fontSize={28} />}
          {subtitle && <Text x={26} y={56} w={w - 52} h={24} text={subtitle} color={t.muted} font={font} fontSize={16} />}
          {title && <Box x={20} y={88} w={w - 40} h={1} bg={t.raised} />}
          {/* the items scroll when there are more than fit (a tap acts on release: a drag scrolls) */}
          <ScrollBox y={top} w={w} h={H - top - 8} contentH={items.length * 60}>
            {items.map((it, i) => (
              <Button x={8} y={i * 60} w={w - 16} h={52} page={it.page} onRelease={[jsAction(close)]} join={itemJoin(it.page)} feedback="none"
                      icon={fa(it.icon, { size: 24, color: t.accent })} iconAlign="left" text={it.text}
                      radius={t.radius} bg={t.bar} active={{ bg: t.raised }} font={font} fontSize={20} />
            ))}
          </ScrollBox>
          {swiped(false)}
        </Subpage>
        {runtime}
        <OnStart js={`IvaUI.menu({ ${items.map((it) => `${JSON.stringify(it.page)}: ${jsJoin('d', itemJoin(it.page))}`).join(', ')} });`} />
      </Group>
    );
  }

  function ConfirmDialog({ join, title = 'Are you sure?', message, confirmText = 'OK', cancelText = 'Cancel', danger = false, onConfirm, w: asked = 520, h = 280 }: ConfirmDialogProps): VNode {
    const { width: W, height: H } = t.panel;
    const w = Math.min(asked, W - 32);
    const close = `IvaUI.off(${jsJoin('d', join)})`;
    const name = `ui_dialog_${keyOf(join)}`;
    const bw = Math.min(140, Math.floor((w - 80) / 2));
    return (
      <Group>
        <Subpage name={name} fixed w={W} h={H} join={join} bg="#000000a0" in={{ type: 'fade', time: 0.2 }} out={{ type: 'fade', time: 0.2 }}>
          <Box x={(W - w) / 2} y={(H - h) / 2} w={w} h={h} bg={t.surface} radius={t.radius + 6} />
          <Group x={(W - w) / 2} y={(H - h) / 2}>
            <Text x={32} y={28} w={w - 64} h={40} text={title} font={font} fontSize={26} />
            {message && <Text x={32} y={80} w={w - 64} h={h - 190} text={message} color={t.muted} font={font} fontSize={18} wrap />}
            <IconButton x={w - 32 - bw - 16 - bw} y={h - 92} w={bw} text={cancelText} js={close} />
            <IconButton x={w - 32 - bw} y={h - 92} w={bw} text={confirmText} tone={danger ? 'danger' : 'accent'} js={close} cmd={onConfirm} />
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
   * ColorPicker2 demo does): the panel's web server, /iva-color/RRGGBB.
   */
  function ColorPicker({ r, g, b, hex, value, size = 210, swatches = ['#FFFFFF', '#FFE2B8', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#0A84FF', '#AF52DE'],
                         onChange, bg = t.surface, x = 0, y = 0 }: ColorPickerProps): VNode {
    const key = keyOf(r);
    const id = JSON.stringify(key);
    const m = Math.max(20, Math.round(size * 0.13));
    const mark: JoinRef = s(`ui_${key}_cp_mark`);
    const level: JoinRef = a(`ui_${key}_cp_v`);
    const url: JoinRef = s(`ui_${key}_cp_url`);
    const hexJoin: JoinRef = hex === undefined ? s(`ui_${key}_cp_hex`) : typeof hex === 'object' ? hex : s(hex);
    const right = size + 24;
    const rw = 160;
    const sw = 32;
    const gap = (rw - 4 * sw) / 3;
    const touch = `IvaUI.colorTouch(${id}, gesture.x, gesture.y)`;
    // its drawings in a folder of its own (pickers/colour/): the wheel, the marker, the swatch's frame
    const folder = drawnSet('pickers', `${size}|${m}|${rw}|${bg}|${t.radius}`, joinLabel(r, 'colour'), 'colour', variant(), placeOf('pickers'));
    const o = `{ size: ${size}, markSize: ${m}, mark: ${jsJoin('s', mark)}, v: ${jsJoin('a', level)}, r: ${jsJoin('a', r)}, g: ${jsJoin('a', g)}, b: ${jsJoin('a', b)}, ` +
      `hex: ${jsJoin('s', hexJoin)}, url: ${jsJoin('s', url)}, value: ${JSON.stringify(value ?? '')} }`;
    const ref = (j: Join): JoinRef => (typeof j === 'object' ? j : a(j));
    return (
      <Group x={x} y={y}>
        {/* in a subpage of its own: the marker moves in the wheel's coordinates, wherever the wheel is */}
        <Subpage name={`ui_cp_${key}`} w={size} h={size}>
          <Image w={size} h={size} src={draw.wheel({ size, name: `${folder}/wheel` })}>
            <Gesture type="tap" onBegin={touch} />
            <Gesture type="pan" onBegin={touch} onChange={touch} />
          </Image>
          <Image x={(size - m) / 2} y={(size - m) / 2} w={m} h={m} join={mark} clickthrough
                 src={draw.ring({ size: m, thickness: 3, color: '#FFFFFF', outline: '#00000099', name: `${folder}/marker` })} />
        </Subpage>
        <Image y={size + 22} w={18} h={18} src={fa('sun', { color: t.muted, size: 14, style: 'regular' })} />
        <IvaSlider x={28} y={size + 25} w={size - 56} h={12} join={level} min={0} max={100} bg={t.raised} fill={t.text} radius={3} />
        <Image x={size - 20} y={size + 20} w={22} h={22} src={fa('sun', { color: t.text, size: 20 })} />
        <Web x={right} w={rw} h={72} join={url} url="panel:/iva-color/000000" />
        <Image x={right} w={rw} h={72} src={draw.cutout({ w: rw, h: 72, radius: t.radius, color: bg, name: `${folder}/frame` })} clickthrough />
        <Text x={right} y={84} w={rw} h={30} join={hexJoin} font={font} fontSize={22} />
        {(swatches || []).slice(0, 8).map((c, i) => (
          <Button x={right + Math.round((i % 4) * (sw + gap))} y={128 + Math.floor(i / 4) * (sw + 12)} w={sw} h={sw} radius={sw / 2} bg={c}
                  borderWidth={1} borderColor={shade(bg, 0.25)} js={`IvaUI.colorSet(${id}, ${JSON.stringify(c)})`} />
        ))}
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

  // ── tables & alarms ─────────────────────────────────────────────

  /** The tones' colours (a row's tint, its badge): from the theme, two of their own. */
  const toneColors = (): Record<string, string> => ({
    '': '', alarm: t.danger, warning: t.warning, ok: t.accent, running: t.accent, muted: t.muted, heating: '#F07A22', cooling: '#2D8CF0', offline: t.muted,
    // acknowledged alarms: the colour, dimmed
    alarmAck: t.danger, warningAck: t.warning,
  });

  /**
   * A table's row and badge images per tone: drawn with fixed names (a row
   * sets them by name through its joins), in a subpage of their own so they
   * ship with the .gui.
   */
  function tableImages(key: string, w: number, rowH: number, badgeW: number) {
    const draws = new Map<string, ReturnType<typeof draw.box>>();
    const add = (o: Parameters<typeof draw.box>[0]) => {
      const name = drawnFile(`row|${JSON.stringify(o)}`, [`rows/${boxLook(o)}`]);
      draws.set(name, draw.box({ ...o, name }));
      return `${name}.png`;
    };
    const files: Record<string, { rows: string[]; badge: string }> = {};
    for (const [tone, color] of Object.entries(toneColors())) {
      const h = rowH - 2;
      const dim = tone.endsWith('Ack');
      const tint = (alpha: string) => (color ? `${color}${alpha}` : alpha === '00' ? '#00000000' : `${t.raised}${alpha}`);
      const [even, odd] = dim ? ['14', '1F'] : ['2E', '42'];
      files[tone] = {
        // normal, every other row, selected
        rows: [add({ w, h, radius: 8, fill: tint(color ? even : '00') }), add({ w, h, radius: 8, fill: tint(color ? odd : '99') }),
          add({ w, h, radius: 8, fill: color ? tint(even) : `${t.accent}26`, borderWidth: 2, borderColor: t.accent })],
        badge: add({ w: badgeW, h: 24, radius: 12, fill: `${color || t.muted}${dim ? '26' : '40'}` }),
      };
    }
    const holder = (
      <Subpage name={`ui_tbl_${key}_images`} define w={1} h={1}>
        {[...draws.values()].map((src) => <Image w={1} h={1} src={src} />)}
      </Subpage>
    );
    return { files, holder };
  }

  /** The columns laid out: fixed widths, the rest shared. */
  function layoutColumns(columns: TableColumn[], w: number) {
    const fixed = columns.reduce((sum, c) => sum + (c.w ?? 0), 0);
    const flex = columns.filter((c) => c.w === undefined).length;
    const share = flex ? Math.max(40, Math.floor((w - fixed) / flex)) : 0;
    let x = 0;
    return columns.map((c) => {
      const cw = c.w ?? share;
      const at = x;
      x += cw;
      return { ...c, x: at, w: cw };
    });
  }

  /** A table's header, list and row subpage (DataTable, AlarmTable); the runtime's IvaUI.table fills it. */
  function tableBody(id: string, key: string, columns: TableColumn[], w: number, h: number, top: number, rowH: number, fontSize: number) {
    const cols = layoutColumns(columns, w);
    const badgeW = 110;
    const list: JoinRef = l(`ui_${key}_tbl`);
    const row = `ui_tbl_${key}_row`;
    const heads = cols.map((_, i) => s(`ui_${key}_th${i}`));
    const empty: JoinRef = s(`ui_${key}_empty`);
    const images = tableImages(key, w, rowH, badgeW);
    const headH = 36;
    const cell = (c: (typeof cols)[number], i: number) =>
      c.badge ? (
        <>
          <Image x={c.x + 12} y={Math.round((rowH - 24) / 2)} w={badgeW} h={24} join={21 + i} />
          <Text x={c.x + 12} w={badgeW} h={rowH} join={i + 1} align="center" font={font} fontSize={fontSize - 2} />
        </>
      ) : (
        <Text x={c.x + 12} w={c.w - 24} h={rowH} join={i + 1} align={c.align ?? 'left'} font={font} fontSize={fontSize} />
      );
    const body = (
      <>
        <Box y={top} w={w} h={headH} bg={t.raised} radius={t.radius - 4} />
        {cols.map((c, i) => (
          <Button x={c.x} y={top} w={c.w} h={headH} text={c.title} textJoin={heads[i]} align={c.align ?? 'left'} padding={[0, 12, 0, 12]}
                  color={t.muted} active={{ color: t.text }} font={font} fontSize={15} bold feedback="none" js={`IvaUI.tableSort(${id}, ${i})`} />
        ))}
        <Subpage name={row} define w={w} h={rowH}>
          <Image w={w} h={rowH - 2} join={20} />
          {cols.map(cell)}
          <Button w={w} h={rowH} feedback="none" onPress={[jsAction('IvaUI.rowDown(list)')]} onRelease={[jsAction('IvaUI.tableTap(list, listIndex)')]} />
        </Subpage>
        {images.holder}
        <List y={top + headH + 4} w={w} h={h - top - headH - 4} join={list} item={row} />
        <Text x={12} y={top + headH + 12} w={w - 24} h={30} join={empty} color={t.muted} font={font} fontSize={fontSize} />
      </>
    );
    const data = { list: jsJoin('l', list), row: JSON.stringify(row), heads: `[${heads.map((j) => jsJoin('s', j)).join(', ')}]`, empty: jsJoin('s', empty) };
    return { body, cols, images: images.files, data, joins: [list, ...heads, empty] };
  }

  /** A JS object literal from parts that are already JavaScript (joins) and plain values. */
  const jsObject = (parts: Record<string, string | undefined>) =>
    `{ ${Object.entries(parts).filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;

  // ── charts: web apps the panel serves (WebApp, iva:trend / iva:chart) ──

  /** the colours a web app draws in (this look's) */
  const webLook = () => {
    const m = /^#?([0-9a-f]{6})/i.exec(t.surface);
    const n = m ? parseInt(m[1], 16) : 0;
    const dark = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 128;
    return { bg: t.surface, surface: t.surface, raised: t.raised, text: t.text, muted: t.muted, grid: shade(t.raised, dark ? 0.06 : -0.06), accent: t.accent, font: t.font };
  };
  const PALETTE = ['#E5484D', '#2D8CF0', '#00BC97', '#FFB000', '#A855F7', '#F07A22'];
  const analog = (j: Join): Join => (typeof j === 'object' ? j : a(j));

  /** Curves of joins over time, the panel recording them: ranges, ‹ ›, Live; a touch reads the values. */
  function Trend({ curves, title, ranges = [300, 900, 3600], range, min, max, rightMin, rightMax, every = 1, history, name,
                   x = 0, y = 0, w = 800, h = 360 }: TrendProps): VNode {
    const id = name ?? `trend_${hash(JSON.stringify(curves.map((c) => [keyOf(analog(c.join)), c.label])))}`;
    const joins = Object.fromEntries(curves.map((c, i) => [`c${i}`, analog(c.join)]));
    const keep = Math.ceil((Math.max(...ranges) * 1.5) / every);
    return (
      <WebApp entry="iva:trend" name={id} x={x} y={y} w={w} h={h} bg={t.surface} title={title ?? 'Trend'}
              joins={joins} record={{ every, keep }} handlers={history ? { history } : undefined}
              options={{
                title, ranges, range, min, max, rightMin, rightMax, theme: webLook(),
                curves: curves.map((c, i) => ({ name: `c${i}`, label: c.label, color: c.color ?? PALETTE[i % PALETTE.length], scale: c.scale,
                  decimals: c.decimals, unit: c.unit, side: c.side, width: c.width })),
              }} />
    );
  }

  /** A Chart.js chart: data given, live from joins, or JSON from a serial join. */
  function Chart({ type = 'bar', labels, datasets = [], source, horizontal, stacked, min, max, unit, legend, title, name,
                   x = 0, y = 0, w = 500, h = 300 }: ChartProps): VNode {
    const joins: Record<string, Join> = {};
    const sets = datasets.map((d, i) => {
      const { joins: js, ...rest } = d;
      const names = (js ?? []).map((j, k) => {
        joins[`d${i}_${k}`] = typeof j === 'object' ? j : a(j);
        return `d${i}_${k}`;
      });
      return { ...rest, joins: names.length ? names : undefined };
    });
    if (source !== undefined) joins.data = typeof source === 'object' ? source : s(source);
    const id = name ?? `chart_${hash(JSON.stringify([type, labels, sets.map((d) => [d.label, d.joins]), Object.values(joins).map(keyOf)]))}`;
    return (
      <WebApp entry="iva:chart" name={id} x={x} y={y} w={w} h={h} bg={t.surface} title={title ?? 'Chart'} joins={joins}
              options={{ type, labels, datasets: sets, horizontal, stacked, min, max, unit, legend, title, theme: webLook() }} />
    );
  }

  /**
   * A table: a search field, a header (a tap sorts: up, down, off), rows in
   * tones, a badge column, a tap selecting a row, the row count. The rows
   * come from `data`, or a serial join with JSON.
   */
  function DataTable({ columns, data, source, keyField, selected, toneKey, search = true, placeholder = 'Search…', onSelect, words = {},
                       rowH = 40, fontSize = 18, x = 0, y = 0, w = 900, h = 360 }: DataTableProps): VNode {
    const key = `dt_${hash(JSON.stringify([columns, keyField, toneKey, w, h, rowH, source ?? null, selected ?? null]))}`;
    const id = JSON.stringify(key);
    const input: JoinRef = s(`ui_${key}_q`);
    const hint: JoinRef = s(`ui_${key}_hint`);
    const count: JoinRef = s(`ui_${key}_count`);
    const top = search ? 56 : 0;
    const tb = tableBody(id, key, columns, w, h, top, rowH, fontSize);
    const o = jsObject({
      ...tb.data, cols: JSON.stringify(tb.cols.map((c) => ({ key: c.key, decimals: c.decimals, badge: !!c.badge }))), titles: JSON.stringify(columns.map((c) => c.title)),
      tones: JSON.stringify(tb.images), key: JSON.stringify(keyField ?? ''), toneKey: JSON.stringify(toneKey ?? ''),
      selected: selected === undefined ? undefined : jsJoin('s', selected), source: source === undefined ? undefined : jsJoin('s', source),
      data: source === undefined ? JSON.stringify(data ?? []) : undefined,
      input: search ? jsJoin('s', input) : undefined, hint: search ? jsJoin('s', hint) : undefined, placeholder: JSON.stringify(placeholder), count: jsJoin('s', count),
      words: JSON.stringify({ rows: words.rows ?? 'rows', of: words.of ?? 'of', empty: words.empty ?? 'Nothing to show' }),
      onSelect: onSelect ? `function (row) { ${onSelect} }` : undefined,
    });
    const sw = Math.min(420, Math.round(w * 0.45));
    return (
      <Group x={x} y={y}>
        {search && (
          <>
            <Box w={sw} h={44} bg={t.raised} radius={t.radius} />
            <Image x={14} y={13} w={18} h={18} src={fa('magnifying-glass', { size: 16, color: t.muted })} />
            <Text x={42} w={sw - 54} h={44} join={hint} color={t.muted} font={font} fontSize={17} />
            <Input x={42} w={sw - 54} h={44} join={input} color={t.text} font={font} fontSize={17} />
          </>
        )}
        <Text x={w - 300} w={300} h={44} join={count} align="right" color={t.muted} font={font} fontSize={16} />
        {tb.body}
        {runtime}
        <OnStart js={`IvaUI.table(${id}, ${o});`}
                 joins={[...tb.joins, count, ...(search ? [input, hint] : []), ...(selected !== undefined ? [typeof selected === 'object' ? selected : s(selected)] : []),
                   ...(source !== undefined ? [typeof source === 'object' ? source : s(source)] : [])]} />
      </Group>
    );
  }

  /**
   * Alarms: raised and cleared from joins (`conditions`), a JSON serial join
   * or scripts (IvaAlarms.raise(name, { id, text, source, severity })). New
   * ones are tinted red / amber, acknowledged ones dimmed, cleared ones grey;
   * a filter (all / active / unacked), Ack (the row selected), Ack all.
   */
  function AlarmTable({ name, conditions = [], source, summary, rowH = 38, x = 0, y = 0, w = 1100, h = 320 }: AlarmTableProps): VNode {
    const key = `al_${name.replace(/\W/g, '_')}`;
    const tableId = JSON.stringify(key);
    // narrow (a phone): no source, the rest closer
    const columns: TableColumn[] = w < 640 ? [
      { key: 'time', title: 'Time', w: 84 }, { key: 'severity', title: 'Severity', w: 112, badge: true }, { key: 'text', title: 'Text' }, { key: 'state', title: 'State', w: 92 },
    ] : [
      { key: 'time', title: 'Time', w: 110 }, { key: 'severity', title: 'Severity', w: 140, badge: true }, { key: 'source', title: 'Source', w: Math.round(w * 0.2) },
      { key: 'text', title: 'Text' }, { key: 'state', title: 'State', w: 120 },
    ];
    // narrow: the filters, then the buttons, then the counts, each a row of its own
    const narrow = w < 640;
    const tb = tableBody(tableId, key, columns, w, h, narrow ? 136 : 56, rowH, 17);
    const filters = ['All', 'Active', 'Unacked'];
    const fw = narrow ? Math.floor((w - 12) / 3) : 106;
    const filterJoins = filters.map((_, i) => d(`ui_${key}_f${i}`));
    const sum: JoinRef = summary === undefined ? s(`ui_${key}_summary`) : typeof summary === 'object' ? summary : s(summary);
    const conds = conditions.map((c) => jsObject({
      id: JSON.stringify(c.id), text: JSON.stringify(c.text), source: JSON.stringify(c.source ?? ''), severity: JSON.stringify(c.severity ?? 'alarm'),
      join: jsJoin(typeof c.join === 'object' ? (c.join.type as 'd' | 'a' | 's') : 'd', c.join),
      above: c.above === undefined ? undefined : String(c.above), below: c.below === undefined ? undefined : String(c.below),
      equals: c.equals === undefined ? undefined : JSON.stringify(c.equals),
    }));
    const table = jsObject({
      ...tb.data, cols: JSON.stringify(tb.cols.map((c) => ({ key: c.key, badge: !!c.badge, sortKey: c.key === 'time' ? 'ts' : undefined }))),
      titles: JSON.stringify(columns.map((c) => c.title)), tones: JSON.stringify(tb.images), key: '"id"', toneKey: '"tone"',
      words: JSON.stringify({ rows: 'alarms', of: 'of', empty: 'No alarms' }), data: '[]',
    });
    const o = jsObject({
      table: tableId, conditions: `[${conds.join(', ')}]`, source: source === undefined ? undefined : jsJoin('s', source), summary: jsJoin('s', sum),
      filters: `[${filterJoins.map((j) => jsJoin('d', j)).join(', ')}]`,
    });
    const btn = { h: 44, radius: t.radius, bg: t.raised, active: { bg: t.accent }, font, fontSize: 17 };
    return (
      <Group x={x} y={y}>
        <Box w={narrow ? w : 330} h={44} bg={t.raised} radius={t.radius} />
        {filters.map((f, i) => (
          <Button x={4 + i * (fw + 2)} y={4} w={fw} h={36} text={f} join={filterJoins[i]} feedback="none" js={`IvaUI.alarmFilter(${JSON.stringify(name)}, ${i})`}
                  radius={t.radius - 3} bg={t.raised} color={t.muted} active={{ bg: t.accent, color: t.text }} font={font} fontSize={16} />
        ))}
        <Button x={narrow ? 0 : 346} y={narrow ? 52 : 0} w={narrow ? Math.floor((w - 10) / 2) : 120} text="Ack" icon={fa('check', { size: 16 })} iconAlign="left"
                js={`IvaUI.alarmAck(${JSON.stringify(name)})`} {...btn} />
        <Button x={narrow ? Math.floor((w - 10) / 2) + 10 : 476} y={narrow ? 52 : 0} w={narrow ? w - Math.floor((w - 10) / 2) - 10 : 130} text="Ack all"
                icon={fa('check-double', { size: 16 })} iconAlign="left" js={`IvaUI.alarmAckAll(${JSON.stringify(name)})`} {...btn} />
        <Text x={narrow ? 0 : 620} y={narrow ? 100 : 0} w={narrow ? w : w - 620} h={narrow ? 28 : 44} join={sum} align={narrow ? 'left' : 'right'} color={t.muted} font={font} fontSize={16} />
        {tb.body}
        {runtime}
        <OnStart js={`IvaUI.table(${tableId}, ${table}); IvaUI.alarms(${JSON.stringify(name)}, ${o});`}
                 joins={[...tb.joins, sum, ...filterJoins, ...(source !== undefined ? [typeof source === 'object' ? source : s(source)] : [])]} />
      </Group>
    );
  }

  /** The newest unacknowledged alarm (the most severe first) and how many more, blinking while any is unacknowledged. */
  function AlarmBanner({ alarms, page, js, x = 0, y = 0, w = 860, h = 52 }: AlarmBannerProps): VNode {
    const key = `ab_${alarms.replace(/\W/g, '_')}_${w}_${h}`;
    const bg: JoinRef = s(`ui_${key}_bg`);
    const ic: JoinRef = s(`ui_${key}_icon`);
    const text: JoinRef = s(`ui_${key}_text`);
    const more: JoinRef = s(`ui_${key}_more`);
    const box = (fill: string, border?: string) => {
      const name = drawnFile(`banner|${JSON.stringify([w, h, fill, border, t.radius])}`, [`banners/${boxLook({ w, h, radius: t.radius, fill, borderWidth: border ? 2 : 0, borderColor: border })}`]);
      return { name, src: draw.box({ w, h, radius: t.radius, fill, borderWidth: border ? 2 : 0, borderColor: border, name }) };
    };
    const icon = (n: string, color: string) => {
      const file = iconFileOf(n, color, 22);
      return { name: file, src: fa(n, { size: 22, color, file }) };
    };
    const looks = {
      alarm: [box(`${t.danger}40`, t.danger), box(`${t.danger}14`, t.danger)], warning: [box(`${t.warning}40`, t.warning), box(`${t.warning}14`, t.warning)],
      none: [box(t.raised)],
    };
    const icons = { alarm: icon('triangle-exclamation', t.danger), warning: icon('triangle-exclamation', t.warning), none: icon('circle-check', t.accent) };
    const all = [...Object.values(looks).flat(), ...Object.values(icons)];
    const o = jsObject({
      bg: jsJoin('s', bg), icon: jsJoin('s', ic), text: jsJoin('s', text), more: jsJoin('s', more),
      looks: JSON.stringify(Object.fromEntries(Object.entries(looks).map(([k, v]) => [k, v.map((b) => `${b.name}.png`)]))),
      icons: JSON.stringify(Object.fromEntries(Object.entries(icons).map(([k, v]) => [k, `${v.name}.png`]))),
    });
    return (
      <Group x={x} y={y}>
        <Image w={w} h={h} join={bg} src={looks.none[0].src} />
        <Image x={16} y={Math.round((h - 22) / 2)} w={22} h={22} join={ic} src={icons.none.src} />
        <Text x={50} w={w - 200} h={h} join={text} font={font} fontSize={18} />
        <Text x={w - 150} w={134} h={h} join={more} align="right" color={t.muted} font={font} fontSize={16} />
        {(page || js) && <Button w={w} h={h} feedback="none" page={page} js={js} />}
        <Subpage name={`ui_${key}_images`} define w={1} h={1}>{all.map((a) => <Image w={1} h={1} src={a.src} />)}</Subpage>
        {runtime}
        <OnStart js={`IvaUI.alarmBanner(${JSON.stringify(alarms)}, ${o});`} joins={[bg, ic, text, more]} />
      </Group>
    );
  }

  /** Where you are: Home › Floor 1 › Kitchen - all but the last are links; a back arrow first, if asked. */
  function Breadcrumbs({ items, back = false, separator = '›', fontSize = 20, x = 0, y = 0, h = 44 }: BreadcrumbsProps): VNode {
    const parts = items.map((it) => (typeof it === 'string' ? { label: it } : it));
    const width = (label: string) => textWidth(label, fontSize) + 8;
    let at = back ? 44 : 0;
    const placed = parts.map((p) => {
      const px = at;
      at += width(p.label) + 26;
      return { ...p, x: px, w: width(p.label) };
    });
    return (
      <Group x={x} y={y}>
        {back && <Button w={40} h={h} icon={fa('chevron-left', { size: 18 })} feedback="none" page="Return" color={t.accent} />}
        {placed.map((p, i) => (i < placed.length - 1 ? (
          <>
            {/* a link: underlined */}
            <Button x={p.x} w={p.w} h={h} text={p.label} page={p.page} js={p.js} feedback="none" align="left" color={t.accent} underline
                    active={{ color: shade(t.accent, 0.4), underline: true }} font={font} fontSize={fontSize} />
            <Text x={p.x + p.w + 4} w={18} h={h} text={separator} align="center" color={t.muted} font={font} fontSize={fontSize} />
          </>
        ) : (
          <Text x={p.x} w={p.w + 40} h={h} text={p.label} font={font} fontSize={fontSize} />
        )))}
      </Group>
    );
  }

  /** A busy overlay over the whole panel, while a digital join is on: dimmed, a spinning icon, a text. */
  function Loader({ join, text = 'Loading…', textJoin, icon = 'circle-notch' }: LoaderProps): VNode {
    const key = keyOf(join);
    const spin: JoinRef = s(`ui_${key}_spin`);
    const { width: W, height: H } = t.panel;
    const bw = 240;
    const bh = 190;
    const fade = { type: 'fade' as const, time: 0.15 };
    return (
      <>
        <Subpage name={`ui_loader_${key}`} fixed topmost w={W} h={H} join={join} bg="#000000a0" in={fade} out={fade}>
          {/* taps don't go through */}
          <Button w={W} h={H} feedback="none" />
          <Group x={Math.round((W - bw) / 2)} y={Math.round((H - bh) / 2)}>
            <Box w={bw} h={bh} bg={t.surface} radius={t.radius + 4} />
            <Image x={Math.round(bw / 2 - 28)} y={36} w={56} h={56} join={spin} src={fa(icon, { size: 52, color: t.accent })} />
            <Text y={116} w={bw} h={40} text={text} join={textJoin} align="center" font={font} fontSize={19} />
          </Group>
        </Subpage>
        {runtime}
        <OnStart js={`IvaUI.loader(${jsJoin('d', join)}, ${jsJoin('s', spin)});`} joins={[spin]} />
      </>
    );
  }

  /**
   * Drag and drop, as CommandFusion's DragDropManager does it: a pan on a
   * layer over the area moves the item under the finger (CF.setProperties),
   * a target lights up while it's over it, a drop writes the item's label
   * into the target's `value` and runs `onDrop`. Items are buttons (one join
   * moves icon and label together), drawn after the targets: on top of them.
   */
  function DragDrop({ name, items, targets, onDrop, placeholder = 'Drop here', itemW = 112, itemH = 96, targetW = 230, targetH = 104, gap = 16,
                      x = 0, y = 0, w, h }: DragDropProps): VNode {
    const key = name.replace(/\W/g, '_');
    const area: JoinRef = s(`ui_dd_${key}`);
    const itemJoin = (it: DragItem): JoinRef => d(`ui_dd_${key}_i_${it.id}`);
    const hover = (tg: DropTarget): JoinRef => d(`ui_dd_${key}_t_${tg.id}`);
    const hintJoin = (tg: DropTarget): JoinRef => s(`ui_dd_${key}_h_${tg.id}`);
    const cols = Math.max(1, Math.floor((w + gap) / (targetW + gap)));
    const itemCols = Math.max(1, Math.floor((w + gap) / (itemW + gap)));
    const placedItems = items.map((it, i) => ({ ...it, x: it.x ?? (i % itemCols) * (itemW + gap), y: it.y ?? Math.floor(i / itemCols) * (itemH + gap) }));
    const top = Math.ceil(items.length / itemCols) * (itemH + gap) - gap + 28;
    const placedTargets = targets.map((tg, i) => ({ ...tg, x: tg.x ?? (i % cols) * (targetW + gap), y: tg.y ?? top + Math.floor(i / cols) * (targetH + gap) }));
    const o = jsObject({
      area: jsJoin('s', area),
      items: `[${placedItems.map((it) => `{ id: ${JSON.stringify(it.id)}, join: ${jsJoin('d', itemJoin(it))} }`).join(', ')}]`,
      targets: `[${placedTargets.map((tg) => jsObject({
        id: JSON.stringify(tg.id), hover: jsJoin('d', hover(tg)),
        value: tg.value === undefined ? undefined : jsJoin('s', tg.value), hint: tg.value === undefined ? undefined : jsJoin('s', hintJoin(tg)),
        accept: tg.accept ? JSON.stringify(tg.accept) : undefined,
      })).join(', ')}]`,
      labels: JSON.stringify(Object.fromEntries(items.map((it) => [it.id, it.label]))),
      placeholder: JSON.stringify(placeholder),
    });
    const gesture = (fn: string) => `IvaUI.${fn}(${JSON.stringify(key)}, gesture.x, gesture.y)`;
    return (
      <Group x={x} y={y}>
        {placedTargets.map((tg) => (
          <>
            <Button x={tg.x} y={tg.y} w={targetW} h={targetH} join={hover(tg)} feedback="none" radius={t.radius} bg={t.raised}
                    borderWidth={2} borderColor={t.raised} active={{ bg: shade(t.raised, 0.08), borderColor: t.accent }}
                    icon={tg.icon ? { src: fa(tg.icon, { size: 20, color: t.muted }), x: 16, y: 16 } : undefined} />
            <Text x={tg.x + (tg.icon ? 46 : 16)} y={tg.y + 10} w={targetW - 62} h={32} text={tg.label} font={font} fontSize={18} />
            {tg.value !== undefined && (
              <>
                <Text x={tg.x + 16} y={tg.y + targetH - 48} w={targetW - 32} h={36} join={hintJoin(tg)} color={t.muted} font={font} fontSize={18} />
                <Text x={tg.x + 16} y={tg.y + targetH - 48} w={targetW - 32} h={36} join={tg.value} color={t.accent} font={font} fontSize={22} />
              </>
            )}
          </>
        ))}
        {placedItems.map((it) => (
          <Button x={it.x} y={it.y} w={itemW} h={itemH} join={itemJoin(it)} feedback="none" radius={t.radius} bg={t.raised} text={it.label}
                  icon={it.icon ? fa(it.icon, { size: 28, color: t.accent }) : undefined} iconAlign="top" font={font} fontSize={16} />
        ))}
        {/* the layer the finger moves on: over everything (items and targets only show) */}
        <Image w={w} h={h} join={area} src={draw.box({ w, h, fill: '#00000000', name: clearOf(w, h) })}>
          {/* a pan begins once the finger has moved a little: the item is the one where it touched down */}
          <Gesture type="pan" onBegin={`IvaUI.ddBegin(${JSON.stringify(key)}, gesture.startx, gesture.starty)`} onChange={gesture('ddMove')} onEnd={`IvaUI.ddEnd(${JSON.stringify(key)})`} />
        </Image>
        {runtime}
        <OnStart js={`IvaUI.dragdrop(${JSON.stringify(key)}, ${o}, function (item, target) { ${onDrop ?? ''} });`}
                 joins={[area, ...placedItems.map(itemJoin), ...placedTargets.map(hover), ...placedTargets.filter((tg) => tg.value !== undefined).map(hintJoin)]} />
      </Group>
    );
  }

  /** Pages side by side in one place: a swipe (or a dot) goes to the next / previous; the page shown in an analog join. */
  function Pager({ join, value = 0, dots = true, x = 0, y = 0, w, h, children }: PagerProps): VNode {
    const key = keyOf(join);
    const id = JSON.stringify(key);
    const pages = (Array.isArray(children) ? (children as unknown[]).flat(Infinity) : [children]).filter((c): c is VNode => !!c && typeof c === 'object');
    const dotH = dots ? 32 : 0;
    const pageJoins = pages.map((_, i) => d(`ui_${key}_pg${i}`));
    const dotJoins = pages.map((_, i) => d(`ui_${key}_dot${i}`));
    const fade = { type: 'fade' as const, time: 0.2 };
    const dw = 14;
    const gap = 12;
    const dotsW = pages.length * dw + (pages.length - 1) * gap;
    return (
      <Group x={x} y={y}>
        {pages.map((page, i) => (
          <Subpage name={`ui_pg_${key}_${i}`} w={w} h={h - dotH} join={pageJoins[i]} in={fade} out={fade}>
            {/* a swipe on the page (where its own content doesn't take the touch) */}
            <Image w={w} h={h - dotH} src={draw.box({ w: 4, h: 4, fill: '#00000000', name: clearOf(4, 4) })}>
              <Gesture type="swipe" direction="left" onBegin={`IvaUI.pagerStep(${id}, 1)`} />
              <Gesture type="swipe" direction="right" onBegin={`IvaUI.pagerStep(${id}, -1)`} />
            </Image>
            {page}
          </Subpage>
        ))}
        {dots && pages.map((_, i) => (
          <Button x={Math.round((w - dotsW) / 2) + i * (dw + gap)} y={h - dotH + Math.round((dotH - dw) / 2)} w={dw} h={dw} radius={dw / 2}
                  join={dotJoins[i]} feedback="none" bg={t.raised} active={{ bg: t.accent }} js={`IvaUI.pagerGo(${id}, ${i})`} />
        ))}
        {runtime}
        <OnStart js={`IvaUI.pager(${id}, { join: ${jsJoin('a', join)}, pages: [${pageJoins.map((j) => jsJoin('d', j)).join(', ')}], dots: [${dotJoins.map((j) => jsJoin('d', j)).join(', ')}], value: ${value} });`}
                 joins={[typeof join === 'object' ? join : a(join), ...pageJoins, ...dotJoins]} />
      </Group>
    );
  }

  return {
    theme: t, grid, Card, Icon, IconButton, Tile, Badge, Stat, Toggle, Slider, Stepper, Segmented, SceneBar, Dimmer, Dial, Knob, Thermostat, Blinds,
    RadioGroup, CheckBox, CheckBoxGroup, SelectBox, ListRow, DataList, ScrollBox, ScrollArea, Screens, screenArea, WeekDays, PinPad, AlarmCard, NavCard, Header, SideMenu, ConfirmDialog,
    ColorPicker, TextField, SearchSelect, TimePicker, DatePicker, NumberField, DataTable, AlarmTable, AlarmBanner, Breadcrumbs, Loader, Pager,
    Trend, Chart, DragDrop,
  };
}

// ── layout ─────────────────────────────────────────────────────────

/** Where grid() puts an item: its box, and how far down content laid out at its own size sits in it (centred; 0 for one that grows). */
export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  dy: number;
}
/**
 * A grid() item: [w, h], the size its content is laid out at (the least it
 * gets), or { w, h, grow: true } for content that takes the room it gets (a
 * list, a table, a chart). h can be a function of the width it gets: a card
 * that lays its content out another way when narrow, taller.
 */
export type GridItem = [number, number | ((w: number) => number)] | { w: number; h: number | ((w: number) => number); grow?: boolean };
/** A grid() row: items by name, left to right; [names]: those one above another. */
export type GridRow<K extends string = string> = (K | K[])[];
export interface GridOptions {
  /** the area (default: the panel below the header: x 16, y 88, 16 from the edges) */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** between items (default 16) */
  gap?: number;
}

interface GridBox {
  w: number;
  h: (w: number) => number;
  grow: boolean;
  name?: string;
  stack?: GridBox[];
}

/**
 * Items laid out in an area, row by row: each row stretched to the width
 * (each item by its share), a row that doesn't fit going on in the next; the
 * rows as high as their tallest item, the height left going to the rows with
 * an item that grows - else to all of them, by their size - so the area is
 * filled. Taller than the area: as tall as they are (a ScrollArea scrolls
 * them). A stack's items share its height the same way.
 */
export function layoutGrid<K extends string>(items: Record<K, GridItem>, rows: GridRow<K>[], area: { x: number; y: number; w: number; h: number }, gap = 16): Record<K, Cell> {
  const placed = new Set<string>();
  const one = (name: K): GridBox => {
    const it = items[name];
    if (!it) throw new Error(`grid: no item "${name}" (items: ${Object.keys(items).join(', ')})`);
    if (placed.has(name)) throw new Error(`grid: "${name}" is placed twice`);
    placed.add(name);
    const [w, h, grow] = Array.isArray(it) ? [it[0], it[1], false] : [it.w, it.h, !!it.grow];
    return { w, h: typeof h === 'function' ? h : () => h, grow, name };
  };
  const box = (x: K | K[]): GridBox => {
    if (!Array.isArray(x)) return one(x);
    const stack = x.map(one);
    return { w: Math.max(...stack.map((b) => b.w)), h: (w) => stack.reduce((n, b) => n + b.h(w), 0) + gap * (stack.length - 1), grow: stack.some((b) => b.grow), stack };
  };
  // rows that fit the width (one too wide goes on in the next)
  const lines: GridBox[][] = [];
  for (const row of rows) {
    let line: GridBox[] = [];
    let used = 0;
    for (const b of row.map(box)) {
      if (line.length && used + gap + b.w > area.w) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length ? gap : 0) + b.w;
      line.push(b);
    }
    if (line.length) lines.push(line);
  }
  const missing = Object.keys(items).filter((k) => !placed.has(k));
  if (missing.length) throw new Error(`grid: ${missing.join(', ')} in no row`);
  /**
   * sizes sharing `total` (gaps between them) by their own sizes: the ones that
   * grow get what's spare, else all; less than they need: widths shrink, heights don't
   */
  const share = (sizes: number[], grows: boolean[], total: number, shrink: boolean): number[] => {
    const natural = sizes.reduce((a, b) => a + b, 0) + gap * (sizes.length - 1);
    const spare = shrink ? total - natural : Math.max(0, total - natural);
    const takers = spare > 0 && grows.some(Boolean) ? grows : sizes.map(() => true);
    const weight = sizes.reduce((n, sz, i) => n + (takers[i] ? sz : 0), 0) || 1;
    // cumulative and rounded: whole pixels, the gaps exact
    let at = 0;
    let acc = 0;
    return sizes.map((sz, i) => {
      acc += sz + (takers[i] ? (spare * sz) / weight : 0);
      const end = Math.round(acc);
      const out = end - at;
      at = end;
      return out;
    });
  };
  const cells = {} as Record<K, Cell>;
  const place = (b: GridBox, x: number, y: number, w: number, h: number) => {
    if (!b.stack) {
      cells[b.name as K] = { x, y, w, h, dy: b.grow ? 0 : Math.max(0, Math.round((h - b.h(w)) / 2)) };
      return;
    }
    const hs = share(b.stack.map((s) => s.h(w)), b.stack.map((s) => s.grow), h, false);
    let at = y;
    b.stack.forEach((s, i) => {
      place(s, x, at, w, hs[i]);
      at += hs[i] + gap;
    });
  };
  const widths = lines.map((line) => share(line.map((b) => b.w), line.map(() => true), area.w, true));
  const heights = share(lines.map((l, r) => Math.max(...l.map((b, i) => b.h(widths[r][i])))), lines.map((l) => l.some((b) => b.grow)), area.h, false);
  let y = area.y;
  lines.forEach((line, r) => {
    let x = area.x;
    line.forEach((b, i) => {
      place(b, x, y, widths[r][i], heights[r]);
      x += widths[r][i] + gap;
    });
    y += heights[r] + gap;
  });
  return cells;
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
export const ScrollArea: Ui['ScrollArea'] = ui.ScrollArea;
export const Screens: Ui['Screens'] = ui.Screens;
export const grid: Ui['grid'] = ui.grid;
export const WeekDays: Ui['WeekDays'] = ui.WeekDays;
export const PinPad: Ui['PinPad'] = ui.PinPad;
export const AlarmCard: Ui['AlarmCard'] = ui.AlarmCard;
export const ColorPicker: Ui['ColorPicker'] = ui.ColorPicker;
export const TextField: Ui['TextField'] = ui.TextField;
export const SearchSelect: Ui['SearchSelect'] = ui.SearchSelect;
export const TimePicker: Ui['TimePicker'] = ui.TimePicker;
export const DatePicker: Ui['DatePicker'] = ui.DatePicker;
export const NumberField: Ui['NumberField'] = ui.NumberField;
export const DataTable: Ui['DataTable'] = ui.DataTable;
export const Trend: Ui['Trend'] = ui.Trend;
export const Chart: Ui['Chart'] = ui.Chart;
export const AlarmTable: Ui['AlarmTable'] = ui.AlarmTable;
export const AlarmBanner: Ui['AlarmBanner'] = ui.AlarmBanner;
export const Breadcrumbs: Ui['Breadcrumbs'] = ui.Breadcrumbs;
export const Loader: Ui['Loader'] = ui.Loader;
export const Pager: Ui['Pager'] = ui.Pager;
export const DragDrop: Ui['DragDrop'] = ui.DragDrop;
export const NavCard: Ui['NavCard'] = ui.NavCard;
export const Header: Ui['Header'] = ui.Header;
export const SideMenu: Ui['SideMenu'] = ui.SideMenu;
export const ConfirmDialog: Ui['ConfirmDialog'] = ui.ConfirmDialog;
export default ui;

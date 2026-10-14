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
  Box, Button, Group, Image, OnStart, Script, Slider as IvaSlider, Subpage, Text, a, d, fa, s,
  type ButtonProps, type Child, type Join, type JoinRef, type VNode,
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
  Blinds: (p: BlindsProps) => VNode;
  NavCard: (p: NavCardProps) => VNode;
  Header: (p: HeaderProps) => VNode;
  SideMenu: (p: SideMenuProps) => VNode;
  ConfirmDialog: (p: ConfirmDialogProps) => VNode;
}

/** A join as a JavaScript expression ("d12", or Joins.d.name for a named one). */
export function jsJoin(type: 'd' | 'a' | 's', j: Join): string {
  if (typeof j === 'number') return JSON.stringify(`${type}${j}`);
  if (typeof j === 'string') return /^\d+$/.test(j) ? JSON.stringify(type + j) : `Joins.${type}[${JSON.stringify(j)}]`;
  return typeof j.id === 'number' ? JSON.stringify(`${j.type}${j.id}`) : `Joins.${j.type}[${JSON.stringify(j.id)}]`;
}

/** A name for joins a component makes for itself, from the join it was given. */
const keyOf = (j: Join): string => (typeof j === 'object' ? `${j.type}${j.id}` : String(j)).replace(/[^\w]/g, '_');

/** A colour lighter (amount > 0) or darker. */
function shade(color: string, amount: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(Math.max(0, Math.min(255, amount > 0 ? v + (255 - v) * amount : v * (1 + amount))));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, '0')).join('')}`;
}

/** Components in a theme: createUi({ accent: '#0A84FF' }); what isn't given comes from defaultTheme. */
export function createUi(theme: Partial<UiTheme> = {}): Ui {
  const t: UiTheme = { ...defaultTheme, ...theme, panel: { ...defaultTheme.panel, ...(theme.panel ?? {}) } };
  const font = t.font;
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
  function oneOf(join: Join, count: number, value: number) {
    const id = JSON.stringify(keyOf(join));
    const option = (i: number): JoinRef => d(`ui_${keyOf(join)}_${i}`);
    const start = (
      <OnStart js={`IvaUI.group(${id}, ${jsJoin('a', join)}, [${Array.from({ length: count }, (_, i) => jsJoin('d', option(i))).join(', ')}], ${value});`}
               joins={[typeof join === 'object' ? join : a(join)]} />
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

  function Header({ title, section, home = 'Overview', menu = 'menu', clock = true, w = t.panel.width, h = 72 }: HeaderProps): VNode {
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

  return { theme: t, Card, Icon, IconButton, Tile, Badge, Stat, Toggle, Slider, Stepper, Segmented, SceneBar, Dimmer, Blinds, NavCard, Header, SideMenu, ConfirmDialog };
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
export const NavCard: Ui['NavCard'] = ui.NavCard;
export const Header: Ui['Header'] = ui.Header;
export const SideMenu: Ui['SideMenu'] = ui.SideMenu;
export const ConfirmDialog: Ui['ConfirmDialog'] = ui.ConfirmDialog;
export default ui;

import { neu, t, W, H, phone, side, frame } from '../ui.js';

/** The gallery's sections: the rail's (a phone: the bar's) buttons and the overview's cards. */
export const sections = [
  { page: 'Overview', icon: 'house', title: 'Overview', sub: 'Light, shadow and the four shapes' },
  { page: 'Buttons', icon: 'hand-pointer', title: 'Buttons', sub: 'Flat, convex, accent, toggles, round, groups, chips' },
  { page: 'Controls', icon: 'sliders', title: 'Controls', sub: 'Switches, sliders, faders, segmented, steppers' },
  { page: 'Dials', icon: 'gauge-high', title: 'Dials', sub: 'A knob, a thermostat, rings' },
  { page: 'Home', icon: 'lightbulb', title: 'Smart home', sub: 'Device tiles, scenes, climate, music' },
  { page: 'Forms', icon: 'keyboard', title: 'Forms', sub: 'Fields, pickers, select boxes, a PIN pad' },
];

/** a page comes in with a quick fade */
/** @type {import('iva').Transition} */
export const fade = { type: 'fade', time: 0.2 };

/** a section's button: pressed in (lit) on its own page, else a raised one that goes there */
function SectionButton({ sec, page, x, y, size }) {
  const ic = Math.round(size * 0.42);
  return sec.page === page ? (
    <>
      <neu.Plate x={x} y={y} w={size} h={size} r={size / 2} kind="pressed" depth="sm" />
      <neu.Icon x={x + (size - ic) / 2} y={y + (size - ic) / 2} icon={sec.icon} size={ic} color={t.accent} />
    </>
  ) : (
    <neu.RoundButton x={x} y={y} size={size} icon={sec.icon} iconSize={ic} kind="flat" depth="sm" color={t.muted} page={sec.page} />
  );
}

/** A tablet: the rail on the left (this page's button pressed in), the title and the clock. */
function Rail({ page, title, sub }) {
  const rx = 24, ry = 24, rw = 88, rh = 752;
  const b = 52, bx = rx + (rw - b) / 2;
  return (
    <>
      <neu.Plate x={rx} y={ry} w={rw} h={rh} r={34} depth="lg" />
      <neu.Plate x={bx} y={ry + 26} w={b} h={b} r={b / 2} kind="accent" depth="sm" />
      <neu.Icon x={bx + 14} y={ry + 40} icon="circle-half-stroke" size={24} color="#FFFFFF" />
      {sections.map((sec, i) => <SectionButton sec={sec} page={page} x={bx} y={ry + 128 + i * 78} size={b} />)}
      <neu.RoundButton x={bx} y={ry + rh - 26 - b} size={b} icon="moon" kind="flat" depth="sm" color={t.muted} js="IvaTheme.toggle()" />

      <neu.Text x={136} y={26} w={640} h={44} text={title} fontSize={32} fontStyle="Demi Bold" />
      <neu.Text x={136} y={68} w={640} h={24} text={sub} color={t.muted} fontSize={16} fontStyle="Medium" />
      <neu.Plate x={1046} y={30} w={210} h={58} r={29} kind="inset" depth="sm" />
      <neu.Text x={1066} y={34} w={170} h={30} join={neu.clock.time} align="right" fontSize={22} fontStyle="Demi Bold" />
      <neu.Text x={1066} y={62} w={170} h={20} join={neu.clock.date} align="right" color={t.muted} fontSize={13} fontStyle="Medium" />
      <neu.Icon x={1068} y={48} icon="clock" size={20} color={t.accent} />
    </>
  );
}

/**
 * Stacked (a phone, a tablet upright): the title, the time and the look's button on top; the sections in a raised
 * bar at the bottom - a phone on its side, down the left.
 */
function Bar({ page, title }) {
  const b = 44, thick = 62;
  // across the bottom, or down the left: the buttons spread along it
  const bar = side ? { x: 12, y: 12, w: thick, h: H - 24 } : { x: 12, y: H - thick - 12, w: W - 24, h: thick };
  const slot = ((side ? bar.h : bar.w) - 12) / sections.length;
  const at = (i) => Math.round(6 + slot * i + (slot - b) / 2);
  return (
    <>
      <neu.Text x={frame.left + 20} y={13} w={W - frame.left - 200} h={38} text={title} fontSize={24} fontStyle="Demi Bold" />
      <neu.Plate x={W - 168} y={13} w={92} h={38} r={19} kind="inset" depth="sm" />
      <neu.Text x={W - 168} y={13} w={92} h={38} join={neu.clock.time} align="center" fontSize={17} fontStyle="Demi Bold" />
      <neu.RoundButton x={W - 60} y={12} size={40} icon="moon" kind="flat" depth="sm" color={t.muted} js="IvaTheme.toggle()" />
      <neu.Plate x={bar.x} y={bar.y} w={bar.w} h={bar.h} r={thick / 2} depth="md" />
      {sections.map((sec, i) => (
        side
          ? <SectionButton sec={sec} page={page} x={bar.x + (thick - b) / 2} y={bar.y + at(i)} size={b} />
          : <SectionButton sec={sec} page={page} x={bar.x + at(i)} y={bar.y + (thick - b) / 2} size={b} />
      ))}
    </>
  );
}

/** What every page has: its frame (a tablet's rail and title; stacked, the header and bar), the clock. */
export default function Shell({ page, title, sub }) {
  return (
    <>
      {phone ? <Bar page={page} title={title} /> : <Rail page={page} title={title} sub={sub} />}
      {neu.runtime}
      {neu.clockStart}
    </>
  );
}

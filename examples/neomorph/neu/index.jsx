/**
 * neu - neumorphic components for iViewer, made of iva's own elements.
 *
 *   import { createNeu } from './neu/index.jsx';
 *   export const neu = createNeu({ accent: '#6D5DFC' });
 *   <neu.Card title="Living room" x={136} y={112} w={540} h={300}>
 *     <neu.Toggle x={24} y={64} w={492} label="Lights" join="lights" />
 *   </neu.Card>
 *
 * Soft UI is light and shadow on one colour: every shape is a PNG the
 * painter (paint.js) draws at the element's size, raised (two outer shadows,
 * light from the top left) or sunk (two inset ones). A button swaps its
 * raised drawing for a pressed one; its box is the shape plus the room its
 * shadows take (`margin`), so give components the shape's own x / y / w / h.
 * What has to happen on the panel (values, groups, dials, the PIN) is
 * scripts/neu.js. Pickers (select boxes, time, date, number) are iva/ui's, made
 * soft (`soften`).
 */
import { Button as IvaButton, Text as IvaText, Image, Group, Slider as IvaSlider, Gauge, Input, List, Subpage, Script, OnStart, Gesture, d, a, s, l, js, fa, draw, variant, screen } from 'iva';
import { createUi } from 'iva/ui';
import { paint, shade, alpha } from './paint.js';

/** @typedef {typeof looks.light} NeuTheme */
export const looks = {
  light: {
    /** the one colour everything is made of */
    base: '#E4EBF5',
    /** the shadow (bottom right) and the light (top left) */
    dark: '#B8C3DB',
    light: '#FFFFFF',
    /** how much lighter / darker a convex face's two ends are */
    hi: 0.5,
    lo: -0.045,
    /** a switch's knob: its two ends */
    knob: ['#FFFFFF', '#D9E0EC'],
    /** the floor of a sunk field (a picker's), its drums' band */
    well: '#DCE3EE',
    text: '#31405E',
    sub: '#5D6B8A',
    muted: '#9BAACF',
    accent: '#6D5DFC',
    accent2: '#8ABDFF',
    deep: '#4A2ED9',
    ok: '#1FB58F',
    warn: '#F2A23A',
    danger: '#EE5A6F',
    font: 'Avenir Next',
    radius: 24,
  },
  dark: {
    base: '#2B2F37',
    dark: '#1A1D22',
    light: '#3B414B',
    hi: 0.05,
    lo: -0.16,
    knob: ['#555C69', '#3A3F49'],
    well: '#252930',
    text: '#E8ECF4',
    sub: '#AEB6C9',
    muted: '#727C93',
    accent: '#7D6DFF',
    accent2: '#8ABDFF',
    deep: '#4A2ED9',
    ok: '#2CC79F',
    warn: '#F5AE4C',
    danger: '#F2677B',
    font: 'Avenir Next',
    radius: 24,
  },
};

/** how far a shape stands out: [offset, blur] of its shadows */
/** @type {Record<'xs' | 'sm' | 'md' | 'lg', [number, number]>} */
const DEPTH = { xs: [2, 5], sm: [3, 8], md: [5, 12], lg: [9, 22] };
/** the room a shape's shadows take round it */
const marginOf = (dp) => Math.ceil(dp[0] + dp[1] * 1.1);

/** A join as a name of its own, for the joins a component makes for itself. */
const keyOf = (j) => (typeof j === 'object' ? `${j.type}${j.id}` : String(j)).replace(/[^\w]/g, '_');
const fileName = (file) => file.split(/[\\/]/).pop();
const asJoin = (type, j) => (typeof j === 'object' ? j : { d, a, s }[type](j));
/** A join as JavaScript for scripts: "d12", or Joins.d["name"] for a named one (iva's iva-joins.js). */
export function jsJoin(type, j) {
  const { type: t, id } = typeof j === 'object' ? j : { type, id: /^\d+$/.test(String(j)) ? Number(j) : j };
  return typeof id === 'number' ? JSON.stringify(`${t}${id}`) : `Joins.${t}[${JSON.stringify(id)}]`;
}

/** About how wide a text is in Avenir Next (to centre an icon and a text together). */
export function textWidth(str, size) {
  let w = 0;
  for (const ch of String(str)) {
    w += /[il.,:;'|!]/.test(ch) ? 0.25 : /[mwMW]/.test(ch) ? 0.86 : /[A-Z]/.test(ch) ? 0.66 : /\d/.test(ch) ? 0.58 : ch === ' ' ? 0.27 : /[ftjr]/.test(ch) ? 0.36 : 0.55;
  }
  return Math.round(w * size);
}

/**
 * The components in a theme: a look's colours (variant(): the look being
 * built), anything given over them.
 * @param {Partial<NeuTheme>} [theme]
 */
export function createNeu(theme = {}) {
  /** @type {NeuTheme} */
  const T = { ...(variant() === 'dark' ? looks.dark : looks.light), ...theme };
  const runtime = <Script src="../scripts/neu.js" />;
  /** iva/ui in these colours: its pickers (their sheets and drums) and scrolling */
  const ui = createUi({
    page: T.base, bar: T.base, surface: T.base, raised: T.well, accent: T.accent, text: T.text, muted: T.muted,
    danger: T.danger, warning: T.warn, font: T.font, radius: 22,
  });
  /**
   * An image with a join of its own (it moves) keeps the file it was given when the look switches (iva
   * swaps only images without one): neu.js sets the look's own through the join (IvaTheme.file).
   */
  const skin = (join, file) => <OnStart js={`Neu.skin(${jsJoin('s', join)}, ${JSON.stringify(fileName(file))});`} joins={[join]} />;
  /**
   * The name of the join of an image that moves (a switch's knob, a group's pill, a dial's pointer): one of its
   * own each way the page is laid out (<Project orientation="both">) - iViewer moves every element on a join, and
   * turned it's placed otherwise; a square screen's ways are the same, its own both ways.
   */
  const { width: SW, height: SH, orientation: WAY } = screen();
  const moving = (name) => (WAY && SW !== SH ? `${name}_${WAY[0]}` : name);

  // ── drawings ──────────────────────────────────────────────────────

  const lift = ([o, b]) => [{ x: o, y: o, blur: b, color: T.dark }, { x: -o, y: -o, blur: b, color: T.light }];
  const sink = ([o, b], k = 0.7) => [{ x: o * k, y: o * k, blur: b * k, color: T.dark }, { x: -o * k, y: -o * k, blur: b * k, color: T.light }];
  const accentFill = { from: T.accent2, to: T.accent, angle: 135 };

  /** a shape's layer: how it looks, in a rect { x, y, w, h, r } */
  function face(kind, rect, dp) {
    switch (kind) {
      case 'flat': return { shape: rect, fill: T.base, outer: lift(dp) };
      case 'convex': return { shape: rect, fill: { from: shade(T.base, T.hi), to: shade(T.base, T.lo), angle: 135 }, outer: lift(dp) };
      case 'concave': return { shape: rect, fill: { from: shade(T.base, T.lo), to: shade(T.base, T.hi), angle: 135 }, outer: lift(dp) };
      case 'inset': return { shape: rect, fill: T.base, inner: sink(dp) };
      case 'pressed': return { shape: rect, fill: shade(T.base, -0.012), inner: sink(dp, 0.8) };
      case 'accent': return {
        shape: rect, fill: accentFill,
        outer: [{ x: dp[0], y: dp[0], blur: dp[1], color: alpha(T.deep, 0.35) }, { x: -dp[0], y: -dp[0], blur: dp[1], color: T.light }],
        inner: [{ x: 2, y: 2, blur: 8, color: alpha('#FFFFFF', 0.35) }, { x: -2, y: -2, blur: 8, color: alpha(T.deep, 0.45) }],
      };
      case 'accentPressed': return {
        shape: rect, fill: { from: T.accent, to: T.accent2, angle: 135 },
        inner: [{ x: 3, y: 3, blur: 8, color: alpha(T.deep, 0.6) }, { x: -2, y: -2, blur: 6, color: alpha('#FFFFFF', 0.25) }],
      };
      default: throw new Error(`neu: no kind of plate "${kind}" (flat, convex, concave, inset, pressed, accent, accentPressed)`);
    }
  }

  /** a shape w x h with room m round it for its shadows: the file */
  function plate(kind, w, h, r, dp, m) {
    return paint({ w: w + 2 * m, h: h + 2 * m, layers: [face(kind, { x: m, y: m, w, h, r }, dp)] }, kind);
  }

  // ── base ──────────────────────────────────────────────────────────

  /** text in the theme's font and colour */
  const Text = (props) => <IvaText color={T.text} font={T.font} {...props} />;

  /** a Font Awesome icon */
  function Icon({ icon, size = 24, color = T.muted, x = 0, y = 0 }) {
    return <Image x={x} y={y} w={size} h={size} src={fa(icon, { size, color })} />;
  }

  /**
   * A soft shape, x / y / w / h its own (its shadows go round it): flat
   * (raised), convex, concave, inset (sunk), pressed, accent.
   */
  function Plate({ x = 0, y = 0, w, h, r = T.radius, kind = 'flat', depth = 'md' }) {
    const dp = DEPTH[depth];
    const m = kind === 'inset' ? 0 : marginOf(dp);
    return <Image x={x - m} y={y - m} w={w + 2 * m} h={h + 2 * m} src={plate(kind, w, h, r, dp, m)} clickthrough />;
  }

  /** a raised panel with a title; children placed relative to it */
  function Card({ title, x = 0, y = 0, w, h, r = T.radius + 4, kind = 'flat', depth = 'lg', children }) {
    return (
      <Group x={x} y={y}>
        <Plate w={w} h={h} r={r} kind={kind} depth={depth} />
        {title && <Text x={26} y={20} w={w - 52} h={24} text={title.toUpperCase()} color={T.muted} fontSize={14} fontStyle="Demi Bold" />}
        {children}
      </Group>
    );
  }

  /**
   * A button: raised, pressed while held (or while on: toggle). An icon, a
   * text or both (centred together). kind: flat, convex, concave, accent.
   */
  function Button({ x = 0, y = 0, w, h = 56, r, text, icon, iconOn, kind = 'flat', depth = 'md', fontSize = 18, iconSize, color, activeColor,
    join, feedback, toggle = false, value, ...actions }) {
    const dp = DEPTH[depth];
    const m = marginOf(dp);
    const rr = r ?? Math.min(T.radius - 8, h / 2);
    const width = w ?? (text ? textWidth(text, fontSize) + (icon ? (iconSize ?? Math.round(h * 0.38)) + 10 : 0) + 56 : h);
    const accent = kind === 'accent';
    const up = plate(kind, width, h, rr, dp, m);
    const down = plate(accent ? 'accentPressed' : 'pressed', width, h, rr, dp, m);
    const fg = color ?? (accent ? '#FFFFFF' : T.text);
    const fgOn = activeColor ?? (accent ? '#FFFFFF' : T.accent);
    const size = iconSize ?? Math.round(h * 0.38);
    const tw = text !== undefined ? textWidth(text, fontSize) : 0;
    const gap = text !== undefined && icon ? 10 : 0;
    const left = Math.round(m + (width - (icon ? size : 0) - gap - tw) / 2);
    const iconAt = (c, ic = icon) => ic && { src: fa(ic, { size, color: c }), x: text !== undefined ? left : Math.round(m + (width - size) / 2), y: Math.round(m + (h - size) / 2) };
    const button = (
      <IvaButton x={x - m} y={y - m} w={width + 2 * m} h={h + 2 * m} image={up} active={{ image: down, color: fgOn }}
        text={text} color={fg} font={T.font} fontSize={fontSize} fontStyle="Demi Bold"
        align={icon && text !== undefined ? 'left' : 'center'} padding={icon && text !== undefined ? [0, 0, 0, left + size + gap] : 0}
        icon={iconAt(fg)} activeIcon={iconAt(fgOn, iconOn ?? icon)} join={join} feedback={feedback ?? (toggle ? 'toggle' : undefined)} {...actions} />
    );
    // on at the start (a toggle with a join)
    return value && join !== undefined ? <>{button}<OnStart js={`CF.setJoin(${jsJoin('d', join)}, 1);`} /></> : button;
  }

  /** a round icon button (convex: lit from the top left) */
  function RoundButton({ size = 56, icon, kind = 'convex', iconSize, ...rest }) {
    return <Button {...rest} w={size} h={size} r={size / 2} icon={icon} kind={kind} iconSize={iconSize ?? Math.round(size * 0.36)} />;
  }

  /** a small pill: a text, a dot in a colour before it */
  function Chip({ x = 0, y = 0, text, dot, h = 34, kind = 'flat', color = T.sub, fontSize = 14 }) {
    const w = textWidth(text, fontSize) + (dot ? 46 : 32); // chipWidth
    const dp = DEPTH.sm, m = marginOf(dp);
    const img = paint({
      w: w + 2 * m, h: h + 2 * m, layers: [face(kind, { x: m, y: m, w, h, r: h / 2 }, dp),
        ...(dot ? [{ shape: { x: m + 15, y: m + h / 2 - 4, w: 8, h: 8, r: 4 }, fill: dot, outer: [{ x: 0, y: 0, blur: 6, color: alpha(dot, 0.6) }] }] : [])],
    }, 'chip');
    return (
      <Group x={x} y={y}>
        <Image x={-m} y={-m} w={w + 2 * m} h={h + 2 * m} src={img} clickthrough />
        <Text x={dot ? 31 : 16} w={w - (dot ? 31 : 16)} h={h} text={text} color={color} fontSize={fontSize} fontStyle="Demi Bold" />
      </Group>
    );
  }

  // ── tiles ─────────────────────────────────────────────────────────

  /** a device tile: raised when off, pressed in and lit when on (toggle) */
  function Tile({ x = 0, y = 0, w = 170, h = 150, icon, title, sub, on = 'On', off = 'Off', join, feedback = 'toggle', value, ...actions }) {
    const dp = DEPTH.md, m = marginOf(dp), rr = T.radius - 2;
    const ic = (c) => ({ src: fa(icon, { size: 30, color: c }), x: m + 22, y: m + 22 });
    return (
      <Group x={x} y={y}>
        <IvaButton x={-m} y={-m} w={w + 2 * m} h={h + 2 * m} image={plate('flat', w, h, rr, dp, m)} active={{ image: plate('pressed', w, h, rr, dp, m), color: T.accent }}
          join={join} feedback={/** @type {'toggle' | 'momentary' | 'none'} */ (feedback)} icon={ic(T.muted)} activeIcon={ic(T.accent)} text={off} activeText={on}
          color={T.muted} font={T.font} fontSize={14} fontStyle="Demi Bold" align="right" valign="top" padding={[m + 24, m + 22, 0, 0]} {...actions} />
        <Text x={22} y={h - (sub ? 66 : 50)} w={w - 44} h={28} text={title} fontSize={19} fontStyle="Demi Bold" />
        {sub && <Text x={22} y={h - 40} w={w - 44} h={22} text={sub} color={T.muted} fontSize={15} />}
        {value && <OnStart js={`CF.setJoin(${jsJoin('d', join)}, 1);`} />}
      </Group>
    );
  }

  /** a card that goes to a page: an icon in a sunk circle, a title, a line; pressed in while held */
  function NavCard({ x = 0, y = 0, w = 260, h = 170, icon, title, text, page }) {
    const dp = DEPTH.md, m = marginOf(dp), rr = T.radius;
    const well = (pressed) => paint({
      w: w + 2 * m, h: h + 2 * m, layers: [
        face(pressed ? 'pressed' : 'flat', { x: m, y: m, w, h, r: rr }, dp),
        face('inset', { x: m + 22, y: m + 22, w: 56, h: 56, r: 28 }, DEPTH.sm),
      ],
    }, 'nav');
    const ic = (c) => ({ src: fa(icon, { size: 24, color: c }), x: m + 38, y: m + 38 });
    return (
      <Group x={x} y={y}>
        <IvaButton x={-m} y={-m} w={w + 2 * m} h={h + 2 * m} image={well(false)} active={{ image: well(true) }} icon={ic(T.accent)} activeIcon={ic(T.accent)} page={page} />
        <Text x={22} y={94} w={w - 44} h={28} text={title} fontSize={20} fontStyle="Demi Bold" />
        <Text x={22} y={122} w={w - 44} h={h - 130} text={text} color={T.muted} fontSize={15} wrap valign="top" />
      </Group>
    );
  }

  // ── on / off ──────────────────────────────────────────────────────

  /** a switch: a sunk track, lit when on, a raised knob sliding across; the row (label and all) toggles it */
  function Toggle({ x = 0, y = 0, w = 300, h = 52, label, sub, join, value, ...actions }) {
    const tw = 60, th = 32, kd = 24;
    const tx = w - tw, ty = Math.round((h - th) / 2);
    const track = (on) => paint({
      w, h, layers: [
        { shape: { x: tx, y: ty, w: tw, h: th, r: th / 2 }, fill: T.base, inner: sink(DEPTH.sm, 0.8) },
        ...(on ? [{ shape: { x: tx + 3, y: ty + 3, w: tw - 6, h: th - 6, r: (th - 6) / 2 }, fill: accentFill, inner: [{ x: 1, y: 2, blur: 4, color: alpha(T.deep, 0.5) }] }] : []),
      ],
    }, 'switch');
    const km = marginOf(DEPTH.xs);
    const knob = paint({ w: kd + 2 * km, h: kd + 2 * km, layers: [{ ...face('flat', { x: km, y: km, w: kd, h: kd, r: kd / 2 }, DEPTH.xs), fill: { from: T.knob[0], to: T.knob[1], angle: 135 } }] }, 'knob');
    const dj = asJoin('d', join);
    const knobJoin = s(moving(`neu_${keyOf(join)}_knob`));
    return (
      <Group x={x} y={y}>
        <IvaButton w={w} h={h} image={track(false)} active={{ image: track(true) }} join={join} feedback="toggle" {...actions} />
        <Text w={w - tw - 12} h={sub ? 30 : h} y={sub ? 2 : 0} text={label} fontSize={18} fontStyle="Medium" />
        {sub && <Text y={28} w={w - tw - 12} h={22} text={sub} color={T.muted} fontSize={14} />}
        <Image x={tx + 4 - km} y={ty + (th - kd) / 2 - km} w={kd + 2 * km} h={kd + 2 * km} src={knob} join={knobJoin} clickthrough
          motion={{ when: { join: dj, on: { x: `+${tw - 8 - kd}` }, duration: 0.22, curve: 'easeInOut' } }} />
        {runtime}
        {skin(knobJoin, knob)}
        {value && <OnStart js={`CF.setJoin(${jsJoin('d', join)}, 1);`} />}
      </Group>
    );
  }

  /** a row with a box (or a circle: radio) at its left: raised when off, lit when on */
  function markRow({ w, h, round = false, on }) {
    const b = 26, dp = DEPTH.xs, m = marginOf(dp);
    const by = Math.round((h - b) / 2);
    const box = { x: m, y: by, w: b, h: b, r: round ? b / 2 : 8 };
    const layers = !on ? [face('flat', box, dp)]
      : round ? [face('pressed', box, dp), { shape: { x: m + 8, y: by + 8, w: 10, h: 10, r: 5 }, fill: accentFill, outer: [{ x: 0, y: 1, blur: 4, color: alpha(T.accent, 0.5) }] }]
      : [face('accent', box, dp)];
    return paint({ w, h, layers }, round ? 'radio' : 'check');
  }

  function CheckBox({ x = 0, y = 0, w = 260, h = 44, label, join, value, ...actions }) {
    const m = marginOf(DEPTH.xs);
    return (
      <Group x={x} y={y}>
        <IvaButton w={w} h={h} image={markRow({ w, h, on: false })} active={{ image: markRow({ w, h, on: true }) }}
          activeIcon={{ src: fa('check', { size: 14, color: '#FFFFFF' }), x: m + 6, y: Math.round((h - 14) / 2) }}
          text={label} color={T.text} font={T.font} fontSize={18} fontStyle="Medium" align="left" padding={[0, 0, 0, m + 26 + 16]}
          join={join} feedback="toggle" {...actions} />
        {value && <OnStart js={`CF.setJoin(${jsJoin('d', join)}, 1);`} />}
      </Group>
    );
  }

  /** one of several: the index in an analog join, each option's digital join on when chosen; a pill slides under it */
  let groupN = 0;
  function oneOf(join, count, value, pill) {
    const key = keyOf(join);
    // one group a join, whichever way the page is laid out (its options' joins are the join's); each its own pill
    const id = key;
    const option = (i) => d(`neu_${key}_${i}`);
    const pillJoin = s(moving(`neu_${key}_pill_${++groupN}`));
    const opts = pill ? `{ join: ${jsJoin('s', pillJoin)}, xs: ${JSON.stringify(pill.xs)}, at: ${value}, time: 0.24 }` : 'null';
    const start = (
      <OnStart js={`Neu.group(${JSON.stringify(id)}, ${jsJoin('a', join)}, [${Array.from({ length: count }, (_, i) => jsJoin('d', option(i))).join(', ')}], ${value}, ${opts});`}
        joins={[asJoin('a', join), ...(pill ? [pillJoin] : [])]} />
    );
    return { option, pick: (i) => `Neu.pick(${JSON.stringify(id)}, ${i})`, start, pillJoin };
  }

  function RadioGroup({ x = 0, y = 0, w = 260, rowH = 46, options, join, value = 0 }) {
    const g = oneOf(join, options.length, value);
    const m = marginOf(DEPTH.xs);
    return (
      <Group x={x} y={y}>
        {options.map((o, i) => (
          <IvaButton y={i * rowH} w={w} h={rowH} image={markRow({ w, h: rowH, round: true, on: false })} active={{ image: markRow({ w, h: rowH, round: true, on: true }) }}
            text={o} color={T.text} font={T.font} fontSize={18} fontStyle="Medium" align="left" padding={[0, 0, 0, m + 26 + 16]}
            join={g.option(i)} feedback="none" js={g.pick(i)} />
        ))}
        {runtime}
        {g.start}
      </Group>
    );
  }

  /** options in a sunk groove, a raised pill sliding to the one chosen */
  function Segmented({ x = 0, y = 0, w = 320, h = 50, options, join, value = 0, fontSize = 16 }) {
    const inner = 5, seg = (w - 2 * inner) / options.length;
    const xs = options.map((_, i) => inner + Math.round(i * seg));
    const pw = Math.round(seg), ph = h - 2 * inner;
    const dp = DEPTH.xs, m = marginOf(dp);
    const g = oneOf(join, options.length, value, { xs: xs.map((v) => v - m) });
    const pill = paint({ w: pw + 2 * m, h: ph + 2 * m, layers: [face('convex', { x: m, y: m, w: pw, h: ph, r: ph / 2 }, dp)] }, 'pill');
    return (
      <Group x={x} y={y}>
        <Plate w={w} h={h} r={h / 2} kind="inset" depth="sm" />
        <Image x={xs[value] - m} y={inner - m} w={pw + 2 * m} h={ph + 2 * m} join={g.pillJoin} clickthrough src={pill} />
        {skin(g.pillJoin, pill)}
        {options.map((o, i) => (
          <IvaButton x={xs[i]} y={inner} w={Math.round((i + 1) * seg) - Math.round(i * seg)} h={ph} text={o} join={g.option(i)} feedback="none" js={g.pick(i)}
            color={T.muted} active={{ color: T.accent }} font={T.font} fontSize={fontSize} fontStyle="Demi Bold" />
        ))}
        {runtime}
        {g.start}
      </Group>
    );
  }

  /** buttons side by side, one pressed in: the one chosen */
  function ButtonGroup({ x = 0, y = 0, size = 56, gap = 18, icons, join, value = 0 }) {
    const g = oneOf(join, icons.length, value);
    return (
      <Group x={x} y={y}>
        {icons.map((ic, i) => <Button x={i * (size + gap)} w={size} h={size} r={16} icon={ic} join={g.option(i)} feedback="none" js={g.pick(i)} color={T.muted} />)}
        {runtime}
        {g.start}
      </Group>
    );
  }

  // ── values ────────────────────────────────────────────────────────

  // a slider's thumb: the same in every look (iViewer can't switch a thumb's image at runtime) - the light look's accent;
  // drawn at its own size (natural): iViewer shows a thumb at its image's size, whatever the indicator's w / h
  const L = { ...looks.light, ...theme };
  const thumbOf = (ts, pressed) => {
    const m = 8, dot = pressed ? 12 : 8;
    return {
      file: paint({
        w: ts + 2 * m, h: ts + 2 * m, layers: [
          {
            shape: { x: m, y: m, w: ts, h: ts, r: ts / 2 }, fill: { from: L.accent2, to: L.accent, angle: 135 },
            outer: [{ x: 2, y: 3, blur: 7, color: alpha(L.deep, 0.4) }],
            inner: [{ x: 1, y: 1, blur: 4, color: alpha('#FFFFFF', 0.45) }, { x: -1, y: -1, blur: 4, color: alpha(L.deep, 0.4) }],
          },
          { shape: { x: m + (ts - dot) / 2, y: m + (ts - dot) / 2, w: dot, h: dot, r: dot / 2 }, fill: '#FFFFFF', outer: [{ x: 0, y: 1, blur: 3, color: alpha(L.deep, 0.5) }] },
        ],
      }, 'thumb', { natural: true }),
      size: ts + 2 * m,
    };
  };
  /** the value of an analog join as a text, in a serial join of its own */
  const valueText = (join, unit, decimals, min, max) => {
    const text = s(`neu_${keyOf(join)}_value`);
    return {
      text,
      start: <OnStart js={`Neu.value(${jsJoin('a', join)}, ${jsJoin('s', text)}, ${JSON.stringify(unit)}, ${decimals}, ${min}, ${max});`} joins={[text]} />,
    };
  };
  const setAt = (join, value, min, max) => value !== undefined && <OnStart js={`Neu.set(${jsJoin('a', join)}, ${value}, ${min}, ${max});`} />;

  /**
   * A slider: a sunk groove, lit up to a raised thumb; the label and the value above it.
   * The thumb stays in the groove: iViewer's slider runs between the thumb's two halves.
   */
  function Slider({ x = 0, y = 0, w = 320, label, join, min = 0, max = 100, value, unit = '%', decimals = 0, showValue = true, dragCmd }) {
    const th = 12, ts = 28, top = label || showValue ? 34 : 0;
    const v = valueText(join, unit, decimals, min, max);
    const lit = { from: T.accent2, to: T.accent, angle: 90, box: { x: 3, y: 0, w: w - 6, h: 1 } };
    const groove = paint({
      w, h: th, layers: [
        { shape: { x: 0, y: 0, w, h: th, r: th / 2 }, fill: T.base, inner: sink(DEPTH.sm, 0.7) },
        { shape: { x: 3, y: 3, w: ts / 2, h: th - 6, r: (th - 6) / 2 }, fill: lit },
      ],
    }, 'groove');
    const sw = w - ts;
    const fill = paint({ w: sw, h: ts, layers: [{ shape: { x: -ts / 2 - 3, y: (ts - th) / 2 + 3, w: w, h: th - 6, r: 0 }, fill: { ...lit, box: { x: -ts / 2 + 3, y: 0, w: w - 6, h: 1 } } }] }, 'fill');
    const thumb = thumbOf(ts, false), thumbOn = thumbOf(ts, true);
    return (
      <Group x={x} y={y}>
        {label && <Text w={w - 90} h={26} text={label} color={T.sub} fontSize={16} fontStyle="Medium" />}
        {showValue && <Text x={w - 90} w={90} h={26} join={v.text} align="right" fontSize={17} fontStyle="Demi Bold" />}
        <Image y={top + (ts - th) / 2} w={w} h={th} src={groove} clickthrough />
        <IvaSlider x={ts / 2} y={top} w={sw} h={ts} join={join} min={min} max={max} fillImage={fill} dragCmd={dragCmd}
          thumb={{ src: thumb.file, w: thumb.size, h: thumb.size }} activeThumb={{ src: thumbOn.file, w: thumbOn.size, h: thumbOn.size }} />
        {runtime}
        {showValue && v.start}
        {setAt(join, value, min, max)}
      </Group>
    );
  }

  /** an upright slider (a fader): the groove lit from the bottom, the value under it */
  function Fader({ x = 0, y = 0, h = 240, label, join, min = 0, max = 100, value, unit = '', decimals = 0 }) {
    const th = 14, ts = 30, w = ts;
    const gx = (w - th) / 2;
    const v = valueText(join, unit, decimals, min, max);
    const lit = { from: T.accent2, to: T.accent, angle: 0, box: { x: 0, y: 3, w: 1, h: h - 6 } };
    const groove = paint({
      w: th, h, layers: [
        { shape: { x: 0, y: 0, w: th, h, r: th / 2 }, fill: T.base, inner: sink(DEPTH.sm, 0.7) },
        { shape: { x: 3, y: h - 3 - ts / 2, w: th - 6, h: ts / 2, r: (th - 6) / 2 }, fill: lit },
      ],
    }, 'groove');
    const sh = h - ts;
    const fill = paint({ w: ts, h: sh, layers: [{ shape: { x: gx + 3, y: -ts / 2 - 3, w: th - 6, h: h, r: 0 }, fill: { ...lit, box: { x: 0, y: -ts / 2 + 3, w: 1, h: h - 6 } } }] }, 'fill');
    const thumb = thumbOf(ts, false), thumbOn = thumbOf(ts, true);
    return (
      <Group x={x} y={y}>
        <Image x={gx} w={th} h={h} src={groove} clickthrough />
        <IvaSlider y={ts / 2} w={w} h={sh} join={join} min={min} max={max} fillImage={fill}
          thumb={{ src: thumb.file, w: thumb.size, h: thumb.size }} activeThumb={{ src: thumbOn.file, w: thumbOn.size, h: thumbOn.size }} />
        <Text x={-25} y={h + 10} w={w + 50} h={24} join={v.text} align="center" fontSize={16} fontStyle="Demi Bold" />
        {label && <Text x={-25} y={h + 32} w={w + 50} h={20} text={label} align="center" color={T.muted} fontSize={13} fontStyle="Medium" />}
        {runtime}
        {v.start}
        {setAt(join, value, min, max)}
      </Group>
    );
  }

  /** a progress bar: a sunk groove filled up to the value (a gauge on an analog join) */
  function Progress({ x = 0, y = 0, w = 320, label, join, min = 0, max = 100, value, unit = '%', decimals = 0, color, showValue = true }) {
    const th = 14, top = label || showValue ? 32 : 0;
    const v = valueText(join, unit, decimals, min, max);
    const fill = color ? { from: shade(color, 0.25), to: color, angle: 90 } : { from: T.accent2, to: T.accent, angle: 90 };
    return (
      <Group x={x} y={y}>
        {label && <Text w={w - 90} h={24} text={label} color={T.sub} fontSize={16} fontStyle="Medium" />}
        {showValue && <Text x={w - 90} w={90} h={24} join={v.text} align="right" fontSize={16} fontStyle="Demi Bold" />}
        <Plate y={top} w={w} h={th} r={th / 2} kind="inset" depth="sm" />
        <Gauge x={3} y={top + 3} w={w - 6} h={th - 6} join={join}
          fillImage={paint({ w: w - 6, h: th - 6, layers: [{ shape: { x: 0, y: 0, w: w - 6, h: th - 6, r: (th - 6) / 2 }, fill }] }, 'bar')} />
        {runtime}
        {showValue && v.start}
        {setAt(join, value, min, max)}
      </Group>
    );
  }

  /** − value + in a sunk pill */
  function Stepper({ x = 0, y = 0, w = 200, h = 60, join, value, min = 0, max = 100, step = 1, decimals = 0, unit = '' }) {
    const id = JSON.stringify(`stepper_${keyOf(join)}`);
    const text = s(`neu_${keyOf(join)}_step`);
    const b = h - 14;
    return (
      <Group x={x} y={y}>
        <Plate w={w} h={h} r={h / 2} kind="inset" depth="sm" />
        <RoundButton x={7} y={7} size={b} icon="minus" depth="sm" js={`Neu.step(${id}, -1)`} />
        <Text x={h} w={w - 2 * h} h={h} join={text} align="center" fontSize={22} fontStyle="Demi Bold" />
        <RoundButton x={w - 7 - b} y={7} size={b} icon="plus" depth="sm" js={`Neu.step(${id}, 1)`} />
        {runtime}
        <OnStart js={`Neu.stepper(${id}, ${jsJoin('a', join)}, ${jsJoin('s', text)}, ${JSON.stringify({ value, min, max, step, decimals, unit })});`}
          joins={[asJoin('a', join), text]} />
      </Group>
    );
  }

  // ── round ones ────────────────────────────────────────────────────

  /**
   * A knob: tick marks round a raised disc; a lit dot on it turns to the
   * value; the value on the disc. A tap turns it there, a drag has it follow.
   */
  function Knob({ x = 0, y = 0, size = 240, join, min = 0, max = 100, value, step, decimals = 0, unit = '%', label, sweep = 270, buttons = false }) {
    const id = JSON.stringify(`knob_${keyOf(join)}`);
    const from = -sweep / 2;
    const disc = Math.round(size * 0.66);
    const dp = DEPTH.lg, m = marginOf(dp);
    const pointer = s(moving(`neu_${keyOf(join)}_pointer`));
    const text = s(`neu_${keyOf(join)}_knob`);
    const off = (size - disc) / 2;
    // the dot: drawn at the start (from), turned by the value (0 .. sweep)
    const pr = disc / 2 - 13, rad = (from * Math.PI) / 180;
    const dot = 12, dx = disc / 2 + pr * Math.sin(rad) - dot / 2, dy = disc / 2 - pr * Math.cos(rad) - dot / 2;
    const touch = (kind) => `Neu.dialTouch(${id}, gesture.x, gesture.y, "${kind}")`;
    const dotFile = paint({ w: disc, h: disc, layers: [{ shape: { x: dx, y: dy, w: dot, h: dot, r: dot / 2 }, fill: T.accent, outer: [{ x: 0, y: 0, blur: 8, color: alpha(T.accent, 0.7) }] }] }, 'pointer');
    return (
      <Group x={x} y={y}>
        <Image w={size} h={size} src={draw.ticks({ size, count: 37, from, to: -from, length: Math.round(size * 0.05), width: 2, color: T.muted })}>
          <Gesture type="tap" onBegin={touch('tap')} />
          <Gesture type="pan" onBegin={touch('pan')} onChange={touch('pan')} />
        </Image>
        <Image x={off - m} y={off - m} w={disc + 2 * m} h={disc + 2 * m} clickthrough
          src={paint({ w: disc + 2 * m, h: disc + 2 * m, layers: [
            face('convex', { x: m, y: m, w: disc, h: disc, r: disc / 2 }, dp),
            face('inset', { x: m + 26, y: m + 26, w: disc - 52, h: disc - 52, r: (disc - 52) / 2 }, DEPTH.sm),
          ] }, 'disc')} />
        <Image x={off} y={off} w={disc} h={disc} join={pointer} clickthrough src={dotFile} />
        {skin(pointer, dotFile)}
        <Text x={off} y={size / 2 - 24} w={disc} h={40} join={text} align="center" fontSize={Math.round(size * 0.13)} fontStyle="Demi Bold" />
        {label && <Text x={off} y={size / 2 + 14} w={disc} h={22} text={label} align="center" color={T.muted} fontSize={14} fontStyle="Medium" />}
        {/* - and + at the knob's open end: a tap a step, held a step every 120 ms */}
        {buttons && [-1, 1].map((dir) => (
          <RoundButton x={dir < 0 ? Math.round(size * 0.16) - 26 : Math.round(size * 0.84) - 26} y={size - 52} size={52} depth="sm" kind="flat" icon={dir < 0 ? 'minus' : 'plus'}
            onPress={[js(`Neu.dialStep(${id}, ${dir})`), js(`Neu.dialStep(${id}, ${dir})`, { delay: 400, repeat: 120 })]} />
        ))}
        {runtime}
        <OnStart js={`Neu.dial(${id}, ${JSON.stringify({ size, from, sweep, min, max, step: step ?? 0, decimals, unit, value })}, ${jsJoin('a', join)}, ${jsJoin('s', pointer)}, ${jsJoin('s', text)});`}
          joins={[asJoin('a', join), pointer, text]} />
      </Group>
    );
  }

  /** a ring filled to a part (drawn as it is: a value of the build's), the value in it */
  function Ring({ x = 0, y = 0, size = 150, part, text, label, color }) {
    const t = 14, c = size / 2, R = c - 18;
    const lit = color ? { from: shade(color, 0.3), to: color, angle: 90 } : { from: T.accent2, to: T.accent, angle: 90 };
    const glow = color ?? T.accent;
    const dp = DEPTH.md, m = marginOf(dp);
    return (
      <Group x={x} y={y}>
        <Image x={-m} y={-m} w={size + 2 * m} h={size + 2 * m} clickthrough src={paint({
          w: size + 2 * m, h: size + 2 * m, layers: [
            face('flat', { x: m, y: m, w: size, h: size, r: c }, dp),
            { shape: { cx: m + c, cy: m + c, radius: R, thickness: t + 6 }, fill: T.base, inner: sink(DEPTH.sm, 0.7) },
            { shape: { cx: m + c, cy: m + c, radius: R, thickness: t - 4, from: 0, to: Math.max(1, part * 360) }, fill: lit, outer: [{ x: 0, y: 1, blur: 6, color: alpha(glow, 0.45) }] },
          ],
        }, 'ring')} />
        <Text y={c - (label ? 24 : 16)} w={size} h={34} text={text} align="center" fontSize={Math.round(size * 0.16)} fontStyle="Demi Bold" />
        {label && <Text y={c + 8} w={size} h={20} text={label} align="center" color={T.muted} fontSize={13} fontStyle="Medium" />}
      </Group>
    );
  }

  // ── forms ─────────────────────────────────────────────────────────

  /** a sunk field: an icon, the text (a serial join), a hint while it's empty */
  function Field({ x = 0, y = 0, w = 320, h = 54, icon, hint, join, password, cmd }) {
    const hintJoin = s(`neu_${keyOf(join)}_hint`);
    const left = icon ? 54 : 22;
    return (
      <Group x={x} y={y}>
        <Plate w={w} h={h} r={h / 2} kind="inset" depth="sm" />
        {icon && <Icon x={22} y={Math.round((h - 20) / 2)} icon={icon} size={20} />}
        <Text x={left} w={w - left - 20} h={h} join={hintJoin} color={T.muted} fontSize={17} />
        <Input x={left} y={6} w={w - left - 20} h={h - 12} join={join} password={password} cmd={cmd} color={T.text} font={T.font} fontSize={17} />
        {runtime}
        {hint && <OnStart js={`Neu.hint(${jsJoin('s', join)}, ${jsJoin('s', hintJoin)}, ${JSON.stringify(hint)});`} joins={[asJoin('s', join), hintJoin]} />}
      </Group>
    );
  }

  /** a PIN keypad: round keys, the code as dots in a sunk pill, a line saying how it went */
  function PinPad({ x = 0, y = 0, key = 64, gap = 22, code = '1234', length = 4, onEnter = '' }) {
    const id = JSON.stringify(`pin_${keyOf(code)}_${length}`);
    const dots = s(`neu_pin_${keyOf(code)}_dots`);
    const status = s(`neu_pin_${keyOf(code)}_status`);
    const w = 3 * key + 2 * gap;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'];
    const k = (n) => (n === 'back' ? `Neu.pinBack(${id})` : n === 'ok' ? `Neu.pinOk(${id})` : `Neu.pinKey(${id}, "${n}")`);
    return (
      <Group x={x} y={y}>
        <Plate w={w} h={52} r={26} kind="inset" depth="sm" />
        <Text w={w} h={52} join={dots} align="center" color={T.accent} fontSize={26} />
        <Text y={60} w={w} h={24} join={status} align="center" color={T.muted} fontSize={15} fontStyle="Medium" />
        {keys.map((n, i) => {
          const kx = (i % 3) * (key + gap), ky = 104 + Math.floor(i / 3) * (key + gap - 4);
          return n === 'back' ? <RoundButton x={kx} y={ky} size={key} icon="delete-left" kind="flat" depth="sm" color={T.muted} js={k(n)} />
            : n === 'ok' ? <RoundButton x={kx} y={ky} size={key} icon="check" kind="accent" depth="sm" js={k(n)} />
            : <RoundButton x={kx} y={ky} size={key} text={n} kind="flat" depth="sm" fontSize={24} js={k(n)} />;
        })}
        {runtime}
        <OnStart js={`Neu.pin(${id}, ${JSON.stringify({ code, length })}, ${jsJoin('s', dots)}, ${jsJoin('s', status)}, function (code) { ${onEnter} });`} joins={[dots, status]} />
      </Group>
    );
  }

  // ── pickers: iva/ui's, made soft ──────────────────────────────────

  /**
   * iva/ui's pickers keep their logic (drums, the search, the keypad, sheets and dropdowns: iva-ui.js)
   * and lose their flat look: what one returns is plain elements, so each flat piece is swapped for a
   * soft one before it goes on the page - told apart by the colours this ui was given (raised: T.well,
   * surface and page: T.base, accent).
   */
  function soften(c) {
    if (Array.isArray(c)) return c.map(soften);
    if (!c || typeof c !== 'object' || c.$$iva !== 1) return c;
    const n = { ...c, props: { ...c.props }, children: c.children.map(soften) };
    const p = n.props;
    const x = p.x ?? 0, y = p.y ?? 0;
    const grown = (m) => ({ x: x - m, y: y - m, w: p.w + 2 * m, h: p.h + 2 * m });
    // a field, a drum's band, the search field, the keypad's display: sunk in
    if (n.type === 'Box' && p.radius !== undefined && p.borderWidth === undefined && (p.bg === T.well || p.bg === T.base)) {
      return <Image x={x} y={y} w={p.w} h={p.h} clickthrough src={plate('inset', p.w, p.h, Math.min(p.radius, p.h / 2), DEPTH.sm, 0)} />;
    }
    // a sheet: a raised panel
    if (n.type === 'Box' && p.bg === T.base && p.borderWidth !== undefined) {
      const m = marginOf(DEPTH.lg);
      return <Image {...grown(m)} clickthrough src={plate('flat', p.w, p.h, p.radius ?? 26, DEPTH.lg, m)} />;
    }
    // behind a sheet: the page, faded towards the base colour (shadows need a surface to fall on), not black
    if (n.type === 'Subpage' && p.bg === '#000000a0') {
      p.bg = `${T.base}c8`;
      return n;
    }
    // a dropdown: a raised panel - the subpage grown by the room its shadows take, the content where it was
    if (n.type === 'Subpage' && p.topmost && !p.fixed && p.bg === T.base) {
      const m = marginOf(DEPTH.md);
      const { bg, radius, borderWidth, borderColor, ...rest } = p;
      return {
        ...n, props: { ...rest, ...grown(m) },
        children: [<Image w={p.w + 2 * m} h={p.h + 2 * m} src={plate('flat', p.w, p.h, radius ?? 22, DEPTH.md, m)} />, <Group x={m} y={m}>{n.children}</Group>],
      };
    }
    // Cancel / Now / Today, the keypad's keys: raised, pressed in; OK: the accent one
    if (n.type === 'Button' && p.radius !== undefined && (p.bg === T.well || p.bg === T.accent)) {
      const m = marginOf(DEPTH.sm), accent = p.bg === T.accent;
      const { bg, radius, active, ...rest } = p;
      const r = Math.min(radius, p.h / 2);
      return {
        ...n, props: {
          ...rest, ...grown(m), color: accent ? '#FFFFFF' : p.color,
          image: plate(accent ? 'accent' : 'flat', p.w, p.h, r, DEPTH.sm, m),
          active: { image: plate(accent ? 'accentPressed' : 'pressed', p.w, p.h, r, DEPTH.sm, m), color: accent ? '#FFFFFF' : T.accent },
        },
      };
    }
    // a select box's option: pressed in when it's the one
    if (n.type === 'Button' && p.radius !== undefined && !p.bg && p.active?.bg === T.well) {
      const { radius, active, ...rest } = p;
      const { bg, ...act } = active;
      return { ...n, props: { ...rest, active: { ...act, image: plate('pressed', p.w, p.h, Math.min(radius, p.h / 2), DEPTH.sm, 0) } } };
    }
    // a sheet's close button: round and raised
    if (n.type === 'Button' && !p.bg && p.icon?.$$icon === 1 && p.icon.name === 'xmark') {
      const m = marginOf(DEPTH.sm), r = Math.min(p.w, p.h) / 2;
      return { ...n, props: { ...p, ...grown(m), image: plate('flat', p.w, p.h, r, DEPTH.sm, m), active: { image: plate('pressed', p.w, p.h, r, DEPTH.sm, m) } } };
    }
    return n;
  }
  /** an iva/ui picker, made soft; `mode`: 'dropdown' under the field, 'sheet' in the middle (a phone: the one a scroll can hold) */
  const sunk = (Picker) => (props) => soften(<Picker w={320} h={54} fontSize={18} {...props} />);
  /**
   * One of a few, in a sunk field: a sheet in the middle (dimmed behind) or a dropdown under the field;
   * the index in an analog join. The options are a list's rows: a touch only arms one - it's picked on
   * release, if the finger didn't drag the list - and the list always scrolls (a short blank row after
   * the options when they all fit), so a drag on a short list scrolls it and picks nothing.
   */
  function Select({ x = 0, y = 0, w = 320, h = 54, options, join, value, title = '', mode = 'sheet', rows = 6, fontSize = 18 }) {
    const key = keyOf(join);
    const id = JSON.stringify(`select_${key}`);
    const open = d(`neu_${key}_sel_open`);
    const label = s(`neu_${key}_sel_label`);
    const list = l(`neu_${key}_sel`);
    const { width: PW, height: PH } = ui.theme.panel;
    const rowH = 52, shown = Math.min(options.length, rows), listH = shown * rowH;
    const sheet = mode === 'sheet';
    const sw = sheet ? Math.min(420, PW - 24) : w;
    const rw = sheet ? sw - 32 : w - 12;
    const rowName = `neu_sel_row_${rw}_${rowH}`, spacerName = `neu_sel_end_${rw}`;
    const close = `Neu.selectClose(${id})`;
    const row = (
      <Subpage name={rowName} define w={rw} h={rowH}>
        <IvaButton w={rw} h={rowH} join={1} feedback="none"
          active={{ image: paint({ w: rw, h: rowH, layers: [face('pressed', { x: 2, y: 3, w: rw - 4, h: rowH - 6, r: (rowH - 6) / 2 }, DEPTH.sm)] }, 'row') }}
          activeIcon={{ src: fa('check', { size: 18, color: T.accent }), x: rw - 42, y: Math.round((rowH - 18) / 2) }}
          onPress={js('Neu.rowDown(list)')} onRelease={js('Neu.selectPick(list, listIndex)')} />
        <Text x={20} w={rw - 72} h={rowH} join={1} fontSize={18} />
      </Subpage>
    );
    const theList = <List w={rw} h={listH} join={list} item={rowName} />;
    const fade = { type: /** @type {'fade'} */ ('fade'), time: 0.15 };
    let popup;
    if (sheet) {
      const head = 70, sh = head + listH + 18, sx = Math.round((PW - sw) / 2), sy = Math.round((PH - sh) / 2);
      const m = marginOf(DEPTH.lg);
      popup = (
        <Subpage name={`neu_sel_${key}_sheet`} fixed topmost w={PW} h={PH} join={open} bg={`${T.base}c8`} in={fade} out={fade}>
          <IvaButton w={PW} h={PH} feedback="none" js={close} />
          <Group x={sx} y={sy}>
            <Image x={-m} y={-m} w={sw + 2 * m} h={sh + 2 * m} clickthrough src={plate('flat', sw, sh, 28, DEPTH.lg, m)} />
            {/* taps on the sheet stay on it */}
            <IvaButton w={sw} h={sh} feedback="none" />
            <Text x={24} y={14} w={sw - 96} h={44} text={title} fontSize={24} fontStyle="Demi Bold" />
            <RoundButton x={sw - 62} y={12} size={46} icon="xmark" kind="flat" depth="sm" color={T.muted} js={close} />
            <Group x={16} y={head}>{theList}</Group>
          </Group>
        </Subpage>
      );
    } else {
      const m = marginOf(DEPTH.md), dh = listH + 16;
      popup = (
        <>
          <Subpage name={`neu_sel_${key}_away`} fixed topmost w={PW} h={PH} join={open}>
            <IvaButton w={PW} h={PH} feedback="none" js={close} />
          </Subpage>
          <Subpage name={`neu_sel_${key}_drop_${w}`} topmost x={-m} y={h + 6 - m} w={w + 2 * m} h={dh + 2 * m} join={open} in={fade} out={fade}>
            <Image w={w + 2 * m} h={dh + 2 * m} src={plate('flat', w, dh, 22, DEPTH.md, m)} />
            <IvaButton x={m} y={m} w={w} h={dh} feedback="none" />
            <Group x={m + 6} y={m + 8}>{theList}</Group>
          </Subpage>
        </>
      );
    }
    const o = `{ join: ${jsJoin('a', join)}, label: ${jsJoin('s', label)}, open: ${jsJoin('d', open)}, list: ${jsJoin('l', list)}, ` +
      `row: ${JSON.stringify(rowName)}, end: ${JSON.stringify(spacerName)}, options: ${JSON.stringify(options)}${value !== undefined ? `, value: ${value}` : ''} }`;
    return (
      <Group x={x} y={y}>
        <Plate w={w} h={h} r={22} kind="inset" depth="sm" />
        <Text x={20} w={w - 64} h={h} join={label} fontSize={fontSize} />
        <Icon x={w - 38} y={Math.round((h - 18) / 2)} icon="chevron-down" size={18} />
        <IvaButton w={w} h={h} feedback="none" js={`Neu.selectOpen(${id})`} />
        {row}
        {/* after the options: the room a short list scrolls by */}
        <Subpage name={spacerName} define w={rw} h={Math.round(rowH / 2)} />
        {popup}
        {runtime}
        <OnStart js={`Neu.select(${id}, ${o});`} joins={[asJoin('a', join), open, label, list]} />
      </Group>
    );
  }
  /** one of many: a search field over the options, filtering as you type */
  const SearchSelect = sunk(ui.SearchSelect);
  /** a time: hour and minute drums */
  const TimePicker = sunk(ui.TimePicker);
  /** a date: day, month and year drums */
  const DatePicker = sunk(ui.DatePicker);
  /** a number: a keypad, checked against min..max */
  const NumberField = sunk(ui.NumberField);

  // ── layout ────────────────────────────────────────────────────────

  /**
   * Content that scrolls when it goes further down than h, as GUI Designer projects scroll a panel of
   * controls: a list with no rows whose header subpage is the content - named after `name` (the same in
   * every look). The list has no join, so the joins in its header are the page's own (a list's own
   * would make them its rows'). In it: buttons, texts, images, sliders, fields; no gesture (a Knob:
   * iViewer fires none in a list), no subpage - a sheet over the panel (fixed) goes on the page.
   */
  function Scroll({ name, x = 0, y = 0, w, h, contentH, children }) {
    if (contentH <= h) return <Group x={x} y={y}>{children}</Group>;
    const lifted = [];
    const lift = (c) => {
      if (Array.isArray(c)) return c.map(lift);
      if (!c || typeof c !== 'object') return c;
      if (c.type === 'Subpage' && c.props.fixed) {
        lifted.push(c);
        return null;
      }
      return c.children?.length ? { ...c, children: c.children.map(lift) } : c;
    };
    const content = lift(children);
    const sub = `neu_scroll_${name}`;
    return (
      <Group x={x} y={y}>
        <Subpage name={sub} define w={w} h={contentH}>{content}</Subpage>
        <List w={w} h={h} header={sub} />
        {lifted}
      </Group>
    );
  }

  /** the digital join that's high while option i of a one-of-several (Segmented, RadioGroup, ButtonGroup) is the one */
  const optionJoin = (join, i) => d(`neu_${keyOf(join)}_${i}`);
  /** how wide a Chip is */
  const chipWidth = (text, dot, fontSize = 14) => textWidth(text, fontSize) + (dot ? 46 : 32);

  // ── the frame ─────────────────────────────────────────────────────

  /** the clock and the date, in serial joins of their own */
  const clockJoins = { time: s('neu_clock_time'), date: s('neu_clock_date') };
  const clockStart = <OnStart js={`Neu.clock(${jsJoin('s', clockJoins.time)}, ${jsJoin('s', clockJoins.date)});`} joins={[clockJoins.time, clockJoins.date]} />;

  return {
    theme: T, ui, depth: DEPTH, marginOf, face, plate, paint, clock: clockJoins, clockStart, runtime, optionJoin, chipWidth,
    Text, Icon, Plate, Card, Button, RoundButton, Chip, Tile, NavCard, Toggle, CheckBox, RadioGroup, Segmented, ButtonGroup,
    Slider, Fader, Progress, Stepper, Knob, Ring, Field, PinPad, Select, SearchSelect, TimePicker, DatePicker, NumberField, Scroll,
  };
}

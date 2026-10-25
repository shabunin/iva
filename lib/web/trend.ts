/**
 * iva:trend - curves of joins over time (uPlot). The panel records the
 * joins (<WebApp record>) and answers 'history' (or the project's own
 * history handler: a database, say); new rows come as they're taken.
 * Ranges to pick, ‹ › through the past, Live to follow; a touch reads the
 * values at that time.
 */
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { panel, type Sample } from 'iva/web';
import { fontStack, h, look, numberOf, type Look } from './look';

export interface TrendCurve {
  /** the join's name in the WebApp's joins */
  name: string;
  label?: string;
  color?: string;
  width?: number;
  /** an analog join's 0..65535 stands for this range */
  scale?: [number, number];
  decimals?: number;
  unit?: string;
  /** an axis of its own on the right */
  side?: 'left' | 'right';
}

export interface TrendOptions {
  curves: TrendCurve[];
  /** seconds shown at first (default: the first of ranges) */
  range?: number;
  /** the range buttons, in seconds */
  ranges?: number[];
  /** the left axis (default: to fit) */
  min?: number;
  max?: number;
  /** the right axis, for curves with side: 'right' */
  rightMin?: number;
  rightMax?: number;
  title?: string;
  theme?: Partial<Look>;
  words?: { live?: string };
}

const o = panel.options as TrendOptions;
const L = look(o.theme);
const curves = o.curves ?? [];
const ranges = o.ranges?.length ? o.ranges : [300, 900, 3600];
const font = fontStack(L.font);
let range = o.range ?? ranges[0];
let live = true;
/** the right edge (ms) while looking at the past */
let end = Date.now();

// the rows shown: time (s), a column per curve
let xs: number[] = [];
let ys: (number | null)[][] = curves.map(() => []);

function columns(names: readonly string[]) {
  return curves.map((c) => names.indexOf(c.name));
}
function setRows(names: readonly string[], rows: Sample[]) {
  const cols = columns(names);
  xs = rows.map((r) => r[0] / 1000);
  ys = curves.map((c, i) => rows.map((r) => (cols[i] < 0 ? null : numberOf(r[cols[i] + 1], c.scale))));
}
function addRow(names: readonly string[], row: Sample) {
  const cols = columns(names);
  xs.push(row[0] / 1000);
  curves.forEach((c, i) => ys[i].push(cols[i] < 0 ? null : numberOf(row[cols[i] + 1], c.scale)));
  // what no range shows any more goes
  const oldest = Date.now() / 1000 - Math.max(...ranges) * 1.5;
  let drop = 0;
  while (drop < xs.length && xs[drop] < oldest) drop++;
  if (drop) {
    xs.splice(0, drop);
    for (const col of ys) col.splice(0, drop);
  }
}

const label = (s: number) => (s % 3600 === 0 ? `${s / 3600}h` : s % 60 === 0 ? `${s / 60}m` : `${s}s`);
const fmt = (c: TrendCurve, v: number | null | undefined) => (v === null || v === undefined ? '–' : `${v.toFixed(c.decimals ?? 1)}${c.unit ? ` ${c.unit}` : ''}`);

// ── the page: a bar, the chart, a legend ─────────────────────────

document.body.style.display = 'flex';
document.body.style.flexDirection = 'column';
const pill = (text: string) => h('button', {
  font: `600 13px ${font}`, color: L.text, background: L.raised, border: '0', borderRadius: '14px', height: '28px', padding: '0 12px', marginLeft: '6px',
}, text);
const bar = h('div', { display: 'flex', alignItems: 'center', height: '44px', padding: '0 12px', flex: '0 0 auto' });
const title = h('div', { flex: '1', font: `600 15px ${font}`, color: L.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, o.title ?? '');
const back = pill('‹');
const fwd = pill('›');
const liveBtn = pill(o.words?.live ?? 'Live');
const rangeBtns = ranges.map((r) => {
  const b = pill(label(r));
  b.onclick = () => {
    range = r;
    load();
  };
  return b;
});
bar.append(title, back, ...rangeBtns, fwd, liveBtn);
const chart = h('div', { flex: '1 1 auto', minHeight: '0', position: 'relative' });
const legend = h('div', { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '4px 14px 8px', font: `13px ${font}`, color: L.muted, flex: '0 0 auto' });
document.body.append(bar, chart, legend);

const values = curves.map((c) => {
  const v = h('b', { color: L.text, fontWeight: '600', marginLeft: '6px' }, '–');
  legend.append(h('span', { whiteSpace: 'nowrap' }, h('i', { display: 'inline-block', width: '10px', height: '10px', borderRadius: '5px', background: c.color ?? L.accent, marginRight: '6px' }), c.label ?? c.name, v));
  return v;
});

function paintButtons() {
  rangeBtns.forEach((b, i) => {
    b.style.background = ranges[i] === range ? L.accent : L.raised;
    b.style.color = ranges[i] === range ? '#fff' : L.text;
  });
  liveBtn.style.background = live ? L.accent : L.raised;
  liveBtn.style.color = live ? '#fff' : L.text;
  fwd.style.opacity = live ? '0.4' : '1';
}

// sides: 2 bottom, 3 left, 1 right
const axis = (scale: string, side: number): uPlot.Axis => ({
  scale, side, stroke: L.muted, font: `12px ${font}`, grid: { stroke: L.grid, width: 1, show: side !== 1 }, ticks: { stroke: L.grid, width: 1 },
  size: side === 2 ? 30 : 50,
});
const hasRight = curves.some((c) => c.side === 'right');
const plot = new uPlot({
  width: chart.clientWidth || window.innerWidth,
  height: chart.clientHeight || window.innerHeight - 80,
  legend: { show: false },
  cursor: { drag: { x: false, y: false }, points: { size: 8 } },
  scales: {
    x: { time: true },
    y: o.min !== undefined && o.max !== undefined ? { range: [o.min, o.max] } : {},
    ...(hasRight ? { r: o.rightMin !== undefined && o.rightMax !== undefined ? { range: [o.rightMin, o.rightMax] } : {} } : {}),
  },
  series: [{}, ...curves.map((c) => ({ label: c.label ?? c.name, stroke: c.color ?? L.accent, width: c.width ?? 2, scale: c.side === 'right' ? 'r' : 'y', spanGaps: false }))],
  axes: [axis('x', 2), axis('y', 3), ...(hasRight ? [axis('r', 1)] : [])],
  hooks: { setCursor: [(u) => showValues(u.cursor.idx)] },
}, [xs, ...ys] as uPlot.AlignedData, chart);

/** the values at a point of the chart, else the latest */
function showValues(idx?: number | null) {
  curves.forEach((c, i) => {
    const col = ys[i];
    let v: number | null | undefined = null;
    if (idx !== null && idx !== undefined) v = col[idx];
    else for (let k = col.length - 1; k >= 0 && (v === null || v === undefined); k--) v = col[k];
    values[i].textContent = fmt(c, v);
  });
}

function redraw() {
  const to = live ? Date.now() / 1000 : end / 1000;
  plot.batch(() => {
    plot.setData([xs, ...ys] as uPlot.AlignedData, false);
    plot.setScale('x', { min: to - range, max: to });
  });
  showValues(plot.cursor.idx);
  paintButtons();
}

/** the rows for the window shown (the panel's history) */
async function load() {
  const to = live ? Date.now() : end;
  try {
    const got = await panel.history(to - range * 1000 * 1.5, to);
    setRows(got.names, got.rows);
  } catch {
    // no history: what comes from now on
  }
  redraw();
}

panel.onSample((row) => {
  // the past looked at keeps its rows (uPlot holds these arrays: a cut would shift them under it); Live asks the
  // history afresh
  if (!live) return;
  addRow(panel.recorded, row);
  redraw();
});
back.onclick = () => {
  end = (live ? Date.now() : end) - range * 1000;
  live = false;
  load();
};
fwd.onclick = () => {
  if (live) return;
  end += range * 1000;
  if (end >= Date.now()) live = true;
  load();
};
liveBtn.onclick = () => {
  live = true;
  load();
};

// a finger on the chart reads the values there
const over = plot.over;
const touch = (e: TouchEvent) => {
  const r = over.getBoundingClientRect();
  const t = e.touches[0];
  if (!t) return;
  plot.setCursor({ left: t.clientX - r.left, top: t.clientY - r.top });
  e.preventDefault();
};
over.addEventListener('touchstart', touch, { passive: false });
over.addEventListener('touchmove', touch, { passive: false });
over.addEventListener('touchend', () => setTimeout(() => plot.setCursor({ left: -10, top: -10 }), 1500));

const fit = () => plot.setSize({ width: chart.clientWidth, height: chart.clientHeight });
window.addEventListener('resize', fit);
requestAnimationFrame(fit);
// the time moves on even when no row comes
setInterval(() => live && redraw(), 1000);
load();

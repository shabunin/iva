/**
 * iva:chart - a Chart.js chart: bar, line, doughnut, pie, radar, polarArea.
 * Data from the options, from joins (a dataset's `joins`: a value each,
 * live), or from a serial join named `data` with JSON ({ labels, datasets }
 * or an array of numbers), redrawn as it changes.
 */
import Chart from 'chart.js/auto';
import { panel } from 'iva/web';
import { fontStack, look, numberOf, type Look } from './look';

export interface ChartDataset {
  label?: string;
  data?: number[];
  /** the joins (names in the WebApp's joins) its values come from, one per label */
  joins?: string[];
  /** analog joins' 0..65535 stands for this range */
  scale?: [number, number];
  color?: string;
  /** a colour per value (pie, doughnut, bars) */
  colors?: string[];
  fill?: boolean;
}

export interface ChartOptions {
  type?: 'bar' | 'line' | 'doughnut' | 'pie' | 'radar' | 'polarArea';
  labels?: string[];
  datasets?: ChartDataset[];
  /** bars across */
  horizontal?: boolean;
  stacked?: boolean;
  min?: number;
  max?: number;
  unit?: string;
  legend?: boolean;
  title?: string;
  theme?: Partial<Look>;
}

const o = panel.options as ChartOptions;
const L = look(o.theme);
const type = o.type ?? 'bar';
const round = type === 'doughnut' || type === 'pie' || type === 'polarArea';
const PALETTE = [L.accent, '#2D8CF0', '#FFB000', '#E5484D', '#A855F7', '#F07A22', '#10B981', '#EC4899'];

Chart.defaults.color = L.muted;
Chart.defaults.borderColor = L.grid;
Chart.defaults.font.family = fontStack(L.font);
Chart.defaults.font.size = 13;

const canvas = document.createElement('canvas');
document.body.style.padding = '8px';
document.body.style.boxSizing = 'border-box';
document.body.append(canvas);

const datasets = (o.datasets ?? []).map((d, i) => {
  const color = d.color ?? PALETTE[i % PALETTE.length];
  const colors = d.colors ?? (round ? (o.labels ?? []).map((_, k) => PALETTE[k % PALETTE.length]) : undefined);
  return {
    label: d.label ?? '',
    data: d.data ?? (d.joins ?? []).map((j) => numberOf(panel.values[j], d.scale) ?? 0),
    backgroundColor: colors ?? (type === 'line' || type === 'radar' ? `${color}33` : color),
    borderColor: round ? L.bg : color,
    borderWidth: round ? 2 : type === 'bar' ? 0 : 2,
    borderRadius: type === 'bar' ? 6 : 0,
    fill: d.fill ?? type === 'radar',
    tension: 0.3,
    pointRadius: type === 'line' ? 3 : undefined,
  };
});

const unit = o.unit ? ` ${o.unit}` : '';
const valueScale = {
  min: o.min, max: o.max, stacked: o.stacked, grid: { color: L.grid }, border: { display: false },
  ticks: { callback: (v: string | number) => `${v}${unit}` },
};
const chart = new Chart(canvas, {
  type,
  data: { labels: o.labels ?? [], datasets },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400 },
    indexAxis: o.horizontal ? 'y' : 'x',
    plugins: {
      legend: { display: o.legend ?? (round || datasets.length > 1), labels: { color: L.text, boxWidth: 12, boxHeight: 12 } },
      title: { display: !!o.title, text: o.title, color: L.text, font: { size: 15, weight: 'bold' } },
      tooltip: { callbacks: { label: (c: { dataset: { label?: string }; formattedValue: string }) => `${c.dataset.label ? `${c.dataset.label}: ` : ''}${c.formattedValue}${unit}` } },
    },
    scales: round ? (type === 'polarArea' ? { r: { grid: { color: L.grid }, ticks: { backdropColor: 'transparent' } } } : {})
      : type === 'radar' ? { r: { grid: { color: L.grid }, angleLines: { color: L.grid }, pointLabels: { color: L.text }, ticks: { backdropColor: 'transparent' }, min: o.min, max: o.max } }
        : o.horizontal ? { x: valueScale, y: { stacked: o.stacked, grid: { display: false } } } : { x: { stacked: o.stacked, grid: { display: false } }, y: valueScale },
  } as never,
});
canvas.parentElement!.style.height = '100%';

// live values: a dataset's joins
(o.datasets ?? []).forEach((d, i) => {
  (d.joins ?? []).forEach((name, k) => {
    panel.on(name, (v) => {
      chart.data.datasets[i].data[k] = numberOf(v, d.scale) ?? 0;
      chart.update();
    });
  });
});

// a serial join `data`: the whole chart's data, as JSON
if (panel.names.includes('data')) {
  panel.on('data', (v) => {
    let d: unknown;
    try {
      d = JSON.parse(String(v || 'null'));
    } catch {
      return;
    }
    if (Array.isArray(d)) chart.data.datasets[0].data = d as number[];
    else if (d && typeof d === 'object') {
      const x = d as { labels?: string[]; datasets?: ChartDataset[] };
      if (x.labels) chart.data.labels = x.labels;
      x.datasets?.forEach((ds, i) => {
        if (!chart.data.datasets[i]) return;
        if (ds.data) chart.data.datasets[i].data = ds.data;
        if (ds.label) chart.data.datasets[i].label = ds.label;
      });
    }
    chart.update();
  });
}

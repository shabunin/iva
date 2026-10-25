import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';

const TREND = path.resolve(import.meta.dirname, '../lib/web/trend.ts');

type Sample = [number, ...unknown[]];

/**
 * lib/web/trend.ts on a page of its own: uPlot stood in for (it keeps the
 * arrays setData gives it, as uPlot does), the panel answering 'history'
 * from its rows, its new samples sent by hand.
 */
async function trend(rows: Sample[]) {
  const out = await build({
    entryPoints: [TREND],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    logLevel: 'silent',
    plugins: [{
      name: 'stand-ins',
      setup(b) {
        b.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'stand-in' }));
        b.onResolve({ filter: /^uplot$/ }, () => ({ path: 'uplot', namespace: 'stand-in' }));
        b.onResolve({ filter: /^iva\/web$/ }, () => ({ path: 'iva-web', namespace: 'stand-in' }));
        b.onLoad({ filter: /.*/, namespace: 'stand-in' }, (a) => ({
          contents: a.path === 'css' ? '' : a.path === 'uplot'
            ? `export default class {
                constructor(opts, data) { this.data = data; this.cursor = { idx: null }; this.over = document.createElement('div'); fake.plot = this; }
                batch(fn) { fn(); }
                setData(d) { this.data = d; }
                setScale(k, s) { this.scale = s; }
                setCursor() {}
                setSize() {}
              }`
            : `export const panel = fake.panel;`,
          loader: 'js',
        }));
      },
    }],
  });
  const { window, document } = parseHTML('<!doctype html><html><head></head><body></body></html>');
  let onSample: (s: Sample) => void = () => {};
  const fake: any = {
    panel: {
      options: { curves: [{ name: 'temp' }], ranges: [3600] },
      recorded: ['temp'],
      history: async (from: number, to: number) => ({ names: ['temp'], rows: rows.filter((r) => r[0] >= from && r[0] <= to) }),
      onSample: (cb: (s: Sample) => void) => (onSample = cb, () => {}),
    },
  };
  Object.assign(window, { innerWidth: 800, innerHeight: 480 });
  new Function('window', 'document', 'fake', 'requestAnimationFrame', 'setInterval', out.outputFiles[0].text)(
    window, document, fake, () => 0, () => 0);
  const settle = () => new Promise((r) => setTimeout(r, 0));
  await settle();
  const [back, , , live] = [...document.querySelectorAll('button')] as any[];
  return {
    plot: () => fake.plot as { data: number[][]; scale: { min: number; max: number } },
    sample: (s: Sample) => onSample(s),
    back: async () => (back.onclick(), settle()),
    live: async () => (live.onclick(), settle()),
  };
}

test('Trend: a live sample leaves the past being looked at as it is', async () => {
  const now = Date.now();
  // a row a minute over the last 6 hours
  const rows: Sample[] = Array.from({ length: 360 }, (_, i) => [now - (360 - i) * 60_000, i]);
  const t = await trend(rows);
  // two hours back on the 1 h range: the window 3 to 2 hours ago
  await t.back();
  await t.back();
  const [xs, ys] = t.plot().data;
  const shown = [xs.slice(), ys.slice()];
  assert.ok(xs.length > 60, `${xs.length} rows shown`);
  assert.ok(xs[0] < (now - 3 * 3600_000) / 1000);
  // a new sample now: not into the rows shown, which uPlot holds
  const row: Sample = [Date.now(), 999];
  rows.push(row);
  t.sample(row);
  assert.deepEqual([t.plot().data[0], t.plot().data[1]], shown);
  // Live again: the newest row with the rest
  await t.live();
  assert.equal(t.plot().data[1].at(-1), 999);
});

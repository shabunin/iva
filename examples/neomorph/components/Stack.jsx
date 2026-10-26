import { neu, W, H, frame, cols, CW } from '../ui.js';

/**
 * A stacked page: cards between the header and the bar, scrolling when they go further - one under another, or in
 * two columns where there's room (each card to the shorter one).
 * items: { h, title?, body } (a card, CW wide: its body laid out for that), or { h, el: (x, y, w) => ... } (anything
 * else, across the columns).
 */
export default function Stack({ page, items, gap = 24 }) {
  const x = 18, full = W - frame.left - 36;
  const tops = Array.from({ length: cols }, () => 16);
  const placed = items.map((it) => {
    if (it.el) {
      const at = Math.max(...tops);
      tops.fill(at + it.h + gap);
      return it.el(x, at, full);
    }
    const c = tops.indexOf(Math.min(...tops));
    const at = tops[c];
    tops[c] += it.h + gap;
    return <neu.Card title={it.title} x={x + c * (CW + gap)} y={at} w={CW} h={it.h} r={26} depth="md">{it.body}</neu.Card>;
  });
  const h = H - frame.top - frame.bar;
  return <neu.Scroll name={page} x={frame.left} y={frame.top} w={W - frame.left} h={h} contentH={Math.max(...tops) - gap + 20}>{placed}</neu.Scroll>;
}

import { neu, W, H, frame } from '../ui.js';

/**
 * A phone's page: cards one under another between the header and the bar, scrolling when they go further.
 * items: { h, title?, body } (a card), or { h, el: (x, y, w) => ... } (anything else, full width).
 */
export default function Stack({ page, items, gap = 24 }) {
  const x = 18, w = W - 36;
  let y = 16;
  const placed = items.map((it) => {
    const at = y;
    y += it.h + gap;
    return it.el ? it.el(x, at, w) : <neu.Card title={it.title} x={x} y={at} w={w} h={it.h} r={26} depth="md">{it.body}</neu.Card>;
  });
  const h = H - frame.top - frame.bar;
  return <neu.Scroll name={page} y={frame.top} w={W} h={h} contentH={y - gap + 20}>{placed}</neu.Scroll>;
}

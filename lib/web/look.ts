/** The colours and font iva/ui gives its web apps (options.theme), with defaults. */
export interface Look {
  bg: string;
  surface: string;
  raised: string;
  text: string;
  muted: string;
  grid: string;
  accent: string;
  font: string;
}

const DARK: Look = { bg: '#22272C', surface: '#22272C', raised: '#2B3137', text: '#FFFFFF', muted: '#8A949C', grid: '#3A4148', accent: '#00BC97', font: 'Helvetica Neue' };

export function look(theme: Partial<Look> | undefined): Look {
  const l = { ...DARK, ...(theme ?? {}) };
  document.body.style.background = l.bg;
  document.body.style.color = l.text;
  document.body.style.fontFamily = fontStack(l.font);
  return l;
}

export const fontStack = (font: string) => `"${font}", -apple-system, "Helvetica Neue", Roboto, Arial, sans-serif`;

/** An element with a style and children. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, style: Partial<CSSStyleDeclaration> = {}, ...children: (Node | string)[]) {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  for (const c of children) e.append(c);
  return e;
}

/** 0..65535 (an analog join) as lo..hi, a number as it is, text as a number (serial joins). */
export function numberOf(v: unknown, scale?: [number, number]): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return null;
  return scale ? scale[0] + (n / 65535) * (scale[1] - scale[0]) : n;
}

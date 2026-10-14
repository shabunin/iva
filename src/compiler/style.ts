/**
 * Style props -> .gui themes. A .gui styles objects only through named CSS
 * themes (`<theme type name=".x[state='0']">css</theme>`, a button has two
 * states), so every distinct style becomes one generated theme, shared by all
 * the elements that look the same.
 */

import { createHash } from 'node:crypto';
import type { StyleProps } from './components.js';
import { el, type XNode } from './xml.js';

export type ThemeType = 'button' | 'text' | 'background' | 'gauge' | 'input' | 'list';

const PREFIX: Record<ThemeType, string> = { button: 'btn', text: 'txt', background: 'bg', gauge: 'gauge', input: 'input', list: 'list' };

/** '#rrggbbaa' isn't CSS iViewer reads: rgba() instead. Everything else as is. */
export function cssColor(c: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim());
  if (!m) return c;
  const [r, g, b, a] = m.slice(1).map((h) => parseInt(h, 16));
  return `rgba(${r},${g},${b},${Math.round((a / 255) * 100) / 100})`;
}

const sides = (v: number | number[]) => (Array.isArray(v) ? v : [v, v, v, v]).map((n) => `${n}px`).join(' ');

/** Resolves an image prop to the name the .gui refers to it by. */
export type ImageResolver = (src: string) => string;

/** CSS declarations for a style, in a stable order (the theme name hashes them). */
export function styleCss(type: ThemeType, st: StyleProps, image: ImageResolver): string {
  const decl: [string, string][] = [];
  const add = (k: string, v: string | undefined) => v !== undefined && decl.push([k, v]);
  const textual = type === 'button' || type === 'text' || type === 'input';

  add('background-color', st.bg && cssColor(st.bg));
  if (st.image) {
    const url = `url(${image(st.image)})`;
    if (st.slice !== undefined) add('-webkit-border-image', `${url} ${(Array.isArray(st.slice) ? st.slice : [st.slice, st.slice, st.slice, st.slice]).join(' ')}`);
    else add('background-image', url);
    if (type === 'background') add('background-repeat', 'no-repeat');
  }
  if (st.padding !== undefined) add('padding', sides(st.padding));
  if (st.borderWidth !== undefined) add('border-width', `${st.borderWidth}px`);
  if (st.borderColor !== undefined) add('border-color', cssColor(st.borderColor));
  if (textual) {
    // GUI Designer writes the full text block on every text theme; iViewer relies on it
    add('color', cssColor(st.color ?? '#FFFFFF'));
    add('font-size', `${st.fontSize ?? 16}px`);
    if (st.fontName) add('font-name', `'${st.fontName}'`);
    add('font-family', `'${st.font ?? 'Arial'}'`);
    add('text-align', st.align ?? (type === 'button' ? 'center' : 'left'));
    add('vertical-align', st.valign ?? 'middle');
    add('font-weight', st.bold ? 'bold' : 'normal');
    add('font-style', st.italic ? 'italic' : 'none');
    add('text-decoration', 'none');
    if (st.shadow !== undefined) {
      const sh = st.shadow;
      add('text-shadow', typeof sh === 'string' ? sh : `${cssColor(sh.color ?? 'rgba(0,0,0,1)')} ${sh.x ?? 0}px ${sh.y ?? 1}px ${sh.blur ?? 0}px`);
    }
    add('display', 'table-cell');
    if (type === 'button') {
      add('box-sizing', 'border-box');
      add('-webkit-box-sizing', 'border-box');
      add('-webkit-tap-highlight-color', 'rgba(0,0,0,0)');
    }
  }
  if (st.opacity !== undefined) add('opacity', String(st.opacity));
  const extra = decl.map(([k, v]) => `${k}: ${v};`).join(' ');
  return st.css ? `${extra} ${st.css.trim()}`.trim() : extra;
}

interface ThemeDef {
  type: ThemeType;
  name: string;
  /** css per state ('0' always, '1' for buttons) */
  states: string[];
}

export class Themes {
  private byName = new Map<string, ThemeDef>();
  private byCss = new Map<string, string>();

  has(name: string) {
    return this.byName.has(name);
  }

  names() {
    return this.byName.keys();
  }

  typeOf(name: string) {
    return this.byName.get(name)?.type;
  }

  /** A theme the project names itself (<Theme>). */
  define(name: string, type: ThemeType, states: string[]) {
    if (this.byName.has(name)) throw new Error(`theme "${name}" is defined twice`);
    this.byName.set(name, { type, name, states });
  }

  /** The generated theme for these states: same CSS, same theme. */
  generated(type: ThemeType, states: string[]): string {
    const key = `${type}\n${states.join('\n')}`;
    let name = this.byCss.get(key);
    if (name) return name;
    const hash = createHash('sha1').update(key).digest('hex');
    for (let len = 6; ; len++) {
      name = `${PREFIX[type]}_${hash.slice(0, len)}`;
      if (!this.byName.has(name)) break;
    }
    this.byName.set(name, { type, name, states });
    this.byCss.set(key, name);
    return name;
  }

  toXml(): XNode {
    const out: XNode[] = [];
    for (const t of this.byName.values()) {
      t.states.forEach((css, i) => {
        const node = el('theme', { type: t.type, name: t.states.length > 1 ? `.${t.name}[state='${i}']` : `.${t.name}` });
        node.cdata = css;
        out.push(node);
      });
    }
    return el('themes', {}, out);
  }
}

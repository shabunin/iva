/**
 * Style props -> .gui themes. A .gui styles objects only through named CSS
 * themes (`<theme type name=".x[state='0']">css</theme>`, a button has two
 * states), so every distinct style becomes one generated theme, shared by all
 * the elements that look the same.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { didYouMean } from './suggest.js';
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

/** Fonts the devices have: platform -> family -> style -> font name (from GUI Designer's fontlist.xml). */
const FONTS: Record<string, Record<string, Record<string, string>>> = JSON.parse(
  fs.readFileSync(new URL('./fonts.json', import.meta.url), 'utf8'),
);

/** The font name iViewer loads for a family and style (`font-name`), or why there isn't one. */
export function fontName(family: string, style: string): { name?: string; problem?: string } {
  for (const platform of ['ios', 'android']) {
    const styles = FONTS[platform][family];
    if (!styles) continue;
    if (styles[style]) return { name: styles[style] };
    return { problem: `font "${family}" has no ${style} style (it has ${Object.keys(styles).join(', ')})` };
  }
  const families = [...Object.keys(FONTS.ios), ...Object.keys(FONTS.android)];
  return { problem: `"${family}" isn't a font iOS / Android devices have${didYouMean(family, families)}; give fontName too if you ship it` };
}

/** Resolves an image prop to the name the .gui refers to it by. */
export type ImageResolver = (src: string) => string;

/**
 * CSS declarations for a style, laid out the way GUI Designer writes them
 * (iViewer and Designer read them that way: e.g. a button's background
 * colour shows only with Designer's opacity triple before it).
 */
export function styleCss(type: ThemeType, st: StyleProps, image: ImageResolver, warn: (msg: string) => void = () => {}): string {
  const decl: string[] = [];
  const add = (k: string, v: string | undefined) => v !== undefined && decl.push(`${k}: ${v};`);
  const textual = type === 'button' || type === 'text' || type === 'input';
  const slice = st.slice === undefined ? undefined : Array.isArray(st.slice) ? st.slice : [st.slice, st.slice, st.slice, st.slice];
  const opacity = st.opacity ?? 1;

  const background = () => {
    if (st.bg !== undefined) {
      if (type === 'button') {
        decl.push(`filter: Alpha(Opacity=${Math.round(opacity * 100)}); -moz-opacity:${opacity}; opacity: ${opacity};`);
      }
      add('background-color', cssColor(st.bg));
    }
    if (st.image) {
      const url = `url(${image(st.image)})`;
      if (slice) add('-webkit-border-image', `${url} ${slice.join(' ')}`);
      else add('background-image', url);
      if (type === 'background') add('background-repeat', 'no-repeat');
    }
  };

  if (type === 'button') {
    // GUI Designer insets a 9-sliced button's text by the slices
    add('padding', st.padding !== undefined ? sides(st.padding) : slice && st.image ? `${slice[0]}px ${slice[1]}px ${slice[2]}px ${slice[3]}px` : '0px 0px 0px 0px');
  } else if (st.padding !== undefined) {
    add('padding', sides(st.padding));
  }
  background();
  if (st.borderWidth !== undefined) add('border-width', `${st.borderWidth}px`);
  if (st.borderColor !== undefined) add('border-color', cssColor(st.borderColor));
  if (textual) {
    const family = st.font ?? 'Arial';
    const style = st.fontStyle ?? (st.bold && st.italic ? 'Bold Italic' : st.bold ? 'Bold' : st.italic ? 'Italic' : 'Regular');
    let name = st.fontName;
    if (name === undefined) {
      const f = fontName(family, style);
      name = f.name;
      if (f.problem) warn(f.problem);
    }
    const bold = st.bold ?? /bold|black|heavy/i.test(style);
    const italic = st.italic ?? /italic|oblique/i.test(style);
    if (st.shadow !== undefined) {
      const sh = st.shadow;
      add('text-shadow', typeof sh === 'string' ? sh : `${cssColor(sh.color ?? 'rgba(0,0,0,1)')} ${sh.x ?? 0}px ${sh.y ?? 1}px ${sh.blur ?? 0}px`);
    }
    add('color', cssColor(st.color ?? '#FFFFFF'));
    add('font-size', `${st.fontSize ?? 16}px`);
    if (name) add('font-name', `'${name}'`);
    add('font-family', `'${family}'`);
    const align = () => {
      add('text-align', st.align ?? (type === 'button' ? 'center' : 'left'));
      add('vertical-align', st.valign ?? 'middle');
    };
    const face = () => {
      add('font-weight', bold ? 'bold' : 'normal');
      // GUI Designer's spelling
      add('font-style', italic ? 'italics' : 'none');
      add('text-decoration', 'none');
    };
    // buttons: face, then alignment; text and inputs: the other way round (as GUI Designer writes them)
    if (type === 'button') (face(), align());
    else (align(), face());
    add('display', 'table-cell');
    if (type === 'button') {
      add('box-sizing', 'border-box');
      add('-webkit-box-sizing', 'border-box');
      decl.push('-webkit-tap-highlight-color:rgba(0,0,0,0);');
    }
  } else if (st.opacity !== undefined) {
    add('opacity', String(st.opacity));
  }
  return st.css ? `${decl.join(' ')} ${st.css.trim()}`.trim() : decl.join(' ');
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

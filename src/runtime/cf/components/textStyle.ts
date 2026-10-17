import { Text, TextStyle, Graphics, CanvasTextMetrics, type Container, type TextStyleOptions } from 'pixi.js';

/**
 * Text as a theme lays it out (GUI Designer's CSS): font, weight, style,
 * colour, shadow; text-align, vertical-align and padding within the box.
 */
export interface TextLayout {
    style: TextStyle;
    align: 'left' | 'center' | 'right';
    valign: 'top' | 'middle' | 'bottom';
    /** top, right, bottom, left */
    pad: [number, number, number, number];
    /** text-decoration: underline */
    underline: boolean;
}

/** the styles of themes that underline (text-decoration: underline) */
const underlined = new WeakSet<TextStyle>();

type Css = Record<string, string> | null | undefined;

/** A weight from the device's font name ('HelveticaNeue-Medium'), else from font-weight. */
function weightOf(css: Css): TextStyleOptions['fontWeight'] {
    const name = (css?.['font-name'] ?? '').replace(/['"]/g, '');
    const styles: [RegExp, TextStyleOptions['fontWeight']][] = [
        [/ultra ?light|extra ?light/i, '200'], [/thin|hairline/i, '100'], [/light/i, '300'], [/medium/i, '500'],
        [/semi ?bold|demi ?bold/i, '600'], [/extra ?bold|heavy|black/i, '800'], [/bold/i, 'bold'],
    ];
    for (const [re, w] of styles) if (re.test(name.split('-').slice(1).join('-'))) return w;
    const w = (css?.['font-weight'] ?? '').trim().toLowerCase();
    if (w === 'bold' || w === 'bolder') return 'bold';
    if (/^\d{3}$/.test(w)) return w as TextStyleOptions['fontWeight'];
    return 'normal';
}

function paddingOf(css: Css): [number, number, number, number] {
    const all = (css?.['padding'] ?? '').trim();
    const v = all ? all.split(/\s+/).map((p) => parseFloat(p) || 0) : [];
    const [t = 0, r = t, b = t, l = r] = v;
    const side = (k: string, d: number) => (css?.[k] !== undefined ? parseFloat(css[k]) || 0 : d);
    return [side('padding-top', t), side('padding-right', r), side('padding-bottom', b), side('padding-left', l)];
}

function shadowOf(css: Css): TextStyleOptions['dropShadow'] | undefined {
    const shadow = css?.['text-shadow'];
    if (!shadow) return undefined;
    // rgba(0,0,0,0.78) 0px -1px 0px   (or a colour name / #hex first)
    const m = /^\s*((?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?/i.exec(shadow);
    if (!m) return undefined;
    const dx = parseFloat(m[2]) || 0;
    const dy = parseFloat(m[3]) || 0;
    return { color: m[1], alpha: 1, blur: parseFloat(m[4] ?? '0') || 0, distance: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
}

/**
 * The layout for a box `w` wide. `wrap`: lines break at the box (minus
 * padding); `align`: the default when the theme gives none.
 */
export function textLayout(css: Css, w: number, wrap: boolean, align: TextLayout['align'] = 'left', overrideAlign?: string): TextLayout {
    const pad = paddingOf(css);
    const a = (overrideAlign || css?.['text-align'] || align).toLowerCase();
    const va = (css?.['vertical-align'] || 'middle').toLowerCase();
    const family = (css?.['font-family'] ?? '').replace(/['"]/g, '').split(',').map((f) => f.trim()).filter(Boolean);
    const options: TextStyleOptions = {
        fill: css?.['color'] || '#ffffff',
        fontSize: parseFloat(css?.['font-size'] ?? '') || 16,
        fontFamily: family.length ? [...family, 'sans-serif'] : ['Arial', 'sans-serif'],
        fontWeight: weightOf(css),
        fontStyle: /^italics?$|^oblique$/i.test(css?.['font-style'] ?? '') ? 'italic' : 'normal',
        align: a === 'right' ? 'right' : a === 'center' ? 'center' : 'left',
        wordWrap: wrap,
        wordWrapWidth: Math.max(1, w - pad[1] - pad[3]),
        breakWords: wrap,
    };
    const dropShadow = shadowOf(css);
    if (dropShadow) options.dropShadow = dropShadow;
    const style = new TextStyle(options);
    const underline = /\bunderline\b/i.test(css?.['text-decoration'] ?? '');
    if (underline) underlined.add(style);
    return {
        style,
        align: options.align as TextLayout['align'],
        valign: va === 'top' ? 'top' : va === 'bottom' ? 'bottom' : 'middle',
        pad,
        underline,
    };
}

/**
 * A line under each line of `text` in its colour while its style is one
 * that underlines - drawn again as its text, style or place change (a
 * button's other state). In `parent`, over the text.
 */
export function underline(text: Text, parent: Container) {
    const line = new Graphics();
    line.eventMode = 'none';
    parent.addChildAt(line, parent.getChildIndex(text) + 1);
    let drawn = '';
    text.onRender = () => {
        const on = underlined.has(text.style) && text.visible && !!text.text;
        const now = on ? `${text.text}|${text.x}|${text.y}|${text.anchor.x}|${text.anchor.y}|${text.style.uid}` : '';
        if (now === drawn) return;
        drawn = now;
        line.clear();
        if (!on) return;
        const m = CanvasTextMetrics.measureText(String(text.text), text.style);
        const size = Number(text.style.fontSize) || 16;
        const thick = Math.max(1, Math.round(size / 16));
        const left = text.x - text.anchor.x * m.width;
        const top = text.y - text.anchor.y * m.height;
        m.lines.forEach((_, i) => {
            const w = m.lineWidths[i];
            const free = m.maxLineWidth - w;
            const x = left + (text.style.align === 'right' ? free : text.style.align === 'center' ? free / 2 : 0);
            line.rect(x, top + i * m.lineHeight + m.fontProperties.ascent + Math.max(1, size * 0.08), w, thick);
        });
        line.fill({ color: text.style.fill as string });
    };
    text.on('destroyed', () => line.destroy());
}

/** the biggest texture a phone's GPU takes: a text drawn past it is a black box */
const MAX_TEXTURE = 4096;

/**
 * `text` cut to what a w x h box can show, so a long value (a 64 KB log on a
 * join) never asks for a texture bigger than a GPU draws (a black box on a
 * phone): the lines past twice the box or past the texture limit go, and a
 * line that isn't wrapped is cut where it passes the limit. Text that a
 * box might show stays as it is, drawn past its edges as before.
 */
export function fitText(text: string, layout: TextLayout, w: number, h: number): string {
    const size = Number(layout.style.fontSize) || 16;
    const [t, r, b, l] = layout.pad;
    const limit = MAX_TEXTURE / (globalThis.devicePixelRatio || 1) - 8;
    const innerW = Math.max(1, w - l - r);
    const innerH = Math.max(size, h - t - b);
    const wrap = !!layout.style.wordWrap;
    // a cheap cut first: more characters than lines this high and wide could show (a glyph a fifth of the font size)
    const perLine = Math.ceil(Math.min(wrap ? innerW : limit, limit) / (size * 0.2)) + 1;
    const maxLines = Math.ceil(Math.min(innerH * 2, limit) / (size * 0.8)) + 1;
    let lines = text.split('\n');
    let cut = false;
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        cut = true;
    }
    if (wrap) {
        const most = perLine * maxLines;
        if (lines.some((x) => x.length > most)) {
            lines = lines.map((x) => x.slice(0, most));
            cut = true;
        }
    } else if (lines.some((x) => x.length > perLine)) {
        lines = lines.map((x) => x.slice(0, perLine));
        cut = true;
    }
    if (!cut) return text;
    // then as measured: the lines a box twice as high shows (within the texture), each within the texture's width
    const m = CanvasTextMetrics.measureText(lines.join('\n'), layout.style, undefined, wrap);
    const lineHeight = m.lineHeight || size * 1.2;
    const keep = Math.max(1, Math.floor(Math.min(innerH * 2, limit) / lineHeight));
    const kept = m.lines.slice(0, keep).map((line, i) => {
        const width = m.lineWidths[i];
        return width > limit && line.length ? line.slice(0, Math.max(1, Math.floor((line.length * limit) / width))) : line;
    });
    return kept.join('\n');
}

/** Place `text` in a w x h box as the layout says. */
export function placeText(text: Text, layout: TextLayout, w: number, h: number) {
    const [t, r, b, l] = layout.pad;
    const ax = layout.align === 'left' ? 0 : layout.align === 'right' ? 1 : 0.5;
    const ay = layout.valign === 'top' ? 0 : layout.valign === 'bottom' ? 1 : 0.5;
    text.anchor.set(ax, ay);
    text.x = layout.align === 'left' ? l : layout.align === 'right' ? w - r : l + (w - l - r) / 2;
    text.y = layout.valign === 'top' ? t : layout.valign === 'bottom' ? h - b : t + (h - t - b) / 2;
}

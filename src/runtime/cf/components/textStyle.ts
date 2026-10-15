import { Text, TextStyle, type TextStyleOptions } from 'pixi.js';

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
}

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
    return {
        style: new TextStyle(options),
        align: options.align as TextLayout['align'],
        valign: va === 'top' ? 'top' : va === 'bottom' ? 'bottom' : 'middle',
        pad,
    };
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

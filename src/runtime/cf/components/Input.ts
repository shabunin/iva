import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';
import { DomLayer } from '../domLayer';

/** Theme CSS an <input> can't use as is. */
const SKIP = new Set(['display', 'vertical-align', 'filter', '-moz-opacity', 'font-name', '-webkit-box-sizing', '-webkit-tap-highlight-color']);
const PAD = 2;

/**
 * An input field, styled by its input theme. The canvas draws it (its
 * background, border, text) so it stacks like everything else, often over
 * an image of a field; a tap puts a real <input> on top of it to type into
 * (see DomLayer), until it loses focus.
 *
 * `s` is its serial join: setting it sets the text, and typing writes it
 * (with CF.InputFieldEditedEvent and the on-change command / macro on each
 * change). Return sends the value actions (`command` / `macro`, with
 * [inputval] the text) and ends editing. Editing fires CF.KeyboardUpEvent,
 * ending it CF.KeyboardDownEvent. `pass="1"`: a password field; `autoFocus="1"`:
 * editing as soon as it is shown.
 */
export function renderInput(
    node: CFNode,
    container: Container,
    renderer: CFRenderer,
    css: Record<string, string> | null,
    listPrefix?: string,
    listIndex?: number
) {
    const a = node.attributes;
    const s = a.s && a.s !== '0' ? (listPrefix ? `${listPrefix}:${listIndex}:${a.s}` : a.s) : null;
    const joinName = s ? `s${s}` : '';
    const password = a.pass === '1';
    const cf = () => renderer.cfApi as any;
    const scope = renderer.currentScope ?? undefined;
    const w = node.w;
    const h = node.h;

    // ── drawn: background, border, text ──
    const bg = css?.['background-color'];
    const bw = parseFloat(css?.['border-width'] ?? '') || 0;
    const box = new Graphics();
    if (bg && bg.toLowerCase() !== 'transparent') box.rect(0, 0, w, h).fill({ color: bg });
    if (bw > 0) box.rect(bw / 2, bw / 2, w - bw, h - bw).stroke({ color: css?.['border-color'] || '#000000', width: bw });
    container.addChild(box);

    const family = [css?.['font-name'], css?.['font-family']]
        .map((f) => f?.replace(/['"]/g, '').trim())
        .filter((f): f is string => !!f);
    const align = (css?.['text-align'] || 'left').toLowerCase();
    const label = new Text({
        text: '',
        style: new TextStyle({
            fill: css?.color || '#000000',
            fontSize: parseInt(css?.['font-size'] ?? '', 10) || 16,
            fontFamily: [...family, 'Arial', 'sans-serif'],
            fontWeight: css?.['font-weight'] === 'bold' ? 'bold' : 'normal',
            fontStyle: /^italics?$/.test(css?.['font-style'] ?? '') ? 'italic' : 'normal',
        }),
    });
    label.anchor.set(align === 'center' ? 0.5 : align === 'right' ? 1 : 0, 0.5);
    label.x = align === 'center' ? w / 2 : align === 'right' ? w - PAD - bw : PAD + bw;
    label.y = h / 2;
    const clip = new Graphics().rect(0, 0, w, h).fill({ color: 0xffffff });
    label.mask = clip;
    container.addChild(clip, label);

    // ── the <input> to type into ──
    const input = document.createElement('input');
    input.type = password ? 'password' : 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    Object.assign(input.style, {
        border: '0', outline: 'none', padding: `0 ${PAD}px`, background: 'transparent', color: '#000',
        font: '16px Arial, sans-serif', colorScheme: 'normal',
    } satisfies Partial<CSSStyleDeclaration>);
    applyTheme(input, css, renderer);

    const show = () => {
        label.text = password ? '•'.repeat(input.value.length) : input.value;
    };
    input.value = s && joinStore.has(s, 's') ? String(joinStore.get(s, 's')) : (node.text ?? '');
    show();
    if (s) {
        joinStore.on(s, 's', (val) => {
            if (container.destroyed) return;
            const text = String(val ?? '');
            if (input.value !== text) input.value = text;
            show();
        }, scope);
    }

    const run = (cmd?: string, macro?: string) => {
        try {
            if (cmd) cf()?.runCommand('', cmd, input.value, { data: input.value });
            if (macro) cf()?.runMacro(macro);
        } catch (e) {
            console.error('[cf input] action failed:', e);
        }
    };

    const layer = DomLayer.for(renderer);
    const item = { el: input, container, w, h, over: true, enabled: false };
    layer.add(item);

    const edit = () => {
        if (item.enabled || container.destroyed) return;
        item.enabled = true;
        box.visible = label.visible = false;
        layer.update();
        input.focus();
        const end = input.value.length;
        try {
            input.setSelectionRange(end, end);
        } catch {
            // password fields in some browsers
        }
    };
    const done = () => {
        if (!item.enabled) return;
        item.enabled = false;
        if (!container.destroyed) {
            box.visible = label.visible = true;
            show();
        }
        layer.update();
    };

    container.eventMode = 'static';
    container.cursor = 'text';
    container.on('pointertap', edit);

    input.addEventListener('input', () => {
        show();
        if (s) cf()?.setJoin(joinName, input.value);
        cf()?.dispatchEvent(cf().InputFieldEditedEvent, joinName, input.value);
        run(a.changeCommand, a.changeMacro);
    });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') input.blur();
        if (e.key !== 'Enter') return;
        e.preventDefault();
        run(a.command, a.macro);
        input.blur();
    });
    input.addEventListener('focus', () => cf()?.dispatchEvent(cf().KeyboardUpEvent, joinName));
    input.addEventListener('blur', () => {
        done();
        cf()?.dispatchEvent(cf().KeyboardDownEvent, joinName);
    });

    if (a.autoFocus === '1') {
        // once it is on the stage and visible
        let tries = 0;
        const tryEdit = () => {
            if (container.destroyed || item.enabled || ++tries > 120) return;
            let shown = true;
            for (let p: Container | null = container; p; p = p.parent) {
                if (!p.visible) shown = false;
                if (p === renderer.app.stage) break;
                if (!p.parent) shown = false;
            }
            if (shown) edit();
            else requestAnimationFrame(tryEdit);
        };
        requestAnimationFrame(tryEdit);
    }
}

/** The input theme's CSS on the element; url(file) resolved to the project's files. */
function applyTheme(el: HTMLElement, css: Record<string, string> | null, renderer: CFRenderer) {
    if (!css) return;
    for (const [key, raw] of Object.entries(css)) {
        if (SKIP.has(key)) continue;
        let value = raw.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (_, f: string) => `url("${renderer.resolveUrl(f)}")`);
        if (key === 'font-style' && value === 'none') value = 'normal';
        if (key === 'font-style' && value === 'italics') value = 'italic';
        el.style.setProperty(key, value);
    }
    // the device's font first, then the family
    const fontName = css['font-name']?.replace(/['"]/g, '').trim();
    const family = css['font-family'];
    if (fontName) el.style.setProperty('font-family', `'${fontName}'${family ? `, ${family}` : ''}, sans-serif`);
    const bw = parseFloat(css['border-width'] ?? '');
    if (bw > 0 && !css['border-style']) el.style.setProperty('border-style', 'solid');
}

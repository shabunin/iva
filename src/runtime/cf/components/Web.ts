import { Container } from 'pixi.js';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';
import { DomLayer } from '../domLayer';

/**
 * A web view: an <iframe> over the canvas (see DomLayer).
 *
 * Joins: `j` (serial) is the URL - setting it loads the page; `title`
 * (serial) gets the page title; `back` / `forward` / `refresh` / `stop`
 * (digital) act on a rising edge. A browser hides other sites' pages from
 * the preview, so the title, and back / forward through links followed
 * inside the page, work for same-origin pages only; back / forward through
 * the URLs the GUI loaded always work.
 */
export function renderWeb(
    node: CFNode,
    container: Container,
    renderer: CFRenderer
) {
    const a = node.attributes;
    const join = (name: string) => (a[name] && a[name] !== '0' ? a[name] : null);
    const urlJoin = node.j && node.j !== '0' ? node.j : null;
    const titleJoin = join('title');
    const scope = renderer.currentScope ?? undefined;

    const frame = document.createElement('iframe');
    frame.title = 'web view';
    frame.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write');
    frame.setAttribute('allowfullscreen', '');
    // a page without a background of its own shows on white, as in a browser
    Object.assign(frame.style, { border: '0', background: '#fff', colorScheme: 'normal' });

    // the URLs loaded, for back / forward
    const history: string[] = [];
    let at = -1;
    let current = '';

    const open = (url: string) => {
        current = url;
        frame.src = url ? renderer.resolveUrl(url) : 'about:blank';
    };
    const go = (url: string) => {
        if (!url || url === current) return;
        history.splice(at + 1);
        history.push(url);
        at = history.length - 1;
        open(url);
    };

    frame.addEventListener('load', () => {
        // same-origin pages only: their own URL (links followed) and title
        try {
            const doc = frame.contentDocument;
            const href = frame.contentWindow?.location.href;
            if (href && href !== 'about:blank' && href !== renderer.resolveUrl(current) && history[at] !== href) {
                history.splice(at + 1);
                history.push(href);
                at = history.length - 1;
                current = href;
            }
            if (titleJoin && doc) joinStore.set(titleJoin, 's', doc.title || '');
        } catch {
            // another site's page: nothing to read
        }
    });

    const initial = urlJoin && joinStore.has(urlJoin, 's') ? String(joinStore.get(urlJoin, 's')) : (a.url || '');
    go(initial);
    if (urlJoin) {
        joinStore.on(urlJoin, 's', (val) => {
            if (container.destroyed) return;
            go(String(val ?? ''));
        }, scope);
    }

    const onRise = (name: string, act: () => void) => {
        const j = join(name);
        if (!j) return;
        let last = !!joinStore.get(j, 'd');
        joinStore.on(j, 'd', (val) => {
            const on = !!val;
            if (on && !last && !container.destroyed) act();
            last = on;
        }, scope);
    };
    onRise('back', () => {
        if (at > 0) open(history[--at]);
    });
    onRise('forward', () => {
        if (at < history.length - 1) open(history[++at]);
    });
    onRise('refresh', () => {
        try {
            frame.contentWindow?.location.reload();
        } catch {
            open(current);
        }
    });
    onRise('stop', () => {
        try {
            frame.contentWindow?.stop();
        } catch {
            // another site's page can't be stopped from here
        }
    });

    DomLayer.for(renderer).add({ el: frame, container, w: node.w, h: node.h });
}

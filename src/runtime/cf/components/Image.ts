import { Container, Sprite, Texture, ImageSource, Graphics } from 'pixi.js';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';
import { getHost } from '../../stdlib/host';
import { isShown } from '../shown';

/** How an image gets a URL's picture: its bytes, then a texture of them (tests give their own). */
export interface ImageIo {
    /** the bytes at a URL; fresh: past any cache on the way (a camera's next snapshot) */
    download(url: string, fresh: boolean): Promise<Blob>;
    decode(blob: Blob): Promise<Texture>;
}

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** the bytes of URL images downloaded with caching allowed, by URL: the least lately used go past KEEP_BYTES */
const kept = new Map<string, Blob>();
let keptBytes = 0;
const KEEP_BYTES = 32 * 1024 * 1024;

/** URL images kept (GUI Designer's Allow Caching): shown again from here, not downloaded again */
export const imageCache = {
    get(url: string): Blob | undefined {
        const blob = kept.get(url);
        if (blob) {
            kept.delete(url);
            kept.set(url, blob);
        }
        return blob;
    },
    set(url: string, blob: Blob) {
        const had = kept.get(url);
        if (had) {
            kept.delete(url);
            keptBytes -= had.size;
        }
        if (blob.size > KEEP_BYTES / 4) return;
        kept.set(url, blob);
        keptBytes += blob.size;
        for (const [u, b] of kept) {
            if (keptBytes <= KEEP_BYTES) break;
            kept.delete(u);
            keptBytes -= b.size;
        }
    },
    clear() {
        kept.clear();
        keptBytes = 0;
    },
};

const contentType = (headers: Record<string, string> = {}) =>
    Object.entries(headers).find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';

/** The bytes from the host's HTTP (no CORS, self-signed certificates do), else the web view's fetch. */
async function download(url: string, fresh: boolean): Promise<Blob> {
    const mode = (globalThis as any).CF?.imageRequestMode || 'custom';
    if (getHost()?.http && mode === 'custom') {
        const http = (await import('../../stdlib/http')).default;
        return new Promise<Blob>((resolve, reject) => {
            const headers: Record<string, string> = fresh ? { 'Cache-Control': 'no-cache', Pragma: 'no-cache' } : {};
            const req = http.get({ url, headers }, (res: any) => {
                const status = res.statusCode || 200;
                if (status < 200 || status >= 300) return reject(new Error(`HTTP ${status}`));
                const chunks: Uint8Array[] = [];
                res.on('data', (chunk: Uint8Array) => chunks.push(chunk));
                res.on('end', () => resolve(new Blob(chunks as BlobPart[], { type: contentType(res.headers) })));
            });
            req.on('error', reject);
        });
    }
    const res = await fetch(url, { cache: fresh ? 'no-store' : 'default' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
}

/** A picture as an <img> (what createImageBitmap can't read: an SVG) */
const imageElement = (blob: Blob) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const src = URL.createObjectURL(blob);
        const img = new window.Image();
        img.onload = () => {
            URL.revokeObjectURL(src);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(src);
            reject(new Error('not an image'));
        };
        img.src = src;
    });

async function decode(blob: Blob): Promise<Texture> {
    const resource = await createImageBitmap(blob).catch(() => imageElement(blob));
    return new Texture({ source: new ImageSource({ resource }) });
}

const io: ImageIo = { download, decode };

/** A URL's texture done with: off the GPU, its bitmap closed */
function drop(t: Texture) {
    const res = t.source?.resource as { close?: () => void } | undefined;
    t.destroy(true);
    res?.close?.();
}

/** an activity indicator: 12 spokes, the bright one going round */
function spinner(w: number, h: number): Graphics {
    const r = Math.max(10, Math.min(22, Math.min(w || 44, h || 44) * 0.18));
    const g = new Graphics();
    g.roundRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2, r * 0.6).fill({ color: 0x000000, alpha: 0.35 });
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const [s, c] = [Math.sin(a), Math.cos(a)];
        g.moveTo(s * r * 0.5, -c * r * 0.5)
            .lineTo(s * r, -c * r)
            .stroke({ width: Math.max(2, r * 0.18), color: 0xffffff, alpha: 0.25 + (0.75 * i) / 11, cap: 'round' });
    }
    g.position.set((w || 0) / 2, (h || 0) / 2);
    g.eventMode = 'none';
    return g;
}

/**
 * An image: a file of the GUI's, or a URL's picture - its content, or what
 * its serial join says (a URL, a file's name; empty: none). As GUI Designer
 * sets it up: <img j="1" refresh="500" noCache="1" downloadIndicator="1"
 * clearOnURLChange="0">
 * - refresh: a URL's picture loaded again every that many ms while it shows
 *   (a camera's snapshots), past any cache
 * - noCache: Allow Caching off, every load a download (else a URL's picture
 *   is kept, and shown again from there)
 * - downloadIndicator: a spinner while a URL not shown yet comes
 * - clearOnURLChange: a new URL clears the picture at once (else the one
 *   there stays till the new one's in)
 */
export function renderImage(node: CFNode, container: Container, renderer: CFRenderer, how: ImageIo = io) {
    const a = node.attributes ?? {};
    const refresh = Math.max(0, Number(a.refresh) || 0);
    const noCache = a.noCache === '1';
    const indicator = a.downloadIndicator === '1';
    const clearOnChange = a.clearOnURLChange === '1';
    const imgJoin = (node.j && node.j !== "0") ? node.j : null;
    // clickthrough: touches go to what's under it (unless it has gestures of its own)
    const through = node.attributes?.clickthrough === '1' && !node.children?.some((c) => c.type === 'gesture');
    if (through) container.hitArea = null;

    let sprite: Sprite | null = null;
    /** the texture shown when it's a URL's (ours to drop once off) */
    let owned: Texture | null = null;
    /** what it shows, or is to: a URL or a file's name */
    let source: string | null = null;
    /** the picture shown is the one of `source` (not of a URL before) */
    let current = false;
    /** the latest load: an older one's picture doesn't show */
    let loading = 0;
    let next: ReturnType<typeof setTimeout> | undefined;
    let spin: Graphics | null = null;
    const turn = () => {
        if (spin) spin.rotation = (Math.floor(performance.now() / 80) % 12) * (Math.PI / 6);
    };
    const spinning = (on: boolean) => {
        if (on && !spin && !container.destroyed) {
            spin = container.addChild(spinner(node.w, node.h));
            renderer.app?.ticker?.add(turn);
        } else if (!on && spin) {
            renderer.app?.ticker?.remove(turn);
            spin.destroy();
            spin = null;
        }
    };

    const show = (texture: Texture | null, own: boolean) => {
        const before = owned;
        owned = own ? texture : null;
        if (texture) {
            if (!sprite) {
                sprite = new Sprite(texture);
                if (through) sprite.eventMode = 'none';
                container.addChildAt(sprite, 0); // behind debug
            } else sprite.texture = texture;
            // its size, whatever the picture's
            if (node.w) sprite.width = node.w;
            if (node.h) sprite.height = node.h;
            sprite.visible = true;
        } else if (sprite) sprite.visible = false;
        if (before && before !== texture) drop(before);
    };

    const load = (url: string, fresh: boolean) => {
        clearTimeout(next);
        const n = ++loading;
        const keptBlob = fresh || noCache ? undefined : imageCache.get(url);
        if (indicator && !current) spinning(true);
        (keptBlob ? Promise.resolve(keptBlob) : how.download(url, fresh || noCache))
            .then(async (blob) => {
                if (!noCache) imageCache.set(url, blob);
                const t = await how.decode(blob);
                if (n !== loading || container.destroyed) return drop(t);
                show(t, true);
                current = true;
            })
            .catch((e) => {
                if (n === loading && !container.destroyed) console.warn('[cf image]', url, e?.message ?? e);
            })
            .finally(() => {
                if (n !== loading || container.destroyed) return;
                spinning(false);
                if (refresh > 0) next = setTimeout(again, refresh);
            });
    };
    /** the next snapshot: while it shows (and the GUI's awake), else a look again later */
    const again = () => {
        if (container.destroyed || source === null) return;
        if (isShown(container, renderer) && !renderer.cfApi?.suspended) load(source, true);
        else next = setTimeout(again, refresh);
    };

    const set = (value: string) => {
        if (value === source) return;
        source = value;
        current = false;
        if (!isUrl(value)) {
            const file = value ? renderer.texture(value) : undefined;
            // a file of the GUI's, or none: no load under way any more
            const n = ++loading;
            clearTimeout(next);
            spinning(false);
            if (file) show(file, false);
            else if (!value) show(null, false);
            else {
                // a file of the GUI's not loaded yet (images load as they're shown): shown once it's in
                const alias = renderer.aliasOf(value);
                if (alias) {
                    void renderer.ensureLoaded([alias]).then(() => {
                        const t = renderer.texture(value);
                        if (n !== loading || source !== value || container.destroyed || !t) return;
                        show(t, false);
                        current = true;
                    });
                } else console.warn('[cf image] no image', value);
            }
            current = !!file || !value;
            return;
        }
        if (clearOnChange) show(null, false);
        load(value, false);
    };

    container.on('destroyed', () => {
        ++loading;
        clearTimeout(next);
        spinning(false);
        if (owned) drop(owned);
        owned = null;
    });

    const initVal = (imgJoin && joinStore.has(imgJoin, "s")) ? joinStore.get(imgJoin, "s") : node.content;
    if (typeof initVal === 'string') set(initVal);

    if (imgJoin) {
        joinStore.on(imgJoin, "s", (val) => {
            if (container.destroyed) return;
            if (typeof val === 'string') set(val);
        }, renderer.currentScope ?? undefined);
    }
}

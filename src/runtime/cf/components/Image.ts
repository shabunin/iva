import { Container, Sprite, Assets } from 'pixi.js';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';
import { getHost } from '../../stdlib/host';

export function renderImage(
    node: CFNode,
    container: Container,
    renderer: CFRenderer
) {
    let bgSprite: Sprite | null = null;
    const imgJoin = (node.j && node.j !== "0") ? node.j : null;
    // clickthrough: touches go to what's under it (unless it has gestures of its own)
    const through = node.attributes?.clickthrough === '1' && !node.children?.some((c) => c.type === 'gesture');
    if (through) container.hitArea = null;
    const passOn = (sprite: Sprite) => {
        if (through) sprite.eventMode = 'none';
    };

    const setSpriteDims = (sprite: Sprite) => {
        if (node.w) sprite.width = node.w;
        if (node.h) sprite.height = node.h;
    };

    const tryLoadImg = (url: string) => {
        if (!url) return;
        // as the .gui names it (a path in its image folder), else by file name
        const assetLoaded = renderer.texture(url);

        if (assetLoaded) {
            if (bgSprite) bgSprite.texture = assetLoaded;
            else {
                bgSprite = new Sprite(assetLoaded);
                passOn(bgSprite);
                setSpriteDims(bgSprite);
                container.addChildAt(bgSprite, 0); // Put behind debug
            }
        } else {
            if (url.startsWith("http://") || url.startsWith("https://")) {
                let loadUrl = url;

                const doLoad = async () => {
                    let blobUrl = loadUrl;
                    const mode = (window as any).CF?.imageRequestMode || 'custom';
                    if (getHost()?.http && mode === 'custom') {
                        try {
                            const http = (await import('../../stdlib/http')).default;
                            const result = await new Promise<{ body: Uint8Array, contentType: string }>((resolve, reject) => {
                                const req = http.get(loadUrl, (res) => {
                                    const statusCode = (res as any).statusCode || 200;
                                    if (statusCode < 200 || statusCode >= 300) {
                                        reject(new Error(`HTTP ${statusCode}`));
                                        return;
                                    }
                                    const chunks: Uint8Array[] = [];
                                    res.on('data', (chunk: Uint8Array) => {
                                        chunks.push(chunk);
                                    });
                                    res.on('end', () => {
                                        const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
                                        const fullBody = new Uint8Array(totalLen);
                                        let offset = 0;
                                        for (const c of chunks) {
                                            fullBody.set(c, offset);
                                            offset += c.length;
                                        }
                                        let contentType = 'image/jpeg';
                                        for (const [k, v] of Object.entries(res.headers as Record<string, string>)) {
                                            if (k.toLowerCase() === 'content-type') {
                                                contentType = String(v);
                                                break;
                                            }
                                        }
                                        resolve({ body: fullBody, contentType });
                                    });
                                });
                                req.on('error', (err: Error) => reject(err));
                            });

                            const blob = new Blob([result.body], { type: result.contentType });
                            blobUrl = await new Promise<string>((resolve) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result as string);
                                reader.readAsDataURL(blob);
                            });
                        } catch (e) {
                            console.error("Custom http get failed for", loadUrl, e);
                        }
                    }

                    if (container.destroyed) return;
                    try {
                        Assets.add({ alias: loadUrl, src: blobUrl, parser: 'loadTextures' });
                    } catch {
                        // added before (the same URL again)
                    }

                    try {
                        const t = await Assets.load(loadUrl);
                        if (container.destroyed) return;
                        if (!t) throw new Error(`Assets.load resolved with no texture for ${loadUrl}`);

                        if (bgSprite) {
                            bgSprite.texture = t;
                        } else {
                            bgSprite = new Sprite(t);
                            passOn(bgSprite);
                            setSpriteDims(bgSprite);
                            container.addChildAt(bgSprite, 0);
                        }
                    } catch (e) {
                        console.warn("Failed to load image", loadUrl, e);
                    }
                };

                doLoad();
            }
        }
    };

    const initVal = (imgJoin && joinStore.has(imgJoin, "s")) ? joinStore.get(imgJoin, "s") : node.content;
    if (typeof initVal === 'string') tryLoadImg(initVal);

    if (imgJoin) {
        joinStore.on(imgJoin, "s", (val) => {
            if (container.destroyed) return;
            if (typeof val === 'string') tryLoadImg(val);
        }, renderer.currentScope ?? undefined);
    }
}

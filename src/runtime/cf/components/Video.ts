import { Container, Sprite, Texture, Graphics } from 'pixi.js';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';

export function renderVideo(
    node: CFNode,
    container: Container,
    renderer: CFRenderer
) {
    const videoJoin = (node.j && node.j !== "0") ? node.j : null;
    let videoSprite: Sprite | null = null;
    
    // Draw placeholder
    const placeholder = new Graphics().rect(0, 0, node.w, node.h).fill({ color: 0x000000, alpha: 0.8 });
    container.addChild(placeholder);

    const tryLoadVideo = (url: string) => {
        if (!url) return;
        // Basic Video loading in Pixi
        try {
            const texture = Texture.from(url);
            if (videoSprite) {
                videoSprite.texture = texture;
            } else {
                videoSprite = new Sprite(texture);
                videoSprite.width = node.w;
                videoSprite.height = node.h;
                container.addChild(videoSprite);
            }
        } catch (e) {
            console.warn("Failed to load video", url, e);
        }
    };

    const initVal = (videoJoin && joinStore.has(videoJoin, "s")) ? joinStore.get(videoJoin, "s") : node.content;
    if (typeof initVal === 'string') tryLoadVideo(initVal);
    
    if (videoJoin) {
        joinStore.on(videoJoin, "s", (val) => {
            if (container.destroyed) return;
            if (typeof val === 'string') tryLoadVideo(val);
        });
    }
}

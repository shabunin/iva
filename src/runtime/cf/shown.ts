import type { Container } from 'pixi.js';
import type { CFRenderer } from './renderer';

/**
 * Whether an element is on screen: on the page shown (not one fading out
 * after a flip) and nothing between hidden (a hidden subpage: its content off).
 */
export function isShown(c: Container, renderer: CFRenderer): boolean {
    let p: Container | null = c;
    for (; p && p.parent !== renderer.app.stage; p = p.parent) {
        if (!p.visible) return false;
    }
    return !!p && p.visible && p === renderer.currentContainer;
}

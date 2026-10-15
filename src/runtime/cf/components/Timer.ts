import { Container } from 'pixi.js';
import { CFNode } from '../parser';
import { CFRenderer } from '../renderer';
import { joinStore } from '../joinStore';
import { TimerClock } from '../timerClock';

/**
 * A page's or subpage's timer: <timer j="3800" interval="5000" repeatCount="0">
 * <command>getState</command></timer> - its command (or macro) every interval
 * while its page / subpage shows (see TimerClock). The interval is in its
 * analog join too: a value a script or a system sets there wins.
 */
export function renderTimer(node: CFNode, container: Container, renderer: CFRenderer) {
    const fixed = Number(node.attributes.interval) || 0;
    const clock = new TimerClock(Number(node.attributes.repeatCount) || 0);
    const join = node.j && node.j !== '0' ? node.j : null;
    const actions = node.children.filter((c) => (c.type === 'command' || c.type === 'macro') && c.text?.trim());

    const interval = () => {
        const v = join && joinStore.has(join, 'a') ? Number(joinStore.get(join, 'a')) : 0;
        return v > 0 ? v : fixed;
    };
    /**
     * Its page is the page shown (not one fading out after a flip) and
     * nothing between hidden (a hidden subpage: its content off).
     */
    const shown = () => {
        let p: Container | null = container;
        for (; p && p.parent !== renderer.app.stage; p = p.parent) {
            if (!p.visible) return false;
        }
        return !!p && p.visible && p === renderer.currentContainer;
    };
    const run = () => {
        for (const a of actions) {
            const name = a.text!.trim();
            try {
                if (a.type === 'macro') renderer.cfApi?.runMacro(name);
                else renderer.cfApi?.runCommand('', name);
            } catch (e) {
                console.error(`[cf timer] ${a.type} ${name}:`, e);
            }
        }
    };

    const tick = setInterval(() => {
        // its page gone (flipped away from, a new GUI)
        if (container.destroyed) {
            clearInterval(tick);
            return;
        }
        // asleep (the app in the background): as not shown - it starts over on waking
        if (clock.tick(performance.now(), shown() && !renderer.cfApi?.suspended, interval())) run();
    }, 50);
}

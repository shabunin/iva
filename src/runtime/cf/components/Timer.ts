import { Container } from 'pixi.js';
import { CFNode } from '../parser';
import { CFRenderer } from '../renderer';
import { joinStore } from '../joinStore';
import { TimerClock } from '../timerClock';
import { isShown } from '../shown';

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
        if (clock.tick(performance.now(), isShown(container, renderer) && !renderer.cfApi?.suspended, interval())) run();
    }, 50);
}

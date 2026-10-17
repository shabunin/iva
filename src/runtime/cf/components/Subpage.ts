import { Container } from 'pixi.js';
import { CFNode } from '../parser';
import { CFRenderer, animateFrom, killTweensOf, trackAnimation, animates, transitionEase, transitionSide, type Transition } from '../renderer';
import { joinStore } from '../joinStore';

export function renderSubpage(
    node: CFNode,
    container: Container,
    renderer: CFRenderer
) {
    const subName = node.name;
    if (subName && renderer.project.subpages[subName]) {
        const def = renderer.project.subpages[subName];
        // at the placement's size where it has one (CF.setProperties w / h), else the definition's
        const sized = node.w || node.h ? { ...def, w: node.w || def.w, h: node.h || def.h } : def;
        const subCont = renderer.createSubpage(sized, undefined, undefined, node.j && node.j !== '0' ? cfJoin('d', node.j) : undefined);
        container.addChild(subCont);

        const a = node.attributes;
        // shown in transition1, hidden in transition2 (a gesture action's own wins)
        const showing: Transition = { type: a.transition1, subtype: a.subtype1, time: parseFloat(a.time1 || '0') || 0, ease: a.ease1 };
        const hiding: Transition = { type: a.transition2, subtype: a.subtype2, time: parseFloat(a.time2 || '0') || 0, ease: a.ease2 };

        /** where it's going: shown or hidden (hiding, it's still visible till its transition ends) */
        let shown = false;
        /** the latest change: an older hide's end doesn't hide it once shown again */
        let change = 0;

        const animateSubpage = (isVisible: boolean, instant: boolean = false) => {
            // already going that way: as it is
            if (!instant && isVisible === shown) return;
            const n = ++change;
            killTweensOf(subCont);
            killTweensOf(subCont.scale);
            shown = isVisible;
            const t = renderer.transitionOverride ?? (isVisible ? showing : hiding);

            if (instant || !animates(t)) {
                subCont.visible = isVisible;
                subCont.alpha = 1;
                subCont.x = 0;
                subCont.y = 0;
                subCont.scale.set(1);
                return;
            }
            subCont.visible = true;
            applyTransition(subCont, isVisible, t, renderer).then(() => {
                if (!isVisible && change === n) subCont.visible = false;
            });
        };

        const dJoin = node.j;
        if (dJoin && dJoin !== "0") {
            const initialVal = !!joinStore.get(dJoin, "d");
            animateSubpage(initialVal, true);
            
            // in the page's scope (a list row's): gone with it, not kept past every flip
            joinStore.on(dJoin, "d", (val) => {
                if (container.destroyed) return;
                animateSubpage(!!val, false);
            }, renderer.currentScope ?? undefined);
        } else {
            const initialVal = node.v !== "0";
            animateSubpage(initialVal, true);
        }
    }
}

/** a join as scripts see it: 'd5', or in a list item 'l10:3:d5' */
function cfJoin(type: string, j: string): string {
    const parts = j.split(':');
    const own = parts.pop()!;
    return [...parts, `${type}${own}`].join(':');
}

/**
 * A subpage coming or going (isEntry) in a transition: fade; moveIn, push,
 * reveal - in from just outside the panel's edge on the subtype's side, and
 * out the same way (as GUI Designer's pairs have it: moveIn fromLeft both
 * ways, easeOut in and easeIn out); scale.
 */
function applyTransition(target: Container, isEntry: boolean, t: Transition, renderer: CFRenderer): Promise<void> {
    return new Promise((resolve) => {
        const ease = transitionEase(t.ease);
        const time = t.time ?? 0;
        const transition = (t.type ?? '').toLowerCase();

        target.alpha = 1;
        target.x = 0;
        target.y = 0;
        target.scale.set(1);
        
        let fromProps: any = {};
        let toProps: any = {};

        if (transition === "movein" || transition === "reveal" || transition === "push") {
            // from just outside the panel's edge, as on a device (where the subpage sits on the panel)
            const parent = target.parent;
            const at = parent ? parent.toGlobal({ x: 0, y: 0 }) : { x: 0, y: 0 };
            const scale = parent ? parent.worldTransform.a || 1 : 1;
            const W = renderer.app.screen.width / scale;
            const H = renderer.app.screen.height / scale;
            const left = at.x / scale;
            const top = at.y / scale;
            const w = target.width || 0;
            const h = target.height || 0;
            const side = transitionSide(t.subtype);
            const dx = side.x < 0 ? -(left + w) : side.x > 0 ? W - left : 0;
            const dy = side.y < 0 ? -(top + h) : side.y > 0 ? H - top : 0;
            
            if (isEntry) {
                fromProps = { x: dx, y: dy };
                toProps = { x: 0, y: 0 };
            } else {
                fromProps = { x: 0, y: 0 };
                toProps = { x: dx, y: dy };
            }
        } else if (transition === "scale") {
            if (isEntry) {
                fromProps = { scaleX: 0.01, scaleY: 0.01 };
                toProps = { scaleX: 1, scaleY: 1 };
            } else {
                fromProps = { scaleX: 1, scaleY: 1 };
                toProps = { scaleX: 0.01, scaleY: 0.01 };
            }
        } else {
            // fade (and what else a .gui may name)
            if (isEntry) {
                fromProps = { alpha: 0 };
                toProps = { alpha: 1 };
            } else {
                fromProps = { alpha: 1 };
                toProps = { alpha: 0 };
            }
        }

        if (fromProps.x !== undefined) target.x = fromProps.x;
        if (fromProps.y !== undefined) target.y = fromProps.y;
        if (fromProps.alpha !== undefined) target.alpha = fromProps.alpha;
        if (fromProps.scaleX !== undefined) {
            target.scale.set(fromProps.scaleX, fromProps.scaleY);
        }

        const props: Record<string, number> = {};
        if (toProps.x !== undefined) props.x = toProps.x;
        if (toProps.y !== undefined) props.y = toProps.y;
        if (toProps.alpha !== undefined) props.alpha = toProps.alpha;

        if (Object.keys(props).length > 0) {
            trackAnimation(target, animateFrom(target, props, { duration: time, ease }));
        }
        if (toProps.scaleX !== undefined) {
            trackAnimation(target.scale, animateFrom(target.scale, { x: toProps.scaleX, y: toProps.scaleY }, { duration: time, ease }, target));
        }

        // "scale"-only transitions leave `props` empty — resolve on a plain
        // timer instead of an animation's onComplete so this promise still
        // settles after `time` seconds either way.
        setTimeout(resolve, time * 1000);
    });
}

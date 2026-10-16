import { Container, Rectangle, Point, type FederatedPointerEvent } from 'pixi.js';
import { CFNode } from '../parser';
import type { CFRenderer, Transition } from '../renderer';
import { TokenEngine } from '../tokenEngine';

/**
 * Gestures on a page, a subpage or an image, as CommandFusion's wiki and
 * scripting docs describe them. Instant ones - tap (taps, touches), press
 * (fires on touch-down), swipe (direction, touches; fires once detected) -
 * have no change phase: their end actions run right after their begin
 * ones. Continuous ones - pan, pinch, rotate (two fingers) - begin once the
 * fingers have moved enough, change as they move, end when they lift.
 */

/** what a gesture's code gets as `gesture`, and its actions' values as [tokens] */
export interface GestureInfo {
    type: string;
    x: number;
    y: number;
    startx: number;
    starty: number;
    deltax: number;
    deltay: number;
    direction?: string;
    /** pan: points/s; pinch: scale/s; rotate: radians/s */
    velocity?: number;
    velocityx?: number;
    velocityy?: number;
    /** pinch: the fingers' distance over what it was at the start */
    scale?: number;
    /** pinch: between the fingers now */
    distance?: number;
    /** rotate: radians turned since it began */
    rotation?: number;
}

export type GestureType = 'tap' | 'press' | 'swipe' | 'pan' | 'pinch' | 'rotate';
export interface GestureDef {
    type: GestureType;
    taps: number;
    touches: number;
    direction?: string;
    node: CFNode;
}
export type GesturePhase = 'begin' | 'change' | 'end';

/** a tap moves less than this (the GUI's units) */
const TAP_SLOP = 10;
/** and lasts at most this long (ms) */
const TAP_TIME = 600;
/** the taps of a double tap: this soon after the one before, this near it */
const TAPS_GAP = 350;
const TAPS_REACH = 40;
/** a swipe goes this far, this soon after the touch-down */
const SWIPE_DISTANCE = 40;
const SWIPE_TIME = 600;
/** a pan begins once the fingers have moved this far */
const PAN_SLOP = 10;
/** a pinch once their distance changed this much; a rotate once they turned this far (radians) */
const PINCH_SLOP = 8;
const ROTATE_SLOP = 0.08;

export function gestureDef(node: CFNode): GestureDef {
    const a = node.attributes ?? {};
    const type = (a.type || 'tap').toLowerCase();
    return {
        type: (['tap', 'press', 'swipe', 'pan', 'pinch', 'rotate'].includes(type) ? type : 'tap') as GestureType,
        taps: Math.max(1, parseInt(a.taps || '1', 10) || 1),
        touches: Math.max(1, parseInt(a.touches || '1', 10) || 1),
        direction: a.direction?.toLowerCase() || undefined,
        node,
    };
}

const centroid = (ps: { x: number; y: number }[]) => ({
    x: ps.reduce((s, p) => s + p.x, 0) / (ps.length || 1),
    y: ps.reduce((s, p) => s + p.y, 0) / (ps.length || 1),
});

/** the turn from angle a to b, the short way round */
const turn = (a: number, b: number) => {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
};

/** Gestures from touches: pointers down, moving, up (in the object's own coordinates, ms) - and the actions they fire. */
export class GestureRecognizer {
    private pointers = new Map<number, { sx: number; sy: number; x: number; y: number }>();
    /** a touch: the first finger down to the last up */
    private touch: { t0: number; most: number; moved: boolean; swiped: boolean; sx: number; sy: number } | null = null;
    private taps = { count: 0, end: -Infinity, x: 0, y: 0, touches: 0 };
    private pan: { on: boolean; sx: number; sy: number; cx: number; cy: number; n: number; lt: number; vx: number; vy: number } | null = null;
    private two: {
        ids: [number, number]; d0: number; a0: number; sx: number; sy: number; lt: number;
        pinching: boolean; scale: number; vs: number;
        turning: boolean; turned: number; angle: number; vr: number;
    } | null = null;

    constructor(
        private readonly gestures: GestureDef[],
        private readonly fire: (g: GestureDef, phase: GesturePhase, info: GestureInfo) => void,
    ) {}

    private all(type: GestureType, info: GestureInfo, phases: GesturePhase[], match: (g: GestureDef) => boolean = () => true) {
        for (const g of this.gestures) {
            if (g.type !== type || !match(g)) continue;
            for (const phase of phases) this.fire(g, phase, info);
        }
    }

    private info(type: string, x: number, y: number, sx: number, sy: number, extra: Partial<GestureInfo> = {}): GestureInfo {
        return { type, x, y, startx: sx, starty: sy, deltax: x - sx, deltay: y - sy, ...extra };
    }

    down(id: number, x: number, y: number, t: number) {
        if (!this.pointers.size) this.touch = { t0: t, most: 0, moved: false, swiped: false, sx: x, sy: y };
        this.pointers.set(id, { sx: x, sy: y, x, y });
        const n = this.pointers.size;
        const touch = this.touch!;
        touch.most = Math.max(touch.most, n);
        const c = centroid([...this.pointers.values()]);
        touch.sx = c.x;
        touch.sy = c.y;
        // press: as soon as it's pressed (with that many fingers)
        this.all('press', this.info('press', c.x, c.y, c.x, c.y), ['begin', 'end'], (g) => g.touches === n);
        this.regroup(t);
    }

    move(id: number, x: number, y: number, t: number) {
        const p = this.pointers.get(id);
        if (!p || !this.touch) return;
        p.x = x;
        p.y = y;
        if (Math.hypot(x - p.sx, y - p.sy) > TAP_SLOP) this.touch.moved = true;
        // a pan begins before a swipe the same move makes (its handler knows a drag goes on)
        this.panMove(t);
        this.swipe(t);
        this.twoMove(t);
    }

    up(id: number, x: number, y: number, t: number) {
        const p = this.pointers.get(id);
        if (!p || !this.touch) return;
        p.x = x;
        p.y = y;
        if (Math.hypot(x - p.sx, y - p.sy) > TAP_SLOP) this.touch.moved = true;
        this.swipe(t);
        this.pointers.delete(id);
        this.regroup(t);
        if (this.pointers.size) return;
        const touch = this.touch;
        this.touch = null;
        if (touch.moved || t - touch.t0 > TAP_TIME) {
            this.taps.count = 0;
            return;
        }
        // a tap: the next of a double / triple one if soon and near enough
        const taps = this.taps;
        const again = touch.t0 - taps.end <= TAPS_GAP && Math.hypot(touch.sx - taps.x, touch.sy - taps.y) <= TAPS_REACH && taps.touches === touch.most;
        taps.count = again ? taps.count + 1 : 1;
        taps.end = t;
        taps.x = touch.sx;
        taps.y = touch.sy;
        taps.touches = touch.most;
        const info = this.info('tap', touch.sx, touch.sy, touch.sx, touch.sy);
        this.all('tap', info, ['begin', 'end'], (g) => g.touches === touch.most && taps.count % g.taps === 0);
    }

    /** a finger gone without a release (the system took it): what goes on ends, no tap */
    cancel(id: number, t: number) {
        if (!this.pointers.has(id) || !this.touch) return;
        this.touch.moved = true;
        this.pointers.delete(id);
        this.regroup(t);
        if (!this.pointers.size) this.touch = null;
    }

    /** swipe: far enough, mostly one way, soon enough - once a touch */
    private swipe(t: number) {
        const touch = this.touch!;
        if (touch.swiped || t - touch.t0 > SWIPE_TIME) return;
        const ps = [...this.pointers.values()];
        const now = centroid(ps);
        const from = centroid(ps.map((p) => ({ x: p.sx, y: p.sy })));
        const dx = now.x - from.x;
        const dy = now.y - from.y;
        const [ax, ay] = [Math.abs(dx), Math.abs(dy)];
        if (Math.max(ax, ay) < SWIPE_DISTANCE || Math.max(ax, ay) < 2 * Math.min(ax, ay)) return;
        touch.swiped = true;
        const direction = ax > ay ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
        const info = this.info('swipe', now.x, now.y, from.x, from.y, { direction });
        this.all('swipe', info, ['begin', 'end'], (g) => g.touches === ps.length && (!g.direction || g.direction === direction));
    }

    /** the fingers down changed: a pan carries on from where it was; two fingers start a pinch / rotate */
    private regroup(t: number) {
        const ps = [...this.pointers.values()];
        const n = ps.length;
        const pans = this.gestures.filter((g) => g.type === 'pan');
        const need = pans.length ? Math.min(...pans.map((g) => g.touches)) : Infinity;
        const pan = this.pan;
        if (pan && n < need) {
            if (pan.on) this.all('pan', this.panInfo(pan, pan.cx, pan.cy), ['end'], (g) => g.touches <= pan.n);
            this.pan = null;
        } else if (n >= need) {
            const c = centroid(ps);
            if (!pan) this.pan = { on: false, sx: c.x, sy: c.y, cx: c.x, cy: c.y, n, lt: t, vx: 0, vy: 0 };
            else {
                // its delta goes on smoothly: the centre jumped with a finger more or less
                pan.sx += c.x - pan.cx;
                pan.sy += c.y - pan.cy;
                pan.cx = c.x;
                pan.cy = c.y;
                pan.n = Math.max(pan.n, n);
            }
        }

        const two = this.two;
        if (two && !(this.pointers.has(two.ids[0]) && this.pointers.has(two.ids[1]))) {
            const c = this.twoCentre(two);
            if (two.pinching) this.all('pinch', this.twoInfo('pinch', two, c, { scale: two.scale, velocity: two.vs, distance: this.twoDistance(two) }), ['end']);
            if (two.turning) this.all('rotate', this.twoInfo('rotate', two, c, { rotation: two.turned, velocity: two.vr }), ['end']);
            this.two = null;
        }
        if (!this.two && n >= 2 && this.gestures.some((g) => g.type === 'pinch' || g.type === 'rotate')) {
            const ids = [...this.pointers.keys()].slice(0, 2) as [number, number];
            const [a, b] = ids.map((id) => this.pointers.get(id)!);
            const angle = Math.atan2(b.y - a.y, b.x - a.x);
            this.two = {
                ids, d0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), a0: angle, sx: (a.x + b.x) / 2, sy: (a.y + b.y) / 2, lt: t,
                pinching: false, scale: 1, vs: 0, turning: false, turned: 0, angle, vr: 0,
            };
        }
    }

    private panInfo(pan: NonNullable<GestureRecognizer['pan']>, x: number, y: number): GestureInfo {
        return this.info('pan', x, y, pan.sx, pan.sy, { velocity: Math.hypot(pan.vx, pan.vy), velocityx: pan.vx, velocityy: pan.vy });
    }

    private panMove(t: number) {
        const pan = this.pan;
        if (!pan) return;
        const c = centroid([...this.pointers.values()]);
        const dt = Math.max(1, t - pan.lt) / 1000;
        // points a second, smoothed
        pan.vx = 0.6 * pan.vx + 0.4 * ((c.x - pan.cx) / dt);
        pan.vy = 0.6 * pan.vy + 0.4 * ((c.y - pan.cy) / dt);
        pan.cx = c.x;
        pan.cy = c.y;
        pan.lt = t;
        const n = this.pointers.size;
        if (!pan.on) {
            if (Math.hypot(c.x - pan.sx, c.y - pan.sy) <= PAN_SLOP) return;
            pan.on = true;
            this.all('pan', this.panInfo(pan, c.x, c.y), ['begin'], (g) => g.touches <= n);
            return;
        }
        this.all('pan', this.panInfo(pan, c.x, c.y), ['change'], (g) => g.touches <= n);
    }

    private twoCentre(two: NonNullable<GestureRecognizer['two']>) {
        const [a, b] = two.ids.map((id) => this.pointers.get(id));
        return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: two.sx, y: two.sy };
    }

    private twoDistance(two: NonNullable<GestureRecognizer['two']>) {
        const [a, b] = two.ids.map((id) => this.pointers.get(id));
        return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : two.d0 * two.scale;
    }

    private twoInfo(type: string, two: NonNullable<GestureRecognizer['two']>, c: { x: number; y: number }, extra: Partial<GestureInfo>) {
        return this.info(type, c.x, c.y, two.sx, two.sy, extra);
    }

    private twoMove(t: number) {
        const two = this.two;
        if (!two) return;
        const [a, b] = two.ids.map((id) => this.pointers.get(id)!);
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const dt = Math.max(1, t - two.lt) / 1000;
        two.lt = t;
        const scale = d / two.d0;
        two.vs = 0.6 * two.vs + 0.4 * ((scale - two.scale) / dt);
        two.scale = scale;
        const step = turn(two.angle, angle);
        two.angle = angle;
        two.turned += step;
        two.vr = 0.6 * two.vr + 0.4 * (step / dt);
        const c = this.twoCentre(two);

        if (this.gestures.some((g) => g.type === 'pinch')) {
            const was = two.pinching;
            if (!was && Math.abs(d - two.d0) > PINCH_SLOP) two.pinching = true;
            if (two.pinching) this.all('pinch', this.twoInfo('pinch', two, c, { scale, velocity: two.vs, distance: d }), [was ? 'change' : 'begin']);
        }
        if (this.gestures.some((g) => g.type === 'rotate')) {
            const was = two.turning;
            if (!was && Math.abs(two.turned) > ROTATE_SLOP) two.turning = true;
            if (two.turning) this.all('rotate', this.twoInfo('rotate', two, c, { rotation: two.turned, velocity: two.vr }), [was ? 'change' : 'begin']);
        }
    }
}

/** the object the gestures are on: its join (as the GUI has it: 'd5', 'l10:3:s1') and the list item it's in */
export interface GestureContext {
    join?: string | null;
    list?: string | null;
    listIndex?: number | null;
    /**
     * a page's or subpage's: every touch on it, on what's on it too - a list,
     * a button - as a recognizer on iOS sees all touches in its view (the
     * list or button still gets it: buttons in lists let go of a press that
     * moves). An image's: only touches that reach it, and a drag on it is its
     * own (a dial in a list: the list doesn't scroll).
     */
    capture?: boolean;
}

/** a gesture's [tokens]: [x], [y], [startx] ... [scale], [rotation], [velocity] (numbers to 4 decimals at most) */
const gestureTokens = (info: GestureInfo) =>
    Object.fromEntries(Object.entries(info).filter(([k, v]) => k !== 'type' && v !== undefined)
        .map(([k, v]) => [k.toLowerCase(), typeof v === 'number' ? String(Number(v.toFixed(4))) : String(v)]));

/**
 * One action of a gesture, as GUI Designer has them: <action phase delay
 * flip command macro js j token target value transition subtype time ease>.
 * Its value (for its join and its token) takes the gesture's [tokens], other
 * tokens and {{math}}.
 */
export function runGestureAction(action: CFNode, info: GestureInfo, ctx: GestureContext, renderer?: CFRenderer) {
    const a = action.attributes ?? {};
    // Assign transition: for the page flip and the subpages shown / hidden as it runs
    const transition = a.transition && a.transition !== 'None'
        ? { type: a.transition, subtype: a.subtype, time: Number(a.time) || 0, ease: a.ease }
        : undefined;
    if (renderer) renderer.transitionOverride = transition;
    try {
        runAction(a, info, ctx, transition, renderer);
    } finally {
        if (renderer) renderer.transitionOverride = undefined;
    }
}

function runAction(a: Record<string, string>, info: GestureInfo, ctx: GestureContext, transition: Transition | undefined, renderer?: CFRenderer) {
    const cf: any = renderer?.cfApi ?? (globalThis as any).CF;
    const listItem = ctx.list && ctx.listIndex !== null && ctx.listIndex !== undefined ? `${ctx.list}:${ctx.listIndex}:` : '';
    const tokens = gestureTokens(info);
    const value = (raw: string) => {
        const own = raw.replace(/\[([A-Za-z]+)\]/g, (m, name: string) => tokens[name.toLowerCase()] ?? m);
        return cf ? TokenEngine.replaceTokens(own, cf, { list: ctx.list ?? undefined, index: ctx.listIndex ?? undefined }) : own;
    };

    // a token: on a join's (target) or the global ones
    if (a.token && cf?.setToken) {
        const target = (a.target || '').trim();
        const global = !target || target === '0' || /^(e0|global)$/i.test(target);
        cf.setToken(global ? cf.GlobalTokensJoin ?? 'e0' : listItem && !target.includes(':') ? listItem + target : target, a.token, value(a.value ?? ''));
    }
    // a join: in a list item, the item's
    if (a.j && a.j !== '0' && cf?.setJoin) {
        const j = /^[adsl]/i.test(a.j) ? a.j : 'd' + a.j;
        cf.setJoin(listItem && !j.includes(':') ? listItem + j : j, value(a.value ?? '1'));
    }
    if (a.command && a.command !== 'None' && cf?.runCommand) cf.runCommand('', a.command);
    if (a.macro && a.macro !== 'None' && cf?.runMacro) cf.runMacro(a.macro);
    if (a.js) {
        // iViewer's locals: gesture, join (the object's, its own part), tokens, list, listIndex
        const full = ctx.join ?? '';
        const join = full ? full.split(':').pop()! : null;
        try {
            new Function('gesture', 'join', 'tokens', 'list', 'listIndex', a.js).call(
                globalThis, info, join, (full && cf?.tokensStore?.[full]) || {}, ctx.list ?? null, ctx.list ? ctx.listIndex ?? null : null,
            );
        } catch (e) {
            console.error(`[gesture] ${info.type} ${a.phase ?? ''}:`, e);
        }
    }
    if (a.flip && a.flip !== 'None' && renderer) renderer.navigate(a.flip, undefined, false, transition);
}

/** the actions of a gesture for the phase, each after its delay */
function runActions(node: CFNode, phase: GesturePhase, info: GestureInfo, ctx: GestureContext, renderer?: CFRenderer) {
    for (const action of node.children ?? []) {
        if (action.type !== 'action' || (action.attributes?.phase || 'begin') !== phase) continue;
        const delay = Number(action.attributes?.delay) || 0;
        if (delay > 0) setTimeout(() => runGestureAction(action, info, ctx, renderer), delay);
        else runGestureAction(action, info, ctx, renderer);
    }
}

/**
 * Gestures on an object's container: each finger tracked from its touch on
 * it (or on what's on it - a button there still works) wherever it goes,
 * in the object's coordinates.
 */
export function bindGestures(container: Container, gestures: CFNode[], renderer?: CFRenderer, ctx: GestureContext = {}) {
    if (!gestures || gestures.length === 0) return;
    const defs = gestures.map(gestureDef);
    container.eventMode = 'static';
    if (!container.hitArea) ensureHitArea(container);

    const recognizer = new GestureRecognizer(defs, (g, phase, info) => runActions(g.node, phase, info, ctx, renderer));
    // a drag on it is its own (a dial, a knob): not a list's it's in, scrolling
    const drags = defs.some((g) => g.type === 'pan' || g.type === 'rotate' || g.type === 'pinch');
    const events = renderer?.app?.renderer?.events;
    const local = (clientX: number, clientY: number) => {
        const at = new Point();
        events!.mapPositionToPoint(at, clientX, clientY);
        return container.toLocal(at);
    };
    const tracked = new Set<number>();
    const onMove = (e: PointerEvent) => {
        if (!tracked.has(e.pointerId) || container.destroyed) return;
        const p = local(e.clientX, e.clientY);
        recognizer.move(e.pointerId, p.x, p.y, performance.now());
    };
    const onUp = (e: PointerEvent) => {
        if (!tracked.delete(e.pointerId) || container.destroyed) return;
        const p = local(e.clientX, e.clientY);
        if (e.type === 'pointercancel') recognizer.cancel(e.pointerId, performance.now());
        else recognizer.up(e.pointerId, p.x, p.y, performance.now());
        if (!tracked.size) listen(false);
    };
    const listen = (on: boolean) => {
        const method = on ? 'addEventListener' : 'removeEventListener';
        for (const type of ['pointermove', 'pointerup', 'pointercancel'] as const) {
            (globalThis as any)[method]?.(type, type === 'pointermove' ? onMove : onUp, true);
        }
    };

    container.on(ctx.capture ? 'pointerdowncapture' : 'pointerdown', (e: FederatedPointerEvent) => {
        if (drags && !ctx.capture) e.stopPropagation();
        const p = container.toLocal(e.global);
        if (!events) {
            // no DOM to follow it on: what Pixi tells this container
            recognizer.down(e.pointerId, p.x, p.y, performance.now());
            return;
        }
        if (!tracked.size) listen(true);
        tracked.add(e.pointerId);
        recognizer.down(e.pointerId, p.x, p.y, performance.now());
    });
    if (!events) {
        container.on('globalpointermove', (e: FederatedPointerEvent) => {
            const p = container.toLocal(e.global);
            recognizer.move(e.pointerId, p.x, p.y, performance.now());
        });
        const up = (e: FederatedPointerEvent) => {
            const p = container.toLocal(e.global);
            recognizer.up(e.pointerId, p.x, p.y, performance.now());
        };
        container.on('pointerup', up);
        container.on('pointerupoutside', up);
    }
    container.on('destroyed', () => {
        tracked.clear();
        listen(false);
    });
}

function ensureHitArea(container: Container) {
    // Prefer explicit size from layout (set by renderer via children bounds)
    try {
        const b = container.getLocalBounds();
        if (b.width > 0 && b.height > 0) {
            container.hitArea = new Rectangle(b.x, b.y, b.width, b.height);
        }
    } catch {
        /* ignore */
    }
}

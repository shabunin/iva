import { joinStore } from '../joinStore';
import { isJoinName } from '../guiIndex';
import { CFContext, CFCallback } from './types';

/** A join's value as iViewer hands it to scripts: always a string ("1" / "0" for a digital one); null when there's none. */
export function joinText(raw: unknown): string | null {
    if (raw === undefined || raw === null) return null;
    return typeof raw === "boolean" ? (raw ? "1" : "0") : String(raw);
}

/** what the CF object knows of the GUI (cf.ts): the joins it has, their tags */
interface GuiAware {
    GlobalTokensJoin?: string;
    hasJoin?(join: string): boolean;
    tagsOf?(join: string): string[];
    joinsTagged?(tag: string): string[];
    guiIndex?(): import('../guiIndex').GuiIndex | null;
}

/**
 * A join as getJoin / getJoins hand it (CommandFusion's docs): its value
 * always a string; the global tokens' join an empty one; a join the GUI
 * hasn't (or a list item it hasn't) a null value and null tokens.
 */
function joinInfo(ctx: CFContext, join: string): { value: string | null; tokens: Record<string, string> | null; tags: string[] } {
    const api = ctx as CFContext & GuiAware;
    if (join === api.GlobalTokensJoin) return { value: '', tokens: ctx.tokensStore[join] || {}, tags: [] };
    const parsed = ctx.parseJoin(join);
    if (!parsed || (api.hasJoin && !api.hasJoin(join))) return { value: null, tokens: null, tags: [] };
    return { value: joinText(joinStore.get(parsed.id, parsed.type)) ?? '', tokens: ctx.tokensStore[join] || {}, tags: api.tagsOf?.(join) ?? [] };
}

export function getJoin(
    ctx: CFContext,
    join: string,
    callback?: (join: string, value: string | null, tokens: any, tags: string[]) => void
) {
    const { value, tokens, tags } = joinInfo(ctx, join);
    if (callback) callback(join, value, tokens, tags);
    return value;
}

export function getJoins(
    ctx: CFContext,
    arrayOfJoins: string[],
    callback?: (arrayOfJoinValues: Record<string, { value: string | null; tokens: Record<string, string> | null; tags: string[] }>) => void
) {
    const result: Record<string, { value: string | null; tokens: Record<string, string> | null; tags: string[] }> = {};
    for (const j of arrayOfJoins) result[j] = joinInfo(ctx, j);
    if (callback) callback(result);
    return result;
}

import { TokenEngine } from '../tokenEngine';

export function setJoin(
    ctx: CFContext,
    join: string,
    value: string | number | boolean,
    sendJoinChangeEvent: boolean = true
) {
    const parsed = ctx.parseJoin(join);
    if (parsed) {
        let evaluatedValue = value;
        
        // iViewer supports token replacement and math expressions in setJoin values:
        // tokens ([@a1] -> "18"), then {{ }} (iViewer's math, mathExpr)
        if (typeof evaluatedValue === 'string') {
            evaluatedValue = TokenEngine.replaceTokens(evaluatedValue, ctx);
        }

        if (sendJoinChangeEvent) {
            // set() notifies globalListeners → onAny bridge in cf.ts → JoinChangeEvent (once)
            joinStore.set(parsed.id, parsed.type, evaluatedValue);
        } else {
            // setQuiet() fires per-join listeners (renderer UI updates) but skips
            // globalListeners → no JoinChangeEvent dispatched at all
            joinStore.setQuiet(parsed.id, parsed.type, evaluatedValue);
        }
    }
}

/**
 * A value the GUI writes for a join (a command's target / value, a
 * feedback's onmatch): a number for a digital or analog join, the text as
 * written for a serial one - "007" stays "007", "" stays "" (made a number,
 * they were "7" and "0").
 */
export function joinValue(ctx: CFContext, join: string, text: string): string | number {
    const type = ctx.parseJoin(join)?.type;
    if (type !== 'd' && type !== 'a') return text;
    const n = Number(text);
    return isNaN(n) ? text : n;
}

export function setJoins(
    ctx: CFContext,
    joinsArray: {
        join: string;
        value?: string | number | boolean | null;
        tokens?: Record<string, string | number | boolean> | null;
        /** the join's objects' properties (iViewer 4.0.6), as one of CF.setProperties' changes: { x, opacity, theme ... } */
        properties?: Record<string, unknown> | null;
    }[],
    sendJoinChangeEvents: boolean = true
) {
    joinsArray.forEach(item => {
        // no value, or null: the join is left as it is (its tokens may still be set)
        if (item.value !== undefined && item.value !== null) {
            setJoin(ctx, item.join, item.value, sendJoinChangeEvents);
        }
        if (item.tokens) {
            for (const [tokenName, tokenValue] of Object.entries(item.tokens)) {
                setToken(ctx, item.join, tokenName, String(tokenValue));
            }
        }
        // its objects' properties, at once (no animation), as CF.setProperties sets them
        if (item.properties && typeof item.properties === 'object' && !Array.isArray(item.properties)) {
            setProperties(ctx, { ...item.properties, join: item.join }, 0, 0, ctx.AnimationCurveLinear);
        }
    });
}

export function setToken(
    ctx: CFContext,
    join: string,
    token: string,
    value: string | number | boolean
) {
    if (!ctx.tokensStore[join]) {
        ctx.tokensStore[join] = {};
    }
    // "[name]" and "name" are one token (GUI Designer writes the brackets, scripts may not): the key already there
    const other = token.startsWith('[') && token.endsWith(']') ? token.slice(1, -1) : `[${token}]`;
    if (ctx.tokensStore[join][token] === undefined && ctx.tokensStore[join][other] !== undefined) token = other;
    // a string, gone through what a value does: join references ([@s1]), math ({{ }})
    value = TokenEngine.replaceTokens(String(value), ctx);
    ctx.tokensStore[join][token] = value;
    const api = ctx as any;
    if (join === api.GlobalTokensJoin && api.persistedTokens?.has(token)) {
        try {
            localStorage.setItem(api.tokenKey(token), String(value));
        } catch {
            // no storage: kept for this run only
        }
    }
    api.dispatchEvent("TokenChangedEvent", join, token, value);
}

export function getProperties(
    ctx: CFContext,
    joinOrJoinsArray: string | string[],
    callback: CFCallback
) {
    const isArray = Array.isArray(joinOrJoinsArray);
    const joins = isArray ? (joinOrJoinsArray as string[]) : [joinOrJoinsArray as string];
    const result = joins.map((j) => propertiesOf(ctx, j));

    if (callback) {
        callback(isArray ? result : result[0]);
    }
}

const PROPERTIES = ['x', 'y', 'w', 'h', 'xrotation', 'yrotation', 'zrotation', 'scale', 'opacity', 'theme'] as const;

/**
 * An element's properties as getProperties hands them (CommandFusion's
 * docs): join, x, y, w, h, the rotations, scale, opacity, theme - what it
 * hasn't null; no such element (or join 0): null. On screen: as it is now;
 * elsewhere in the GUI: as the GUI places it.
 */
function propertiesOf(ctx: CFContext, join: string): Record<string, unknown> | null {
    const api = ctx as CFContext & GuiAware;
    if (/^[adsl]0$/.test(join) || (api.hasJoin && !api.hasJoin(join))) return null;
    const stored = ctx.propertiesStore[join] as Record<string, unknown> | undefined;
    const index = api.guiIndex?.();
    const item = /^(l\d+):\d+:([ads]\d+)$/.exec(join);
    const placed = item ? index?.listItems.get(item[1])?.get(item[2]) : index?.objects.get(join)?.[0];
    if (!stored && !placed && index) return null;
    const theme = (ctx.renderer as { themeOf?: Record<string, string> } | null)?.themeOf?.[join];
    const fallback: Record<string, unknown> = placed
        ? { x: placed.x, y: placed.y, w: placed.w, h: placed.h, xrotation: 0, yrotation: 0, zrotation: 0, scale: 1, opacity: 1, theme: placed.theme || null }
        : {};
    const out: Record<string, unknown> = { ...(stored ?? {}), join };
    for (const k of PROPERTIES) if (out[k] === undefined) out[k] = k === 'theme' && theme !== undefined ? theme : fallback[k] ?? null;
    return out;
}

export function setProperties(
    ctx: CFContext,
    changes: any,
    delay: number,
    duration: number,
    curve: string,
    callback?: CFCallback,
    ...callbackParams: any[]
) {
    const changesArray = Array.isArray(changes) ? changes : [changes];
    // a tag for a join: each join whose objects carry it changes too (what getProperties gives them)
    const api = ctx as CFContext & GuiAware;
    const byJoin = changesArray.flatMap((change) =>
        change && change.join && api.joinsTagged && !isJoinName(change.join)
            ? api.joinsTagged(change.join).map((join) => ({ ...change, join }))
            : []);

    [...changesArray, ...byJoin].forEach(change => {
        if (change && change.join) {
            if (!ctx.propertiesStore[change.join]) {
                const props = {};
                Object.defineProperty(props, '_overrides', {
                    value: {},
                    enumerable: false,
                    writable: true,
                    configurable: true
                });
                ctx.propertiesStore[change.join] = props;
            }
            const storeVal = ctx.propertiesStore[change.join];
            if (!storeVal._overrides) {
                Object.defineProperty(storeVal, '_overrides', {
                    value: {},
                    enumerable: false,
                    writable: true,
                    configurable: true
                });
            }
            for (const key of Object.keys(change)) {
                if (key !== 'join') {
                    storeVal._overrides[key] = change[key];
                }
            }
            Object.assign(storeVal, change);
        }
    });

    if (ctx.renderer) {
        ctx.renderer.applyProperties(changesArray, delay, duration, curve);
    }
    ctx.dispatchEvent("PROPERTIES_CHANGED", changesArray, delay, duration, curve);

    if (callback) {
        if (delay > 0 || duration > 0) {
            setTimeout(() => callback(...callbackParams), (delay * 1000) + (duration * 1000));
        } else {
            callback(...callbackParams);
        }
    }
}

export function getGuiDescription(
    ctx: CFContext,
    callback?: CFCallback
) {
    if (callback) callback(ctx.gui);
}

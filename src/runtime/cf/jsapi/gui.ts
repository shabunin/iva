import { joinStore } from '../joinStore';
import { CFContext, CFCallback } from './types';

export function getJoin(
    ctx: CFContext,
    join: string,
    callback?: (join: string, value: string | number | null, tokens: any, tags: string[]) => void
) {
    const parsed = ctx.parseJoin(join);
    let val: string | number | null = null;
    if (parsed) {
        const raw = joinStore.get(parsed.id, parsed.type);
        val = raw !== undefined ? (typeof raw === "boolean" ? (raw ? 1 : 0) : raw as string | number) : null;
    }
    const tokens = ctx.tokensStore[join] || {};
    const tags: string[] = [];
    if (callback) callback(join, val, tokens, tags);
    return val;
}

export function getJoins(
    ctx: CFContext,
    arrayOfJoins: string[],
    callback?: (arrayOfJoinValues: Record<string, { value: string | number | null; tokens: Record<string, string>; tags: string[] }>) => void
) {
    const result: Record<string, { value: string | number | null; tokens: Record<string, string>; tags: string[] }> = {};
    for (const j of arrayOfJoins) {
        const parsed = ctx.parseJoin(j);
        let val: string | number | null = null;
        if (parsed) {
            const raw = joinStore.get(parsed.id, parsed.type);
            val = raw !== undefined ? (typeof raw === "boolean" ? (raw ? 1 : 0) : raw as string | number) : null;
        }
        result[j] = {
            value: val,
            tokens: ctx.tokensStore[j] || {},
            tags: []
        };
    }
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
        
        // iViewer supports token replacement and math expressions in setJoin values
        if (typeof evaluatedValue === 'string') {
            // 1. Replace tokens (e.g. [@a1] -> "18")
            evaluatedValue = TokenEngine.replaceTokens(evaluatedValue, ctx);
            
            // 2. Evaluate math expressions {{ ... }}
            if (evaluatedValue.includes('{{')) {
                evaluatedValue = evaluatedValue.replace(/{{(.*?)}}/g, (match, expr) => {
                    try {
                        const fn = new Function(`return (${expr});`);
                        return String(fn());
                    } catch (e) {
                        console.warn("Failed to evaluate math expression: " + expr, e);
                        return match;
                    }
                });
            }
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

export function setJoins(
    ctx: CFContext,
    joinsArray: { 
        join: string; 
        value?: string | number | boolean; 
        tokens?: Record<string, string | number | boolean>;
    }[],
    sendJoinChangeEvents: boolean = true
) {
    joinsArray.forEach(item => {
        if (item.value !== undefined) {
            setJoin(ctx, item.join, item.value, sendJoinChangeEvents);
        }
        if (item.tokens) {
            for (const [tokenName, tokenValue] of Object.entries(item.tokens)) {
                setToken(ctx, item.join, tokenName, String(tokenValue));
            }
        }
    });
}

export function setToken(
    ctx: CFContext,
    join: string,
    token: string,
    value: string
) {
    if (!ctx.tokensStore[join]) {
        ctx.tokensStore[join] = {};
    }
    ctx.tokensStore[join][token] = value;
    (ctx as any).dispatchEvent("TokenChangedEvent", join, token, value);
}

export function getProperties(
    ctx: CFContext,
    joinOrJoinsArray: string | string[],
    callback: CFCallback
) {
    const isArray = Array.isArray(joinOrJoinsArray);
    const joins = isArray ? (joinOrJoinsArray as string[]) : [joinOrJoinsArray as string];
    const result = joins.map(j => ctx.propertiesStore[j] || { join: j });
    
    if (callback) {
        callback(isArray ? result : result[0]);
    }
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
    
    changesArray.forEach(change => {
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

import { CFContext, CFCallback } from './types';
import { joinStore } from '../joinStore';

export function listScroll(
    ctx: CFContext,
    listJoin: string,
    index: any,
    position: any,
    animated: boolean,
    overrideScale?: boolean
) {
    ctx.dispatchEvent("LIST_SCROLLED", listJoin, index, position, animated, overrideScale);
}

/** What changed in a list, for the list on screen to show it (animated, as iViewer's insert / delete transitions). */
export interface ListChange {
    op: 'add' | 'remove' | 'update' | 'clear';
    /** add / remove: the first item's index */
    at?: number;
    count?: number;
    /** update: the items changed */
    indexes?: number[];
}

/** the prefix of a list's item joins: l1:<index>:s2 */
const itemPrefix = (list: string) => `l${list.replace(/^l/, '')}:`;

/**
 * An item's joins as its object gives them (a value, or { value, tokens }),
 * quietly - as iViewer, no JoinChangeEvent for a list's items. `missing`:
 * only those not set yet (the list shown again: what the user changed in
 * an item stays).
 */
export function setItemJoins(ctx: CFContext, list: string, idx: number, info: any, missing = false) {
    const prefix = itemPrefix(list);
    for (const key of Object.keys(info ?? {})) {
        if (key === 'subpage' || key === 'title' || key === 'index') continue;
        const type = key.charAt(0);
        if (type !== 's' && type !== 'd' && type !== 'a') continue;
        const id = `${prefix}${idx}:${key.substring(1)}`;
        if (missing && joinStore.has(id, type)) continue;
        const v = info[key];
        // its tokens first: what shows the value uses them
        if (v && typeof v === 'object' && v.tokens && ctx.tokensStore) {
            const at = `${prefix}${idx}:${key}`;
            ctx.tokensStore[at] = { ...(ctx.tokensStore[at] ?? {}), ...v.tokens };
        }
        joinStore.setQuiet(id, type, v && typeof v === 'object' && 'value' in v ? v.value : v);
    }
}

/** the items' joins and tokens from `at` on moved by `by` (an item in: down; gone: up, theirs dropped) */
function moveItems(ctx: CFContext, list: string, at: number, by: number) {
    const prefix = itemPrefix(list);
    const to = (key: string): string | null => {
        if (!key.startsWith(prefix)) return key;
        const parts = key.split(':');
        const i = Number(parts[1]);
        if (!(i >= at)) return key;
        if (by < 0 && i < at - by) return null;
        parts[1] = String(i + by);
        return parts.join(':');
    };
    joinStore.rekey(to);
    if (!ctx.tokensStore) return;
    const tokens: Record<string, any> = {};
    for (const [key, value] of Object.entries(ctx.tokensStore)) {
        const k = to(key);
        if (k !== null) tokens[k] = value;
    }
    for (const key of Object.keys(ctx.tokensStore)) delete ctx.tokensStore[key];
    Object.assign(ctx.tokensStore, tokens);
}

export function listAdd(
    ctx: CFContext,
    list: string,
    array: any[],
    position?: number | string
) {
    if (!ctx.listsStore[list]) ctx.listsStore[list] = [];
    const items = ctx.listsStore[list];
    // at the top, at an index; else (none, the bottom, outside the items) appended
    const n = Number(position);
    const at = position === ctx.TopPosition ? 0
        : typeof position === 'number' && Number.isInteger(n) && n >= 0 && n <= items.length ? n
        : items.length;
    items.splice(at, 0, ...array);
    moveItems(ctx, list, at, array.length);
    array.forEach((info, k) => setItemJoins(ctx, list, at + k, info));
    ctx.dispatchEvent("LIST_UPDATED", list, { op: 'add', at, count: array.length } satisfies ListChange);
}

export function listUpdate(
    ctx: CFContext,
    list: string,
    array: any[]
) {
    if (!ctx.listsStore[list]) ctx.listsStore[list] = [];
    const items = ctx.listsStore[list];
    const changed = new Set<number>();
    for (const item of array) {
        if (!item) continue;
        const { index, ...joins } = item;
        // an item's index, CF.LastItem (the last one) or CF.AllItems (every one)
        const at = index === ctx.AllItems ? items.map((_: unknown, i: number) => i)
            : index === ctx.LastItem ? (items.length ? [items.length - 1] : [])
            : Number.isInteger(Number(index)) && Number(index) >= 0 && Number(index) < items.length ? [Number(index)] : [];
        for (const i of at) {
            items[i] = { ...items[i], ...joins };
            setItemJoins(ctx, list, i, joins);
            changed.add(i);
        }
    }
    ctx.dispatchEvent("LIST_UPDATED", list, { op: 'update', indexes: [...changed] } satisfies ListChange);
}

export function listRemove(
    ctx: CFContext,
    list: string,
    index?: number,
    count?: number
) {
    if (!ctx.listsStore[list]) return;

    if (index === undefined || index === null) {
        const scroll = (ctx.listsStore[list] as any)._scrollInfo;
        ctx.listsStore[list] = [];
        if (scroll) (ctx.listsStore[list] as any)._scrollInfo = scroll;
        moveItems(ctx, list, 0, -Infinity);
        ctx.dispatchEvent("LIST_UPDATED", list, { op: 'clear' } satisfies ListChange);
        return;
    }
    // (list, index): from there to the end; (list, index, count): that many
    const items = ctx.listsStore[list];
    const at = Number(index);
    const gone = items.splice(at, count === undefined || count === null ? items.length : Number(count));
    if (!gone.length) return;
    moveItems(ctx, list, at, -gone.length);
    ctx.dispatchEvent("LIST_UPDATED", list, { op: 'remove', at, count: gone.length } satisfies ListChange);
}

export function listInfo(
    ctx: CFContext,
    list: string,
    callback?: CFCallback
) {
    const lId = list.startsWith("l") ? list : "l" + list;
    const normId = list.startsWith("l") ? list.substring(1) : list;
    
    const listData = ctx.listsStore[lId] || ctx.listsStore[normId] || [];
    const count = listData.length;
    const scrollInfo = (ctx.listsStore[lId] as any)?._scrollInfo || (ctx.listsStore[normId] as any)?._scrollInfo;
    
    let first = 0;
    let numVisible = 0;
    let pos = 0;
    
    if (scrollInfo) {
        first = scrollInfo.first;
        numVisible = scrollInfo.numVisible;
        pos = scrollInfo.scrollPosition || 0;
    } else {
        numVisible = Math.min(count, 4); // naive fallback
    }
    
    if (callback) callback(list, count, first, numVisible, pos);
}

export function listContents(
    ctx: CFContext,
    list: string,
    index: number,
    count: number,
    callback?: CFCallback
) {
    const listData = ctx.listsStore[list] || ctx.listsStore[list.startsWith("l") ? list.substring(1) : "l" + list] || [];
    const rawSlice = count === 0 ? listData.slice(index) : listData.slice(index, index + count);
    
    const result = rawSlice.map(item => {
        const mappedItem: any = {};
        if (item.subpage) mappedItem.subpage = item.subpage;
        
        Object.keys(item).forEach(key => {
            if (key !== "subpage") {
                const val = item[key];
                if (val && typeof val === "object" && ("value" in val || "tokens" in val)) {
                    mappedItem[key] = {
                        value: val.value !== undefined ? String(val.value) : "",
                        tokens: val.tokens || {}
                    };
                } else {
                    mappedItem[key] = {
                        value: String(val),
                        tokens: {}
                    };
                }
            }
        });
        return mappedItem;
    });
    
    if (callback) callback(result);
}

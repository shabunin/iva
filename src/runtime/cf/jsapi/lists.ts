import { CFContext, CFCallback } from './types';

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

export function listAdd(
    ctx: CFContext,
    list: string,
    array: any[],
    position?: number | string
) {
    if (!ctx.listsStore[list]) ctx.listsStore[list] = [];
    
    if (position === undefined || position === ctx.BottomPosition || position === ctx.LastItem) {
        ctx.listsStore[list].push(...array);
    } else if (position === ctx.TopPosition) {
        ctx.listsStore[list].unshift(...array);
    } else if (typeof position === 'number') {
        ctx.listsStore[list].splice(position, 0, ...array);
    }
    ctx.dispatchEvent("LIST_UPDATED", list);
}

export function listUpdate(
    ctx: CFContext,
    list: string,
    array: any[]
) {
    if (!ctx.listsStore[list]) ctx.listsStore[list] = [];
    
    array.forEach(item => {
        if (item && typeof item.index === 'number' && item.index >= 0 && item.index < ctx.listsStore[list].length) {
            ctx.listsStore[list][item.index] = { ...ctx.listsStore[list][item.index], ...item };
        }
    });
    ctx.dispatchEvent("LIST_UPDATED", list);
}

export function listRemove(
    ctx: CFContext,
    list: string,
    index?: number,
    count?: number
) {
    if (!ctx.listsStore[list]) return;

    if (index === undefined) {
        ctx.listsStore[list] = [];
    } else {
        const removeCount = count || 1;
        ctx.listsStore[list].splice(index, removeCount);
    }
    ctx.dispatchEvent("LIST_UPDATED", list);
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

import { Container, Graphics, Rectangle, Text, TextStyle, type FederatedPointerEvent } from 'pixi.js';
import { ScrollBox } from '@pixi/ui';
import { CFNode, CFSubpage } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer, animateFrom, killTweensOf, trackAnimation } from '../renderer';
import { setItemJoins, type ListChange } from '../jsapi/lists';

/**
 * iViewer's insertTransition / deleteTransition (attributes only iViewer
 * reads, written by hand - GUI Designer has no field for them): how an item
 * comes and goes, as a table's rows do - Fade (the default), Left, Right,
 * Top, Bottom, Middle, None. The items after it slide to make room or close
 * the gap.
 */
export type RowAnimation = 'fade' | 'left' | 'right' | 'top' | 'bottom' | 'middle' | 'none';
export const rowAnimation = (v?: string): RowAnimation => {
    const s = (v ?? '').trim().toLowerCase();
    return (['fade', 'left', 'right', 'top', 'bottom', 'middle', 'none'] as const).find((k) => k === s) ?? 'fade';
};
/** seconds an item takes to come or go */
const ROW_TIME = 0.3;
/** the Delete button a swipe shows (Enable Swipe Delete) */
const DELETE_W = 84;

interface Row {
    kind: 'header' | 'item' | 'footer';
    /** the item's index (the header and footer: -1) */
    idx: number;
    info: any;
    sub: CFSubpage | null;
    /** where it is along the list, and how long */
    pos: number;
    size: number;
    /** placed by the layout; `inner` moved by its transition, the subpage in it */
    holder: Container;
    inner: Container;
    view: Container | null;
    scope: string;
}

/** every list's ScrollBox: the wheel goes to the innermost under the pointer */
const lists = new WeakSet<Container>();

export function renderList(
    node: CFNode,
    container: Container,
    renderer: CFRenderer
) {
    const isVertical = node.orientation !== "h";
    const W = node.w;
    const H = node.h;
    const insertAs = rowAnimation(node.attributes.insertTransition);
    const deleteAs = rowAnimation(node.attributes.deleteTransition);
    const swipeDelete = node.attributes.swipedelete === '1' && isVertical;

    const scrollBox = new ScrollBox({
        width: W,
        height: H,
        type: isVertical ? 'vertical' : 'horizontal',
        elementsMargin: 0,
        // the wheel scrolls the list under the pointer, not every list on the page (@pixi/ui's default)
        globalScroll: false,
    });
    // ...and of lists in lists (a page's ScrollArea), the innermost: a list between the pointer's target
    // and this one has it, and this one (over too, as far as @pixi/ui knows) lets the wheel be
    lists.add(scrollBox);
    scrollBox.on('pointerover', (e) => {
        for (let c = e.target as Container | null; c && c !== scrollBox; c = c.parent) {
            if (lists.has(c)) {
                (scrollBox as unknown as { isOver: boolean }).isOver = false;
                return;
            }
        }
    });
    // The list takes drags anywhere in its box, not just on what its rows draw.
    // ScrollBox is interactive, so everything in it is hit tested as such: its
    // rows' masks and bounds don't take part (eventMode none), or they'd take
    // the taps meant for the rows' buttons.
    scrollBox.hitArea = new Rectangle(0, 0, W, H);
    // a drag in a list scrolls that list, not one it's in (a page's ScrollArea)
    scrollBox.on('pointerdown', (e) => e.stopPropagation());

    // the rows, laid out by us (so they can come, go and move): one item of the ScrollBox
    const content = new Container();
    // a size from the start (ScrollBox wants its items to have one)
    content.boundsArea = new Rectangle(0, 0, isVertical ? W : 1, isVertical ? 1 : H);
    scrollBox.addItem(content);

    const headerName = node.headerSub;
    const footerName = node.footerSub;
    const contentName = node.contentSub;
    const titleName = node.titleSub;

    const listId: string = node.j && node.j !== '0' ? node.j : '';
    const lId = listId.startsWith("l") ? listId : "l" + listId;
    const normId = listId.startsWith("l") ? listId.substring(1) : listId;
    const cfObj = renderer.cfApi;

    let header: Row | null = null;
    let footer: Row | null = null;
    let items: Row[] = [];
    let instance = Math.random().toString(36).substring(2, 9);
    const rows = () => [header, ...items, footer].filter((r): r is Row => !!r);

    /** the items as the CF object has them (CF.listAdd("l1") or "1") */
    const stored = (): any[] => {
        if (!listId || !cfObj) return [];
        const a = cfObj.listsStore[listId];
        const b = cfObj.listsStore["l" + listId];
        return (a && a.length > 0) ? a : (b && b.length > 0 ? b : (a || b || []));
    };

    const subOf = (info: any): CFSubpage | null => {
        const name = info?.subpage || (info?.title ? titleName : '') || contentName;
        return (name && renderer.project.subpages[name]) || null;
    };
    const along = (sub: CFSubpage | null) => (sub ? (isVertical ? sub.h || 0 : sub.w || 0) : 0);

    /** an item's joins as its object gives them, those not set yet (CF.listAdd set them; what the user changed stays) */
    const setJoins = (idx: number, info: any) => {
        if (cfObj) setItemJoins(cfObj as any, lId, idx, info, true);
    };

    const makeRow = (kind: Row['kind'], idx: number, info: any, sub: CFSubpage | null): Row => {
        const holder = new Container();
        const inner = holder.addChild(new Container());
        content.addChild(holder);
        return { kind, idx, info, sub, pos: 0, size: along(sub), holder, inner, view: null, scope: `l${listId}:${idx}:${instance}` };
    };

    /** each rendering's own scope for its listeners: a row going out (dropped later) can't take another's */
    let renders = 0;
    const render = (row: Row) => {
        if (row.view || !row.sub) return;
        row.scope = `l${listId}:${row.idx}:${instance}:${++renders}`;
        const prevScope = renderer.currentScope;
        renderer.currentScope = row.scope;
        const view = renderer.createSubpage(row.sub, listId ? `l${listId}` : undefined, row.idx);
        renderer.currentScope = prevScope;
        const mask = new Graphics().rect(0, 0, row.sub.w, row.sub.h).fill(0xffffff);
        mask.eventMode = 'none';
        view.addChild(mask);
        view.mask = mask;
        renderer.layoutDebugLabels(view);
        row.inner.addChildAt(view, 0);
        row.view = view;
    };

    const unload = (row: Row) => {
        if (!row.view) return;
        const view = row.view;
        row.view = null;
        try {
            view.destroy({ children: true });
        } catch (e) {
            console.error("Failed to destroy a list item", e);
        }
        // its images, if no row left shows them: let go in a moment (a long list scrolled through)
        renderer.scheduleCollect();
        // its listeners, a header's and a footer's too (a page's ScrollArea: the page's whole content)
        joinStore.clearScope(row.scope);
        if (row.kind !== 'item') return;
        const prefix = `l${listId}:${row.idx}:`;
        for (const key of Object.keys(renderer.nodesMap)) {
            if (!key.startsWith(prefix)) continue;
            const live = renderer.nodesMap[key].filter((c) => !c.destroyed);
            if (live.length) renderer.nodesMap[key] = live;
            else delete renderer.nodesMap[key];
        }
    };

    const drop = (row: Row) => {
        unload(row);
        killTweensOf(row.holder);
        killTweensOf(row.inner);
        killTweensOf(row.inner.scale);
        if (!row.holder.destroyed) row.holder.destroy({ children: true });
    };

    /** an item now at another index: its joins are that index's (shown again from them) */
    const reindex = (row: Row, idx: number) => {
        if (row.idx === idx) return;
        const shown = !!row.view;
        unload(row);
        row.idx = idx;
        if (shown) render(row);
    };

    let length = 0;
    /** the rows one after the other (sliding there when `animated`); the list as long as they are */
    const layout = (animated: boolean, placed: Set<Row> = new Set()) => {
        let pos = 0;
        for (const r of rows()) {
            r.pos = pos;
            pos += r.size;
            const now = isVertical ? r.holder.y : r.holder.x;
            if (now === r.pos) continue;
            killTweensOf(r.holder);
            if (animated && !placed.has(r)) {
                trackAnimation(r.holder, animateFrom(r.holder, isVertical ? { y: r.pos } : { x: r.pos }, { duration: ROW_TIME, ease: 'easeInOut' }));
            } else if (isVertical) r.holder.y = r.pos;
            else r.holder.x = r.pos;
        }
        length = pos;
        content.boundsArea = new Rectangle(0, 0, isVertical ? W : length, isVertical ? length : H);
        // a touch anywhere on its rows is the list's (a swipe on one, a drag), what's on them first
        content.hitArea = content.boundsArea;
        scrollBox.resize();
    };

    /** a row coming (in) or going (out) as the list's transition has it; then `done` */
    const transit = (row: Row, how: RowAnimation, coming: boolean, done?: () => void) => {
        const inner = row.inner;
        killTweensOf(inner);
        killTweensOf(inner.scale);
        if (how === 'none') {
            done?.();
            return;
        }
        const size = row.size;
        const span = isVertical ? W : H;
        const finish = () => done?.();
        if (how === 'middle') {
            // from / to nothing, about its middle
            const mid = size / 2;
            if (isVertical) {
                inner.pivot.y = mid;
                inner.y = mid;
                inner.scale.y = coming ? 0 : 1;
            } else {
                inner.pivot.x = mid;
                inner.x = mid;
                inner.scale.x = coming ? 0 : 1;
            }
            const a = animateFrom(inner.scale, isVertical ? { y: coming ? 1 : 0 } : { x: coming ? 1 : 0 }, { duration: ROW_TIME, ease: 'easeInOut' }, inner);
            trackAnimation(inner.scale, a).finished.then(finish, finish);
            return;
        }
        const away: { x?: number; y?: number; alpha?: number } =
            how === 'fade' ? { alpha: 0 }
            : how === 'left' ? { x: -span }
            : how === 'right' ? { x: span }
            : how === 'top' ? { y: isVertical ? -size : -span }
            : { y: isVertical ? size : span };
        const rest = { x: 0, y: 0, alpha: 1 };
        if (coming) Object.assign(inner, rest, away);
        const a = animateFrom(inner, coming ? rest : { ...rest, ...away }, { duration: ROW_TIME, ease: 'easeInOut' });
        trackAnimation(inner, a).finished.then(finish, finish);
    };

    // ── the Delete button a swipe shows ───────────────────────────
    let deleting: { row: Row; button: Container } | null = null;
    const hideDelete = () => {
        if (!deleting) return;
        const { button } = deleting;
        deleting = null;
        if (!button.destroyed) button.destroy({ children: true });
    };
    const showDelete = (row: Row) => {
        hideDelete();
        const button = new Container();
        button.addChild(new Graphics().rect(0, 0, DELETE_W, row.size).fill(0xff3b30));
        const label = new Text({ text: 'Delete', style: new TextStyle({ fill: '#ffffff', fontSize: Math.min(18, Math.max(12, row.size * 0.3)), fontFamily: ['Arial', 'sans-serif'] }) });
        label.anchor.set(0.5);
        label.position.set(DELETE_W / 2, row.size / 2);
        button.addChild(label);
        button.x = W - DELETE_W;
        button.eventMode = 'static';
        button.cursor = 'pointer';
        button.hitArea = new Rectangle(0, 0, DELETE_W, row.size);
        button.on('pointertap', (e: FederatedPointerEvent) => {
            e.stopPropagation();
            const idx = row.idx;
            hideDelete();
            const list = cfObj?.listsStore[listId]?.length ? listId : lId;
            cfObj?.listRemove?.(list, idx, 1);
        });
        row.holder.addChild(button);
        deleting = { row, button };
    };
    const itemAt = (along: number) => items.find((r) => along >= r.pos && along < r.pos + r.size) ?? null;
    if (swipeDelete) {
        // on the rows (the ScrollBox takes no events while they don't fill it)
        let swipe: { x: number; y: number; row: Row | null } | null = null;
        content.on('pointerdown', (e: FederatedPointerEvent) => {
            const p = content.toLocal(e.global);
            const row = itemAt(p.y);
            if (deleting && deleting.row !== row) hideDelete();
            swipe = { x: p.x, y: p.y, row };
        });
        content.on('globalpointermove', (e: FederatedPointerEvent) => {
            if (!swipe?.row) return;
            const p = content.toLocal(e.global);
            const dx = p.x - swipe.x;
            const dy = p.y - swipe.y;
            if (Math.abs(dy) > 20) swipe = null;
            else if (dx < -30 && Math.abs(dx) > 2 * Math.abs(dy)) {
                showDelete(swipe.row);
                swipe = null;
            } else if (dx > 30 && deleting?.row === swipe.row) {
                hideDelete();
                swipe = null;
            }
        });
        const end = () => (swipe = null);
        content.on('pointerup', end);
        content.on('pointerupoutside', end);
    }

    // ── scrolling: iViewer's events and commands ──────────────────

    let lastScrollFirst = -1;
    let lastScrollPos = -1;
    let lastScrollCmdTime = 0;
    let wasAtEnd = false;

    // iViewer's ListWillStartScrollingEvent / ListDidEndScrollingEvent: the
    // position starts changing; it holds still for a moment with nothing
    // holding the list (a drag, a fling slowing down, a listScroll animating)
    let scrolling = false;
    let stillSince = 0;
    let lastMovePos: number | null = null;
    const trackScrolling = (lId: string, count: number, first: number, numVisible: number, pos: number) => {
        const now = performance.now();
        if (lastMovePos === null) {
            lastMovePos = pos;
            return;
        }
        if (pos !== lastMovePos) {
            lastMovePos = pos;
            stillSince = now;
            if (!scrolling) {
                scrolling = true;
                hideDelete();
                cfObj?.dispatchEvent?.("LIST_WILL_START_SCROLLING_EVENT", lId);
            }
        } else if (scrolling && !(scrollBox as any).isDragging && now - stillSince > 120) {
            scrolling = false;
            cfObj?.dispatchEvent?.("LIST_DID_END_SCROLLING_EVENT", lId, count, first, numVisible, pos);
        }
    };

    const scrollPos = () => Math.max(0, Math.abs((isVertical ? scrollBox.scrollY : scrollBox.scrollX) || 0));

    /** the items near what shows rendered, the others not (a long list stays light) */
    const renderNear = () => {
        const pos = scrollPos();
        const view = isVertical ? H : W;
        const from = pos - view;
        const to = pos + 2 * view;
        for (const r of rows()) {
            if (r.kind !== 'item') {
                render(r);
                continue;
            }
            if (r.pos + r.size >= from && r.pos <= to) render(r);
            else if (r.view && deleting?.row !== r) unload(r);
        }
    };

    const updateScrollInfo = () => {
        if (scrollBox.destroyed) return;
        renderNear();
        if (!cfObj || !listId || !contentName) return;

        const totalCount = rows().length;
        const subDef = renderer.project.subpages[contentName];
        if (!subDef) return;

        const itemSize = isVertical ? (subDef.h || 50) : (subDef.w || 50);
        const containerSize = isVertical ? H : W;

        if (itemSize <= 0) return;

        let numVisible = Math.ceil(containerSize / itemSize) + 1;
        const pos = scrollPos();
        const first = Math.floor(pos / itemSize) || 0;

        if (first + numVisible > totalCount) {
            numVisible = Math.max(0, totalCount - first);
        }

        const scrollInfo = { count: totalCount, first, numVisible, scrollPosition: pos };
        trackScrolling(lId, totalCount, first, numVisible, pos);

        if (cfObj.listsStore[normId]) {
            (cfObj.listsStore[normId] as any)._scrollInfo = scrollInfo;
        }
        if (cfObj.listsStore[lId]) {
            (cfObj.listsStore[lId] as any)._scrollInfo = scrollInfo;
        }
        if (!cfObj.listsStore[normId] && !cfObj.listsStore[lId]) {
            cfObj.listsStore[lId] = [];
            (cfObj.listsStore[lId] as any)._scrollInfo = scrollInfo;
        }

        const lastScrollInfo = (scrollBox as any)._lastScrollInfo;
        if (!lastScrollInfo || lastScrollInfo.first !== first || lastScrollInfo.scrollPosition !== pos) {
            (scrollBox as any)._lastScrollInfo = scrollInfo;
            try {
                if (typeof cfObj.dispatchEvent === "function") {
                    cfObj.dispatchEvent("LIST_DID_SCROLL_EVENT", lId, totalCount, first, numVisible, pos);
                }
            } catch (e) {}

            const scrollCmd = node.attributes.scrollCmd;
            if (scrollCmd && (first !== lastScrollFirst || pos !== lastScrollPos)) {
                const now = Date.now();
                const interval = parseInt(node.attributes.scrollInterval || "50", 10);
                if (now - lastScrollCmdTime >= interval) {
                    lastScrollCmdTime = now;
                    lastScrollFirst = first;
                    lastScrollPos = pos;
                    (cfObj as any).runCommand?.("", scrollCmd, undefined, { join: lId, top: first, visible: numVisible, count: totalCount });
                }
            }

            const listEndCmd = node.attributes.listEndCmd;
            if (listEndCmd) {
                const offset = parseInt(node.attributes.listEndOffset || "0", 10);
                const maxScroll = Math.max(0, length - (isVertical ? H : W));
                const reachedEnd = (maxScroll - pos) <= offset;
                if (reachedEnd && !wasAtEnd) {
                    wasAtEnd = true;
                    (cfObj as any).runCommand?.("", listEndCmd, undefined, { join: lId, top: first, visible: numVisible, count: totalCount });
                } else if (!reachedEnd) {
                    wasAtEnd = false;
                }
            }
        }
    };

    /** scrolled to `target` (the negated position, as ScrollBox has it) */
    const scrollTo = (target: number) => {
        if (isVertical) {
            scrollBox.scrollY = target;
            if (scrollBox.list) scrollBox.list.y = target;
        } else {
            scrollBox.scrollX = target;
            if (scrollBox.list) scrollBox.list.x = target;
        }
    };

    // ── building it, and changing it as the list changes ──────────

    /** all of it again, at the scroll position it had */
    const rebuild = () => {
        hideDelete();
        for (const r of rows()) drop(r);
        header = footer = null;
        items = [];
        instance = Math.random().toString(36).substring(2, 9);

        if (headerName && renderer.project.subpages[headerName]) header = makeRow('header', -1, {}, renderer.project.subpages[headerName]);
        const list = stored();
        list.forEach((info, idx) => setJoins(idx, info));
        items = list.map((info, idx) => makeRow('item', idx, info, subOf(info)));
        if (footerName && renderer.project.subpages[footerName]) footer = makeRow('footer', -1, {}, renderer.project.subpages[footerName]);
        layout(false);

        // the scroll position it had (the CF object keeps it)
        const storeInfo = cfObj && listId ? (cfObj.listsStore[lId] as any)?._scrollInfo || (cfObj.listsStore[normId] as any)?._scrollInfo : null;
        const initial = storeInfo && typeof storeInfo.scrollPosition === 'number' ? storeInfo.scrollPosition : 0;
        if (initial > 0) scrollTo(-Math.min(initial, Math.max(0, length - (isVertical ? H : W))));
        updateScrollInfo();
    };

    /** a change as CF.listAdd / listUpdate / listRemove made it: animated; anything else, all of it again */
    const apply = (change?: ListChange) => {
        const list = stored();
        const op = change?.op;
        const at = change?.at ?? 0;
        const count = change?.count ?? 0;
        if (op === 'add' && list.length === items.length + count && at <= items.length) {
            const fresh = list.slice(at, at + count).map((info, k) => makeRow('item', at + k, info, subOf(info)));
            items.splice(at, 0, ...fresh);
            items.forEach((r, i) => reindex(r, i));
            layout(true, new Set(fresh));
            // only the new rows near what shows are built (and come in): 500 added - not 500 subpages made and
            // thrown away in the same call
            renderNear();
            for (const r of fresh) if (r.view) transit(r, insertAs, true);
            return;
        }
        if (op === 'remove' && list.length === items.length - count && at + count <= items.length) {
            if (deleting && deleting.row.idx >= at) hideDelete();
            const gone = items.splice(at, count);
            items.forEach((r, i) => reindex(r, i));
            for (const r of gone) {
                // on its way out: not a row any more, under the others
                content.setChildIndex(r.holder, 0);
                transit(r, deleteAs, false, () => drop(r));
            }
            layout(true);
            renderNear();
            return;
        }
        if (op === 'update' && list.length === items.length) {
            for (const i of change?.indexes ?? []) {
                const row = items[i];
                if (!row) continue;
                row.info = list[i];
                const sub = subOf(list[i]);
                // another subpage for it: drawn again
                if (sub !== row.sub) {
                    unload(row);
                    row.sub = sub;
                    row.size = along(sub);
                    render(row);
                }
            }
            layout(true);
            renderNear();
            return;
        }
        rebuild();
    };

    rebuild();
    if (renderer.app.ticker) {
        renderer.app.ticker.add(updateScrollInfo);
        scrollBox.on('destroyed', () => {
            renderer.app.ticker.remove(updateScrollInfo);
            hideDelete();
            for (const r of rows()) unload(r);
        });
    }

    if (listId && cfObj) {
        const listUpdatedCb = (updatedListId: string, change?: ListChange) => {
            if ((updatedListId === listId || updatedListId === "l" + listId) && !scrollBox.destroyed) apply(change);
        };

        /** on the stage and shown, it and everything it is in (a hidden subpage's list is not) */
        const onScreen = (): boolean => {
            for (let p: Container | null = scrollBox; p; p = p.parent) {
                if (!p.visible) return false;
                if (p === renderer.app.stage) return true;
            }
            return false;
        };

        // CF.listScroll(list, index, position, animated [, visibleOnly]): every list on the join scrolls,
        // unless visibleOnly is true - then only one on screen (the docs: several lists on one join)
        const listScrolledCb = (scrollListId: string, index: any, positionVal: any, animated: boolean, visibleOnly?: boolean) => {
            if (!(scrollListId === listId || scrollListId === "l" + listId) || scrollBox.destroyed) return;
            if (visibleOnly === true && !onScreen()) return;
            const all = rows();
            const view = isVertical ? H : W;
            let targetScroll = 0;

            if (positionVal === "PIXEL_POSITION") {
                targetScroll = -Number(index);
            } else {
                if (all.length === 0) return;
                let targetIdx = 0;
                if (index === "LAST_ITEM") {
                    targetIdx = all.length - 1 - (footer ? 1 : 0);
                } else if (positionVal === "RELATIVE_POSITION") {
                    const current = scrollPos();
                    const first = Math.max(0, all.findIndex((r) => r.pos + r.size > current));
                    targetIdx = first + Number(index);
                } else {
                    targetIdx = Number(index) + (header ? 1 : 0);
                }
                const minIdx = header ? 1 : 0;
                const maxIdx = all.length - 1 - (footer ? 1 : 0);
                targetIdx = Math.max(minIdx, Math.min(maxIdx, targetIdx));
                if (targetIdx < 0 || targetIdx >= all.length) return;
                const target = all[targetIdx];

                if (positionVal === "MIDDLE_POSITION") {
                    targetScroll = -target.pos + (view - target.size) / 2;
                } else if (positionVal === "BOTTOM_POSITION" || positionVal === "RIGHT_POSITION") {
                    targetScroll = -target.pos - target.size + view;
                } else if (positionVal === "VISIBLE_POSITION") {
                    const current = scrollPos();
                    if (target.pos >= current && target.pos + target.size <= current + view) return;
                    targetScroll = target.pos < current ? -target.pos : -target.pos - target.size + view;
                } else {
                    targetScroll = -target.pos;
                }
            }

            // within the list's ends
            targetScroll = Math.max(Math.min(0, view - length), Math.min(0, targetScroll));
            if (!animated) {
                scrollTo(targetScroll);
                return;
            }
            const start = isVertical ? scrollBox.scrollY : scrollBox.scrollX;
            const diff = targetScroll - start;
            if (Math.abs(diff) < 1) {
                scrollTo(targetScroll);
                return;
            }
            const duration = 200;
            const startTime = performance.now();
            const step = () => {
                if (scrollBox.destroyed) return;
                const progress = Math.min(1, (performance.now() - startTime) / duration);
                scrollTo(start + diff * progress * (2 - progress));
                if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        };

        cfObj.watch("LIST_UPDATED", listUpdatedCb);
        cfObj.watch("LIST_SCROLLED", listScrolledCb);

        scrollBox.on('destroyed', () => {
            cfObj.unwatch("LIST_UPDATED", listUpdatedCb);
            cfObj.unwatch("LIST_SCROLLED", listScrolledCb);
        });
    }

    // its theme's background colour (none without one)
    const bg = node.t ? renderer.project.themes[node.t]?.states['0']?.['background-color'] : undefined;
    if (bg && bg.toLowerCase() !== 'transparent') {
        const back = new Graphics().rect(0, 0, W, H).fill({ color: bg });
        back.eventMode = 'none';
        container.addChild(back);
    }
    container.addChild(scrollBox);
}

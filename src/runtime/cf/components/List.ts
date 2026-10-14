import { Container, Graphics, Rectangle } from 'pixi.js';
import { ScrollBox } from '@pixi/ui';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';

export function renderList(
    node: CFNode,
    container: Container,
    renderer: CFRenderer
) {
    let isVertical = node.orientation !== "h";
    
    const scrollBox = new ScrollBox({
        width: node.w,
        height: node.h,
        type: isVertical ? 'vertical' : 'horizontal',
        elementsMargin: 0,
    });
    // The list takes drags anywhere in its box, not just on what its rows draw.
    // ScrollBox is interactive, so everything in it is hit tested as such: its
    // rows' masks and bounds don't take part (eventMode none), or they'd take
    // the taps meant for the rows' buttons.
    scrollBox.hitArea = new Rectangle(0, 0, node.w, node.h);

    const headerName = node.headerSub;
    const footerName = node.footerSub;
    const contentName = node.contentSub;
    
    const listId = node.j;
    let scrollItemIds: any[] = [];
    
    let lastScrollFirst = -1;
    let lastScrollPos = -1;
    let lastScrollCmdTime = 0;
    let wasAtEnd = false;

    const notifyScroll = () => {
        // ScrollBox manages its own scrolling internally.
    };

    let tickerAdded = false;

    interface ListItemData {
        idx: number;
        itemInfo: any;
        placeholder: Container;
        rendered: boolean;
        itemScope: string;
        subContainer: Container | null;
    }

    let itemsData: ListItemData[] = [];
    let listInstanceId = Math.random().toString(36).substring(2, 9);
    let headerContainer: Container | null = null;
    let footerContainer: Container | null = null;

    const addSub = (name: string, listIndex: number, listId?: string) => {
        if (!name || !renderer.project.subpages[name]) return null;
        const subDef = renderer.project.subpages[name];
        const sContainer = renderer.createSubpage(subDef, listId ? `l${listId}` : undefined, listIndex);
        
        const itemMask = new Graphics().rect(0, 0, subDef.w, subDef.h).fill(0xffffff);
        itemMask.eventMode = 'none';
        sContainer.addChild(itemMask);
        sContainer.mask = itemMask;

        const itemId = scrollBox.addItem(sContainer);
        if (itemId) {
            scrollItemIds.push(itemId);
        }
        return sContainer;
    };

    const renderItem = (item: ListItemData) => {
        if (item.rendered) return;
        let subName = item.itemInfo.subpage || contentName;
        if (!subName || !renderer.project.subpages[subName]) return;
        const subDef = renderer.project.subpages[subName];
        
        const prevScope = renderer.currentScope;
        renderer.currentScope = item.itemScope;
        
        const sContainer = renderer.createSubpage(subDef, listId ? `l${listId}` : undefined, item.idx);
        
        renderer.currentScope = prevScope;
        
        const itemMask = new Graphics().rect(0, 0, subDef.w, subDef.h).fill(0xffffff);
        itemMask.eventMode = 'none';
        sContainer.addChild(itemMask);
        sContainer.mask = itemMask;
        
        // Align and layout debug labels for this subpage container
        renderer.layoutDebugLabels(sContainer);
        
        item.placeholder.addChild(sContainer);
        item.subContainer = sContainer;
        item.rendered = true;
    };

    const unloadItem = (item: ListItemData) => {
        if (!item.rendered) return;
        
        if (item.subContainer) {
            item.placeholder.removeChild(item.subContainer);
            try {
                item.subContainer.destroy({ children: true });
            } catch (e) {
                console.error("Failed to destroy subContainer", e);
            }
            item.subContainer = null;
        }
        
        joinStore.clearScope(item.itemScope);
        
        const prefix = `l${listId}:${item.idx}:`;
        Object.keys(renderer.nodesMap).forEach(key => {
            if (key.startsWith(prefix)) {
                const containers = renderer.nodesMap[key];
                if (containers) {
                    renderer.nodesMap[key] = containers.filter(c => !c.destroyed);
                    if (renderer.nodesMap[key].length === 0) {
                        delete renderer.nodesMap[key];
                    }
                }
            }
        });
        
        item.rendered = false;
    };

    const cleanupList = () => {
        itemsData.forEach(item => {
            unloadItem(item);
            try {
                item.placeholder.destroy({ children: true });
            } catch(e) {}
        });
        itemsData = [];

        if (headerContainer) {
            try {
                headerContainer.destroy({ children: true });
            } catch(e) {}
            headerContainer = null;
        }

        if (footerContainer) {
            try {
                footerContainer.destroy({ children: true });
            } catch(e) {}
            footerContainer = null;
        }
    };
    
    const cfObj = renderer.cfApi;

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
                cfObj?.dispatchEvent?.("LIST_WILL_START_SCROLLING_EVENT", lId);
            }
        } else if (scrolling && !(scrollBox as any).isDragging && now - stillSince > 120) {
            scrolling = false;
            cfObj?.dispatchEvent?.("LIST_DID_END_SCROLLING_EVENT", lId, count, first, numVisible, pos);
        }
    };

    const updateScrollInfo = () => {
        if (!cfObj || !listId || !contentName) return;
        
        let totalCount = scrollItemIds.length;
        const subDef = renderer.project.subpages[contentName];
        if (!subDef) return;
        
        const itemSize = isVertical ? (subDef.h || 50) : (subDef.w || 50);
        const containerSize = isVertical ? node.h : node.w;
        
        if (itemSize <= 0) return;
        
        let numVisible = Math.ceil(containerSize / itemSize) + 1;
        
        let pos = 0;
        try {
            if (isVertical) {
                pos = Math.abs((scrollBox as any).scrollY || 0);
            } else {
                pos = Math.abs((scrollBox as any).scrollX || 0);
            }
        } catch(e) {}
        
        if (pos < 0) pos = 0;
        const first = Math.floor(pos / itemSize) || 0;
        
        if (first + numVisible > totalCount) {
            numVisible = Math.max(0, totalCount - first);
        }
        
        const lId = listId.startsWith("l") ? listId : "l" + listId;
        const normId = listId.startsWith("l") ? listId.substring(1) : listId;
        
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

        // Lazy rendering update
        const headerOffset = headerName ? 1 : 0;
        const visibleListFirst = Math.max(0, first - headerOffset);
        const buffer = 10;
        const startIdx = Math.max(0, visibleListFirst - buffer);
        const endIdx = Math.min(itemsData.length - 1, visibleListFirst + numVisible + buffer);

        itemsData.forEach(item => {
            if (item.idx >= startIdx && item.idx <= endIdx) {
                if (!item.rendered) {
                    renderItem(item);
                }
            } else {
                if (item.rendered) {
                    unloadItem(item);
                }
            }
        });
        
        const lastScrollInfo = (scrollBox as any)._lastScrollInfo;
        if (!lastScrollInfo || lastScrollInfo.first !== first || lastScrollInfo.scrollPosition !== pos) {
            (scrollBox as any)._lastScrollInfo = scrollInfo;
            try {
                if (typeof cfObj.dispatchEvent === "function") {
                    cfObj.dispatchEvent("LIST_DID_SCROLL_EVENT", lId, totalCount, first, numVisible, pos);
                }
            } catch(e) {}

            const scrollCmd = node.attributes.scrollCmd;
            if (scrollCmd && (first !== lastScrollFirst || pos !== lastScrollPos)) {
                const now = Date.now();
                const interval = parseInt(node.attributes.scrollInterval || "50", 10);
                if (now - lastScrollCmdTime >= interval) {
                    lastScrollCmdTime = now;
                    lastScrollFirst = first;
                    lastScrollPos = pos;
                    
                    const tokenContext = {
                        join: lId,
                        top: first,
                        visible: numVisible,
                        count: totalCount
                    };
                    
                    if (renderer.cfApi?.runCommand) {
                        (renderer.cfApi as any).runCommand("", scrollCmd, undefined, tokenContext);
                    }
                }
            }

            const listEndCmd = node.attributes.listEndCmd;
            if (listEndCmd) {
                const offset = parseInt(node.attributes.listEndOffset || "0", 10);
                const maxScroll = isVertical 
                    ? (scrollBox.scrollHeight - scrollBox.height) 
                    : (scrollBox.scrollWidth - scrollBox.width);
                
                const reachedEnd = (maxScroll - pos) <= offset;
                if (reachedEnd && !wasAtEnd) {
                    wasAtEnd = true;
                    
                    const tokenContext = {
                        join: lId,
                        top: first,
                        visible: numVisible,
                        count: totalCount
                    };
                    
                    if (renderer.cfApi?.runCommand) {
                        (renderer.cfApi as any).runCommand("", listEndCmd, undefined, tokenContext);
                    }
                } else if (!reachedEnd) {
                    wasAtEnd = false;
                }
            }
        }
    };

    const renderListItems = () => {
        cleanupList();
        listInstanceId = Math.random().toString(36).substring(2, 9);
        
        try {
            (scrollBox as any).removeItems?.();
            scrollItemIds = [];
        } catch(e) {}
        
        if (headerName) headerContainer = addSub(headerName, -1);
        
        const items1 = listId ? renderer.cfApi?.listsStore[listId] : null;
        const items2 = listId ? renderer.cfApi?.listsStore["l" + listId] : null;
        const listItems = (items1 && items1.length > 0) ? items1 : (items2 && items2.length > 0 ? items2 : (items1 || items2 || []));
        
        listItems.forEach((itemInfo: any, idx: number) => {
            Object.keys(itemInfo).forEach(key => {
                if (key !== "subpage") {
                    let joinType = key.charAt(0);
                    let joinNum = key.substring(1);
                    let val = itemInfo[key];
                    if (["s", "d", "a"].includes(joinType)) {
                        let fullJoin = `l${listId}:${idx}:${joinNum}`;
                        joinStore.set(fullJoin as any, joinType as any, val);
                    }
                }
            });
        });

        listItems.forEach((itemInfo: any, idx: number) => {
            let subName = itemInfo.subpage || contentName;
            if (!subName || !renderer.project.subpages[subName]) return;
            const subDef = renderer.project.subpages[subName];

            const placeholder = new Container();
            const boundsGfx = new Graphics().rect(0, 0, subDef.w, subDef.h).fill({ color: 0x000000, alpha: 0.0001 });
            boundsGfx.eventMode = 'none';
            placeholder.addChild(boundsGfx);

            const itemId = scrollBox.addItem(placeholder);
            if (itemId) {
                scrollItemIds.push(itemId);
            }

            itemsData.push({
                idx,
                itemInfo,
                placeholder,
                rendered: false,
                itemScope: `l${listId}:${idx}:${listInstanceId}`,
                subContainer: null
            });
        });
        
        if (footerName) footerContainer = addSub(footerName, -1);
        
        // Restore scroll position from listsStore if available
        const lId = listId?.startsWith("l") ? listId : (listId ? "l" + listId : "");
        const normId = listId?.startsWith("l") ? listId.substring(1) : (listId || "");
        
        let initialScrollPos = 0;
        if (cfObj && listId) {
            const storeInfo = cfObj.listsStore[lId]?._scrollInfo || cfObj.listsStore[normId]?._scrollInfo;
            if (storeInfo && typeof storeInfo.scrollPosition === 'number') {
                initialScrollPos = storeInfo.scrollPosition;
            }
        }

        if (initialScrollPos > 0) {
            if (isVertical) {
                const maxScroll = Math.max(0, scrollBox.scrollHeight - scrollBox.height);
                const target = -Math.min(initialScrollPos, maxScroll);
                scrollBox.scrollY = target;
                if (scrollBox.list) scrollBox.list.y = target;
            } else {
                const maxScroll = Math.max(0, scrollBox.scrollWidth - scrollBox.width);
                const target = -Math.min(initialScrollPos, maxScroll);
                scrollBox.scrollX = target;
                if (scrollBox.list) scrollBox.list.x = target;
            }
            (scrollBox as any).updateVisibleItems?.();
        }
        
        updateScrollInfo();
        
        if (!tickerAdded && renderer.app.ticker) {
            tickerAdded = true;
            renderer.app.ticker.add(updateScrollInfo);
            scrollBox.on('destroyed', () => {
                renderer.app.ticker.remove(updateScrollInfo);
                cleanupList();
            });
        }
    };

    renderListItems();
    
    if (listId) {
        const cfObj = renderer.cfApi;
        if (cfObj) {
            const listUpdatedCb = (updatedListId: string) => {
                if ((updatedListId === listId || updatedListId === "l" + listId) && !scrollBox.destroyed) renderListItems();
            };
            
            const listScrolledCb = (scrollListId: string, index: any, positionVal: any, animated: boolean) => {
                if ((scrollListId === listId || scrollListId === "l" + listId) && !scrollBox.destroyed) {
                    const isVertical = node.orientation !== "h";
                    let targetScroll = 0;
                    
                    if (positionVal === "PIXEL_POSITION") {
                        targetScroll = -Number(index);
                    } else {
                        const childrenNodes = scrollBox.items;
                        if (childrenNodes.length === 0) return;
                        
                        let targetIdx = 0;
                        if (index === "LAST_ITEM") {
                            targetIdx = childrenNodes.length - 1 - (footerName ? 1 : 0);
                        } else if (positionVal === "RELATIVE_POSITION") {
                            let currentFirst = 0;
                            const currentScroll = isVertical ? -scrollBox.scrollY : -scrollBox.scrollX;
                            for (let k = 0; k < childrenNodes.length; k++) {
                                const child = childrenNodes[k];
                                const childSize = isVertical ? child.height : child.width;
                                const childPos = isVertical ? child.y : child.x;
                                if (childPos + childSize > currentScroll) {
                                    currentFirst = k;
                                    break;
                                }
                            }
                            targetIdx = currentFirst + Number(index);
                        } else {
                            targetIdx = Number(index) + (headerName ? 1 : 0);
                        }
                        
                        const minIdx = headerName ? 1 : 0;
                        const maxIdx = childrenNodes.length - 1 - (footerName ? 1 : 0);
                        targetIdx = Math.max(minIdx, Math.min(maxIdx, targetIdx));
                        
                        if (targetIdx < 0 || targetIdx >= childrenNodes.length) return;
                        
                        const targetItem = childrenNodes[targetIdx];
                        
                        if (positionVal === "MIDDLE_POSITION") {
                            if (isVertical) {
                                targetScroll = -targetItem.y + (scrollBox.height - targetItem.height) / 2;
                            } else {
                                targetScroll = -targetItem.x + (scrollBox.width - targetItem.width) / 2;
                            }
                        } else if (positionVal === "BOTTOM_POSITION" || positionVal === "RIGHT_POSITION") {
                            if (isVertical) {
                                targetScroll = -targetItem.y - targetItem.height + scrollBox.height - (scrollBox.list?.bottomPadding ?? 0);
                            } else {
                                targetScroll = -targetItem.x - targetItem.width + scrollBox.width - (scrollBox.list?.rightPadding ?? 0);
                            }
                        } else if (positionVal === "VISIBLE_POSITION") {
                            const currentScroll = isVertical ? scrollBox.scrollY : scrollBox.scrollX;
                            const containerSize = isVertical ? scrollBox.height : scrollBox.width;
                            const itemPos = isVertical ? targetItem.y : targetItem.x;
                            const itemSize = isVertical ? targetItem.height : targetItem.width;
                            
                            if (itemPos >= -currentScroll && (itemPos + itemSize) <= (-currentScroll + containerSize)) {
                                return;
                            }
                            if (itemPos < -currentScroll) {
                                targetScroll = -itemPos;
                            } else {
                                targetScroll = -itemPos - itemSize + containerSize;
                            }
                        } else {
                            targetScroll = isVertical ? -targetItem.y : -targetItem.x;
                        }
                    }
                    
                    const axis = isVertical ? (scrollBox as any)._trackpad?.yAxis : (scrollBox as any)._trackpad?.xAxis;
                    if (axis) {
                        const min = axis.min ?? 0;
                        const max = axis.max ?? 0;
                        const lower = Math.min(min, max);
                        const upper = Math.max(min, max);
                        targetScroll = Math.max(lower, Math.min(upper, targetScroll));
                        
                        if (animated) {
                            const startScroll = isVertical ? scrollBox.scrollY : scrollBox.scrollX;
                            const diff = targetScroll - startScroll;
                            if (Math.abs(diff) < 1) {
                                if (isVertical) {
                                    scrollBox.scrollY = targetScroll;
                                    if (scrollBox.list) scrollBox.list.y = targetScroll;
                                } else {
                                    scrollBox.scrollX = targetScroll;
                                    if (scrollBox.list) scrollBox.list.x = targetScroll;
                                }
                                (scrollBox as any).updateVisibleItems?.();
                                return;
                            }
                            
                            const duration = 200;
                            const startTime = performance.now();
                            
                            const animateScroll = () => {
                                const elapsed = performance.now() - startTime;
                                const progress = Math.min(1, elapsed / duration);
                                const ease = progress * (2 - progress);
                                const current = startScroll + diff * ease;
                                
                                if (isVertical) {
                                    scrollBox.scrollY = current;
                                    if (scrollBox.list) scrollBox.list.y = current;
                                } else {
                                    scrollBox.scrollX = current;
                                    if (scrollBox.list) scrollBox.list.x = current;
                                }
                                (scrollBox as any).updateVisibleItems?.();
                                
                                if (progress < 1 && !scrollBox.destroyed) {
                                    requestAnimationFrame(animateScroll);
                                }
                            };
                            requestAnimationFrame(animateScroll);
                        } else {
                            if (isVertical) {
                                scrollBox.scrollY = targetScroll;
                                if (scrollBox.list) scrollBox.list.y = targetScroll;
                            } else {
                                scrollBox.scrollX = targetScroll;
                                if (scrollBox.list) scrollBox.list.x = targetScroll;
                            }
                            (scrollBox as any).updateVisibleItems?.();
                        }
                    }
                }
            };

            cfObj.watch("LIST_UPDATED", listUpdatedCb);
            cfObj.watch("LIST_SCROLLED", listScrolledCb);

            scrollBox.on('destroyed', () => {
                cfObj.unwatch("LIST_UPDATED", listUpdatedCb);
                cfObj.unwatch("LIST_SCROLLED", listScrolledCb);
            });
        }
    }
    
    container.addChild(scrollBox);
}

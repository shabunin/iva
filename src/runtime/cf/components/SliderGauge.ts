import { Container, Sprite, Graphics, Assets, Rectangle } from 'pixi.js';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';

export function renderSliderOrGauge(
    node: CFNode,
    container: Container,
    renderer: CFRenderer,
    getNormJoin: (type: string, j: string | undefined) => string | null
) {
    const theme = node.t ? renderer.project.themes[node.t] || renderer.project.themes["."+node.t] : null;
    const offTheme = theme?.states["0"];
    const onTheme = theme?.states["1"];
    const thumbTheme = theme?.states["2"];

    const offImg = renderer.getBgImage(offTheme?.["background-image"]);
    const onImg = renderer.getBgImage(onTheme?.["background-image"]);

    let bgResource: Sprite | Graphics;
    if (offImg && Assets.get(offImg)) {
        bgResource = new Sprite(Assets.get(offImg));
        bgResource.width = node.w;
        bgResource.height = node.h;
    } else {
        bgResource = new Graphics();
        bgResource.rect(0, 0, node.w, node.h).fill({ color: 0x000000, alpha: 0 });
    }
    
    let thumbImgOff = renderer.getBgImage(thumbTheme?.["background-image"]) || "";
    let thumbImgOn = thumbImgOff;
    
    let thumbWOff = 0, thumbHOff = 0;
    let thumbWOn = 0, thumbHOn = 0;

    const ind0 = node.children ? node.children.find(c => c.type === "indicator" && c.attributes.state === "0") : undefined;
    const ind1 = node.children ? node.children.find(c => c.type === "indicator" && c.attributes.state === "1") : undefined;

    const resolveIndicatorImage = (ind: CFNode | undefined) => {
        if (ind && ind.text) {
            const fileName = ind.text;
            if (Assets.get(fileName)) return fileName;
            const keys = Object.keys(renderer.imageMap);
            const foundKey = keys.find(k => k.toLowerCase() === fileName.toLowerCase());
            return foundKey || fileName;
        }
        return null;
    };

    const indImg0 = resolveIndicatorImage(ind0);
    if (indImg0) {
        thumbImgOff = indImg0;
        thumbImgOn = indImg0;
        if (ind0) {
            thumbWOff = parseInt(ind0.attributes.w || "0", 10);
            thumbHOff = parseInt(ind0.attributes.h || "0", 10);
            thumbWOn = thumbWOff;
            thumbHOn = thumbHOff;
        }
    }
    
    const indImg1 = resolveIndicatorImage(ind1);
    if (indImg1) {
        thumbImgOn = indImg1;
        if (ind1) {
            thumbWOn = parseInt(ind1.attributes.w || "0", 10);
            thumbHOn = parseInt(ind1.attributes.h || "0", 10);
        }
    }

    let thumbResourceOff: Sprite | Graphics | null = null;
    let thumbResourceOn: Sprite | Graphics | null = null;

    if (thumbImgOff && Assets.get(thumbImgOff)) {
        thumbResourceOff = new Sprite(Assets.get(thumbImgOff));
        if (thumbWOff > 0) thumbResourceOff.width = thumbWOff;
        if (thumbHOff > 0) thumbResourceOff.height = thumbHOff;
        if (thumbWOff === 0) thumbWOff = thumbResourceOff.width;
        if (thumbHOff === 0) thumbHOff = thumbResourceOff.height;
    } 

    if (thumbImgOn && Assets.get(thumbImgOn)) {
        thumbResourceOn = new Sprite(Assets.get(thumbImgOn));
        if (thumbWOn > 0) thumbResourceOn.width = thumbWOn;
        if (thumbHOn > 0) thumbResourceOn.height = thumbHOn;
        if (thumbWOn === 0) thumbWOn = thumbResourceOn.width;
        if (thumbHOn === 0) thumbHOn = thumbResourceOn.height;
    }

    if (!thumbResourceOff) {
        const g = new Graphics();
        g.circle(0, 0, 1).fill({ color: 0xffffff, alpha: 0 }); // invisible thumb
        thumbResourceOff = g;
        thumbResourceOn = g;
        thumbWOff = 1; thumbHOff = 1;
        thumbWOn = 1; thumbHOn = 1;
    }
    if (!thumbResourceOn) {
        thumbResourceOn = thumbResourceOff;
        thumbWOn = thumbWOff;
        thumbHOn = thumbHOff;
    }

    const sliderContainer = new Container();
    sliderContainer.eventMode = 'dynamic';
    sliderContainer.hitArea = new Rectangle(0, 0, node.w, node.h);

    const isVertical = node.h > node.w;
    const invert = node.attributes.invert === "1" || node.attributes.invert === "True";

    let activeImg = (onImg && Assets.get(onImg)) ? onImg : null;
    if (!onTheme && offImg && Assets.get(offImg)) {
        activeImg = offImg;
    }
    
    let fillResource: Sprite | Graphics;
    if (activeImg && Assets.get(activeImg)) {
        const onSprite = new Sprite(Assets.get(activeImg));
        onSprite.width = node.w;
        onSprite.height = node.h;
        fillResource = onSprite;
    } else {
        fillResource = new Graphics();
        fillResource.rect(0, 0, node.w, node.h).fill({ color: 0xffffff, alpha: 0 });
    }

    sliderContainer.addChild(bgResource);
    sliderContainer.addChild(fillResource);

    // Create a mask for the fill
    const fillMask = new Graphics();
    sliderContainer.addChild(fillMask);
    fillResource.mask = fillMask;

    const thumbContainer = new Container();
    thumbContainer.addChild(thumbResourceOff);
    thumbResourceOff.visible = true;
    if (thumbResourceOn !== thumbResourceOff) {
        thumbContainer.addChild(thumbResourceOn);
        thumbResourceOn.visible = false;
    }
    sliderContainer.addChild(thumbContainer);
    
    container.addChild(sliderContainer);
    
    // Determine min/max values
    const min = node.attributes.min ? parseFloat(node.attributes.min) : 0;
    const max = node.attributes.max ? parseFloat(node.attributes.max) : 65535;
    
    const getFormattedValue = (rawVal: number) => {
        const progress = rawVal / 65535;
        const scaledVal = min + progress * (max - min);
        let formattedVal = scaledVal.toString();
        const decimals = parseInt(node.attributes.decimals || "0", 10);
        if (!isNaN(decimals) && decimals >= 0) {
            formattedVal = scaledVal.toFixed(decimals);
        }
        return formattedVal;
    };
    
    let currentRawValue = node.j ? ((joinStore.get(node.j, "a") as number) || 0) : 0;
    let isDraggingGauge = false;
    
    const updateVisuals = (rawVal: number, isPressed: boolean) => {
        rawVal = Math.max(0, Math.min(65535, rawVal));
        const progress = rawVal / 65535;
        
        fillMask.clear();
        if (isVertical) {
            const h = node.h * progress;
            if (invert) {
                fillMask.rect(0, 0, node.w, h).fill(0xffffff);
                thumbContainer.y = h;
            } else {
                fillMask.rect(0, node.h - h, node.w, h).fill(0xffffff);
                thumbContainer.y = node.h - h;
            }
            thumbContainer.x = node.w / 2;
        } else {
            const w = node.w * progress;
            if (invert) {
                fillMask.rect(node.w - w, 0, w, node.h).fill(0xffffff);
                thumbContainer.x = node.w - w;
            } else {
                fillMask.rect(0, 0, w, node.h).fill(0xffffff);
                thumbContainer.x = w;
            }
            thumbContainer.y = node.h / 2;
        }
        
        if (thumbResourceOff) {
             thumbResourceOff.visible = !isPressed;
             if (thumbResourceOff instanceof Sprite) {
                 thumbResourceOff.x = -thumbWOff / 2;
                 thumbResourceOff.y = -thumbHOff / 2;
             }
        }
        if (thumbResourceOn && thumbResourceOn !== thumbResourceOff) {
             thumbResourceOn.visible = isPressed;
             if (thumbResourceOn instanceof Sprite) {
                 thumbResourceOn.x = -thumbWOn / 2;
                 thumbResourceOn.y = -thumbHOn / 2;
             }
        }
    };

    updateVisuals(currentRawValue, false);

    const emitUpdate = (rawVal: number) => {
        rawVal = Math.round(rawVal) || 0;
        const safeRawVal = Number.isNaN(rawVal) ? 0 : rawVal;
        currentRawValue = safeRawVal;
        
        if (node.j) joinStore.set(node.j, "a", safeRawVal);
        
        const formattedVal = getFormattedValue(safeRawVal);

        if (node.dragCmd && renderer.cfApi?.runCommand) {
            renderer.cfApi.runCommand("", node.dragCmd, formattedVal);
        }
        if (renderer.cfApi && node.j) {
            const nj = getNormJoin("a", node.j);
            // Notice we dispatch the RAW val for standard join events, but wait...
            // Legacy apps expect scaledVal or raw value? usually CF passes raw value unless format tokens are used
            if (nj) renderer.cfApi.dispatchEvent(renderer.cfApi.ObjectDraggedEvent, nj, safeRawVal);
        }
    };
    
    const handlePointerMove = (e: any) => {
        if (!isDraggingGauge) return;
        const localPos = sliderContainer.toLocal(e.global);
        let progress = 0;
        if (isVertical) {
            progress = invert ? (localPos.y / node.h) : (1 - (localPos.y / node.h));
        } else {
            progress = invert ? (1 - (localPos.x / node.w)) : (localPos.x / node.w);
        }
        progress = Math.max(0, Math.min(1, progress));
        const rawVal = progress * 65535;
        
        updateVisuals(rawVal, isDraggingGauge);
        emitUpdate(rawVal);
    };

    const handleUp = () => {
        if (!isDraggingGauge) return;
        isDraggingGauge = false;
        
        sliderContainer.off('globalpointermove', handlePointerMove);
        window.removeEventListener('pointerup', handleUp);
        
        updateVisuals(currentRawValue, false);
        
        if (node.releaseCmd && renderer.cfApi?.runCommand) {
            renderer.cfApi.runCommand("", node.releaseCmd, getFormattedValue(currentRawValue));
        }
        if (renderer.cfApi && node.j) {
            const nj = getNormJoin("a", node.j);
            if (nj) renderer.cfApi.dispatchEvent(renderer.cfApi.ObjectReleasedEvent, nj, joinStore.get(node.j, "a"));
        }
    };

    sliderContainer.on('pointerdown', (e: any) => {
        if (node.type === "gauge") return; // Gauges are usually read-only
        isDraggingGauge = true;
        
        if (node.pressCmd && renderer.cfApi?.runCommand) {
            renderer.cfApi.runCommand("", node.pressCmd, getFormattedValue(currentRawValue));
        }
        if (renderer.cfApi && node.j) {
            const nj = getNormJoin("a", node.j);
            if (nj) renderer.cfApi.dispatchEvent(renderer.cfApi.ObjectPressedEvent, nj, joinStore.get(node.j, "a"));
        }
        
        sliderContainer.on('globalpointermove', handlePointerMove);
        window.addEventListener('pointerup', handleUp);
        
        handlePointerMove(e);
    });
    
    sliderContainer.on('pointerup', handleUp);
    sliderContainer.on('pointerupoutside', handleUp);
    sliderContainer.on('destroyed', () => {
        window.removeEventListener('pointerup', handleUp);
    });

    if (node.j) {
        joinStore.on(node.j, "a", (val: any) => {
            if (container.destroyed) return;
            if (!isDraggingGauge) {
                const v = typeof val === "number" ? val : (parseInt(val as string || "0", 10) || 0);
                updateVisuals(v, false);
                currentRawValue = v;
            }
        }, renderer.currentScope ?? undefined);
    }
}

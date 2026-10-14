import { Container, Sprite, Graphics, Text, TextStyle, NineSliceSprite, Assets } from "pixi.js";
import { TokenEngine } from "../tokenEngine";
import { Button } from '@pixi/ui';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';

export function renderButton(
    node: CFNode,
    container: Container,
    renderer: CFRenderer,
    getNormJoin: (type: string, j: string | undefined) => string | null,
    cssState0: any,
    cssState1: any,
    listPrefix?: string,
    listIndex?: number
) {
    const getTextStyle = (css: any) => {
        let styleProps: any = {
            fill: '#ffffff',
            fontSize: 16,
            wordWrap: true,
            wordWrapWidth: node.w || 100,
            align: 'center'
        };
        if (css?.["color"]) styleProps.fill = css["color"];
        if (css?.["font-size"]) styleProps.fontSize = parseInt(css["font-size"]) || 16;
        if (css?.["font-family"]) styleProps.fontFamily = css["font-family"].replace(/['"]/g, '');
        if (css?.["text-align"]) styleProps.align = css["text-align"];

        if (node.attributes?.overrideFontAlignmentH) {
            styleProps.align = node.attributes.overrideFontAlignmentH;
        }

        if (css?.["text-shadow"]) {
            try {
                const shadowConf = css["text-shadow"].split(") ");
                if (shadowConf.length === 2) {
                    const color = shadowConf[0] + ")";
                    const parts = shadowConf[1].trim().split(" ");
                    styleProps.dropShadow = {
                        color,
                        alpha: 1,
                        blur: parseInt(parts[2]) || 0,
                        distance: Math.abs(parseInt(parts[1])) || Math.abs(parseInt(parts[0])) || 2,
                        angle: parseInt(parts[1]) < 0 ? -Math.PI / 2 : Math.PI / 2
                    };
                }
            } catch (e) { }
        }
        return new TextStyle(styleProps);
    };

    const createView = (img: string | null, css: any) => {
        let v: Sprite | NineSliceSprite | Graphics;
        // Parse background-color if any
        let bgColor = 0x0;
        let bgAlpha = 0;
        if (css?.["background-color"]) {
            const bgc = css["background-color"];
            if (bgc.startsWith('#')) {
                bgColor = parseInt(bgc.replace('#', '0x'), 16);
                bgAlpha = 1;
            } else if (bgc.startsWith('rgba')) {
                // handle rgba
                const rgba = bgc.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
                if (rgba) {
                    bgColor = (parseInt(rgba[1]) << 16) | (parseInt(rgba[2]) << 8) | parseInt(rgba[3]);
                    bgAlpha = parseFloat(rgba[4]);
                }
            } else if (bgc.startsWith('rgb')) {
                const rgb = bgc.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (rgb) {
                    bgColor = (parseInt(rgb[1]) << 16) | (parseInt(rgb[2]) << 8) | parseInt(rgb[3]);
                    bgAlpha = 1;
                }
            }
        }
        if (css?.["opacity"] !== undefined) {
            bgAlpha *= parseFloat(css["opacity"]);
        }

        if (img && Assets.get(img)) {
            if (css?.["-webkit-border-image"]) {
                const sliceInfo = css["-webkit-border-image"].split(" ");
                let l = 0, t = 0, r = 0, b = 0;
                if (sliceInfo.length >= 5) {
                    t = parseInt(sliceInfo[1]) || 0;
                    r = parseInt(sliceInfo[2]) || 0;
                    b = parseInt(sliceInfo[3]) || 0;
                    l = parseInt(sliceInfo[4]) || 0;
                }
                try {
                    v = new NineSliceSprite({
                        texture: Assets.get(img),
                        leftWidth: l, rightWidth: r, topHeight: t, bottomHeight: b,
                        width: node.w, height: node.h
                    });
                } catch (e) {
                    v = new Sprite(Assets.get(img));
                    v.width = node.w;
                    v.height = node.h;
                }
            } else {
                v = new Sprite(Assets.get(img));
                v.width = node.w;
                v.height = node.h;
            }
        } else {
            v = new Graphics().rect(0, 0, node.w, node.h).fill({ color: bgColor, alpha: bgAlpha });
        }
        return v;
    };

    const bgImg0 = renderer.getBgImage(cssState0?.["-webkit-border-image"] || cssState0?.["background-image"]);
    const bgImg1 = renderer.getBgImage(cssState1?.["-webkit-border-image"] || cssState1?.["background-image"]);

    const defaultView = createView(bgImg0, cssState0);
    const pressedView = cssState1 ? createView(bgImg1, cssState1) : undefined;
    const style0 = getTextStyle(cssState0);
    const style1 = cssState1 ? getTextStyle(cssState1) : style0;

    const inactiveNode = node.children?.find(c => c.type === "inactive");
    const activeNode = node.children?.find(c => c.type === "active");

    const inactiveImgNode = inactiveNode?.children?.find(c => c.type === "img");
    const activeImgNode = activeNode?.children?.find(c => c.type === "img");

    const getTex = (name: string) => {
        let t = Assets.get(name);
        if (!t) {
            const possibleKeys = Object.keys(renderer.imageMap);
            const foundKey = possibleKeys.find(k => k.toLowerCase() === name.toLowerCase());
            if (foundKey) t = Assets.get(foundKey);
        }
        return t;
    };

    let inactiveImgSprite: Sprite | null = null;
    let activeImgSprite: Sprite | null = null;

    if (inactiveImgNode && inactiveImgNode.text) {
        const t = getTex(inactiveImgNode.text);
        if (t) {
            inactiveImgSprite = new Sprite(t);
            inactiveImgSprite.x = inactiveImgNode.x || 0;
            inactiveImgSprite.y = inactiveImgNode.y || 0;
            if (inactiveImgNode.w) inactiveImgSprite.width = inactiveImgNode.w;
            if (inactiveImgNode.h) inactiveImgSprite.height = inactiveImgNode.h;
        }
    }

    if (activeImgNode && activeImgNode.text) {
        const t = getTex(activeImgNode.text);
        if (t) {
            activeImgSprite = new Sprite(t);
            activeImgSprite.x = activeImgNode.x || 0;
            activeImgSprite.y = activeImgNode.y || 0;
            if (activeImgNode.w) activeImgSprite.width = activeImgNode.w;
            if (activeImgNode.h) activeImgSprite.height = activeImgNode.h;
        }
    }

    const txtObj = new Text({
        text: node.inactiveText || "",
        style: style0
    });
    txtObj.x = node.w / 2;
    txtObj.y = node.h / 2;
    txtObj.anchor.set(0.5);

    const btnContainer = new Container();
    btnContainer.addChild(defaultView);
    if (inactiveImgSprite) btnContainer.addChild(inactiveImgSprite);
    
    if (pressedView) {
        btnContainer.addChild(pressedView);
        pressedView.visible = false;
    }
    if (activeImgSprite) {
        btnContainer.addChild(activeImgSprite);
        activeImgSprite.visible = false;
    }
    
    btnContainer.addChild(txtObj);
    container.addChild(btnContainer);

    const btn = new Button(btnContainer);

    let isBtnDown = false;
    let localToggled = false;
    let isToggled = (node.j && node.j !== "0") ? !!joinStore.get(node.j, "d") : false;

    const reflectState = () => {
        let isActive = false;
        if (node.j && node.j !== "0") {
            isActive = isToggled;
        } else {
            if (node.sim === "2") isActive = localToggled;
            else if (node.sim === "1") isActive = isBtnDown;
            else isActive = false; // sim == "0" means programmatic only
        }

        if (isActive) {
            if (pressedView) pressedView.visible = true;
            if (pressedView) defaultView.visible = false;
            
            if (activeImgSprite) activeImgSprite.visible = true;
            if (inactiveImgSprite && activeImgSprite) inactiveImgSprite.visible = false;
            
            if (txtObj) txtObj.style = style1;
        } else {
            if (pressedView) pressedView.visible = false;
            defaultView.visible = true;
            
            if (activeImgSprite) activeImgSprite.visible = false;
            if (inactiveImgSprite) inactiveImgSprite.visible = true;
            
            if (txtObj) txtObj.style = style0;
        }

        if (txtObj) {
            let dynamicText;
            if (isActive) {
                if (node.active_s && node.active_s !== "0") {
                    if (joinStore.has(node.active_s, "s")) dynamicText = joinStore.get(node.active_s, "s");
                }
                if (dynamicText === undefined) {
                    dynamicText = node.activeText !== undefined ? node.activeText : (node.inactiveText || "");
                }
            } else {
                if (node.inactive_s && node.inactive_s !== "0") {
                    if (joinStore.has(node.inactive_s, "s")) dynamicText = joinStore.get(node.inactive_s, "s");
                }
                if (dynamicText === undefined) {
                    dynamicText = node.inactiveText || "";
                }
            }

            let rawStr = String(dynamicText);
            // Replace tokens if string contains '['
            if (rawStr.includes('[')) {
                txtObj.text = TokenEngine.replaceTokens(rawStr, renderer.cfApi as any, { list: (node as any).listJoin, index: (node as any).listIndex });
            } else {
                txtObj.text = rawStr;
            }
        }
    };

    reflectState();

    // Listen to tokens if text contains tokens
    const textHasTokens = (node.inactiveText && node.inactiveText.includes('[')) || (node.activeText && node.activeText.includes('['));
    let tokenWatcher: (() => void) | null = null;
    if (textHasTokens && renderer.cfApi) {
        tokenWatcher = () => {
            if (container.destroyed) return;
            reflectState();
        };
        (renderer.cfApi as any).watch("TokenChangedEvent", tokenWatcher);
    }

    let repeatInterval: ReturnType<typeof setInterval> | null = null;
    let activePressTimers: ReturnType<typeof setTimeout>[] = [];
    let activeRepeatTimers: ReturnType<typeof setInterval>[] = [];
    let currentActionGroupIndex = 0;

    const stopRepeat = () => {
        if (repeatInterval) {
            clearInterval(repeatInterval);
            repeatInterval = null;
        }
        activePressTimers.forEach(clearTimeout);
        activePressTimers = [];
        activeRepeatTimers.forEach(clearInterval);
        activeRepeatTimers = [];
    };

    container.on('destroyed', () => {
        stopRepeat();
        if (tokenWatcher) {
            (renderer.cfApi as any).unwatch("TokenChangedEvent", tokenWatcher);
        }
    });

    const actionsNode = node.children ? node.children.find(c => c.type === "actions") : null;
    const actionGroups = actionsNode ? actionsNode.children.filter(c => c.type === "action") : [];

    const executeActionNode = (actionNode: CFNode) => {
        if (actionNode.attributes.js) {
            try {
                let joinVal = "";
                let valueVal: any = false;
                let tokensVal: any = {};
                let listVal: string | null = null;
                let listIndexVal: number | null = null;

                if (listPrefix && listIndex !== undefined && listIndex !== -1) {
                    listVal = listPrefix;
                    listIndexVal = listIndex;
                }

                if (node.j && node.j !== "0") {
                    joinVal = getNormJoin("d", node.j) || node.j;
                    const parsed = renderer.cfApi?.parseJoin(joinVal);
                    if (parsed) {
                        valueVal = joinStore.get(parsed.id, parsed.type);
                    } else {
                        valueVal = joinStore.get(node.j, "d");
                    }
                    if (renderer.cfApi?.tokensStore) {
                        tokensVal = renderer.cfApi.tokensStore[joinVal] || {};
                    }
                }
                const parts = joinVal.split(":");
                const localJoinVal = parts[parts.length - 1];
                const func = new Function("join", "value", "tokens", "list", "listIndex", actionNode.attributes.js);
                func.call(window, localJoinVal, valueVal, tokensVal, listVal, listIndexVal);
            } catch (e) {
                console.error("Error executing advanced action JS: ", e);
            }
        }
        if (actionNode.attributes.cmd && renderer.cfApi?.runCommand) {
            renderer.cfApi.runCommand("", actionNode.attributes.cmd);
        }
    };

    btn.onDown.connect(() => {
        if (node.sim === "1") {
            isBtnDown = true;
            if (node.j && node.j !== "0") {
                joinStore.set(node.j, "d", true);
            } else {
                reflectState();
            }
        } else if (node.sim === "2") {
            isBtnDown = true;
            if (!node.j || node.j === "0") {
                localToggled = !localToggled;
                reflectState();
            } else {
                const current = !!joinStore.get(node.j, "d");
                joinStore.set(node.j, "d", !current);
            }
        } else if (node.sim !== "0") {
            isBtnDown = true;
        }

        if (actionGroups.length > 0) {
            const currentGroup = actionGroups[currentActionGroupIndex];
            const pressActions = currentGroup.children.filter(c => c.type === "press");

            pressActions.forEach(pressNode => {
                const hold = parseInt(pressNode.attributes.hold || "0", 10);
                const delay = parseInt(pressNode.attributes.delay || "0", 10);
                const repeat = parseInt(pressNode.attributes.repeat || "0", 10);
                const totalDelay = hold + delay;

                if (totalDelay > 0) {
                    const timeoutId = setTimeout(() => {
                        executeActionNode(pressNode);
                        if (repeat > 0) {
                            const intervalId = setInterval(() => {
                                executeActionNode(pressNode);
                            }, repeat);
                            activeRepeatTimers.push(intervalId);
                        }
                    }, totalDelay);
                    activePressTimers.push(timeoutId);
                } else {
                    executeActionNode(pressNode);
                    if (repeat > 0) {
                        const intervalId = setInterval(() => {
                            executeActionNode(pressNode);
                        }, repeat);
                        activeRepeatTimers.push(intervalId);
                    }
                }
            });
        } else {
            // Basic actions (legacy)
            const executeBasicActions = () => {
                if (node.js) {
                    try {
                        let joinVal = "";
                        let valueVal: any = false;
                        let tokensVal: any = {};
                        let listVal: string | null = null;
                        let listIndexVal: number | null = null;

                        if (listPrefix && listIndex !== undefined && listIndex !== -1) {
                            listVal = listPrefix;
                            listIndexVal = listIndex;
                        }

                        if (node.j && node.j !== "0") {
                            joinVal = getNormJoin("d", node.j) || node.j;
                            const parsed = renderer.cfApi?.parseJoin(joinVal);
                            if (parsed) {
                                valueVal = joinStore.get(parsed.id, parsed.type);
                            } else {
                                valueVal = joinStore.get(node.j, "d");
                            }

                            if (renderer.cfApi?.tokensStore) {
                                tokensVal = renderer.cfApi.tokensStore[joinVal] || {};
                            }
                        }

                        const parts = joinVal.split(":");
                        const localJoinVal = parts[parts.length - 1];
                        const func = new Function("join", "value", "tokens", "list", "listIndex", node.js);
                        func.call(window, localJoinVal, valueVal, tokensVal, listVal, listIndexVal);
                    } catch (e) {
                        console.error("Error executing node.js code: ", e);
                    }
                }

                if (node.cmd && renderer.cfApi?.runCommand) {
                    renderer.cfApi.runCommand("", node.cmd);
                }

                if (node.pressCmd && renderer.cfApi?.runCommand) {
                    renderer.cfApi.runCommand("", node.pressCmd);
                }

                if (renderer.cfApi && node.j && node.j !== "0") {
                    const nj = getNormJoin("d", node.j);
                    if (nj) renderer.cfApi.dispatchEvent(renderer.cfApi.ObjectPressedEvent, nj, !!joinStore.get(node.j, "d"));
                }
            };

            executeBasicActions();

            if (node.repeatdelay && node.repeatdelay > 0) {
                stopRepeat();
                repeatInterval = setInterval(executeBasicActions, node.repeatdelay);
            }
        }
    });

    /** A list being dragged took the touch (a device cancels it): the press is undone, nothing is released. */
    const inDraggedList = (): boolean => {
        for (let p: Container | null = container.parent; p; p = p.parent) {
            if ((p as any).isDragging === 2) return true;
        }
        return false;
    };

    const handleUp = () => {
        stopRepeat();
        if (!isBtnDown && node.sim !== "0") return; // if sim!==0, we only care if we were down
        isBtnDown = false;

        if (node.sim === "1") {
            if (node.j && node.j !== "0") {
                joinStore.set(node.j, "d", false);
            } else {
                reflectState();
            }
        }

        if (inDraggedList()) return;

        if (actionGroups.length > 0) {
            const currentGroup = actionGroups[currentActionGroupIndex];
            const releaseActions = currentGroup.children.filter(c => c.type === "release");

            releaseActions.forEach(releaseNode => {
                const delay = parseInt(releaseNode.attributes.delay || "0", 10);
                if (delay > 0) {
                    setTimeout(() => executeActionNode(releaseNode), delay);
                } else {
                    executeActionNode(releaseNode);
                }
            });

            // Advance the cycle index for the next press
            currentActionGroupIndex = (currentActionGroupIndex + 1) % actionGroups.length;
        } else {
            // Basic actions (legacy)
            if (node.releaseCmd && renderer.cfApi?.runCommand) {
                renderer.cfApi.runCommand("", node.releaseCmd);
            }

            if (renderer.cfApi && node.j && node.j !== "0") {
                const nj = getNormJoin("d", node.j);
                if (nj) {
                    const val = !!joinStore.get(node.j, "d");
                    renderer.cfApi.dispatchEvent(renderer.cfApi.ObjectReleasedEvent, nj, val);
                }
            }
        }

        if (node.flip && node.flip !== "None") {
            renderer.navigate(node.flip);
        }
    };

    btn.onUp.connect(handleUp);
    btn.onUpOut.connect(handleUp);

    const checkSJoin = (jName: string | undefined) => {
        if (jName && jName !== "0") {
            joinStore.on(jName, "s", () => {
                if (container.destroyed) return;
                reflectState();
            }, renderer.currentScope ?? undefined);
        }
    };
    checkSJoin(node.active_s);
    checkSJoin(node.inactive_s);

    if (node.j && node.j !== "0") {
        joinStore.on(node.j, "d", (val) => {
            if (container.destroyed) return;
            isToggled = !!val;
            reflectState();
        }, renderer.currentScope ?? undefined);
    }
}

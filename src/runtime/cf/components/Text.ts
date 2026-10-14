import { Container, Text, TextStyle } from 'pixi.js';
import { TokenEngine } from '../tokenEngine';
import { CFNode } from '../parser';
import { joinStore } from '../joinStore';
import { CFRenderer } from '../renderer';

export function renderText(
    node: CFNode,
    container: Container,
    renderer: CFRenderer,
    getNormJoin: (type: string, j: string | undefined) => string | null,
    cssState0: any
) {
    const textJoin = (node.j && node.j !== "0") ? node.j : null;
    
    // Convert cssState0 to Pixi TextStyle
    const getTextStyle = (css: any) => {
        let styleProps: any = { 
            fill: '#ffffff', 
            fontSize: 16,
            wordWrap: true,
            wordWrapWidth: node.w || 100,
            align: 'left'
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
            } catch (e) {}
        }
        return new TextStyle(styleProps);
    };

    const style = getTextStyle(cssState0);

    const txtObj = new Text({ text: "", style });

    const reflectState = () => {
        let rawText = (textJoin && joinStore.has(textJoin, "s")) ? String(joinStore.get(textJoin, "s")) : (node.content || "");
        if (rawText.includes('[')) {
            txtObj.text = TokenEngine.replaceTokens(rawText, renderer.cfApi as any, { list: (node as any).listJoin, index: (node as any).listIndex });
        } else {
            txtObj.text = rawText;
        }
    };

    reflectState();

    // Handle standard layouting inside container
    // To match original behavior:
    txtObj.x = 0;
    txtObj.y = node.h / 2;
    txtObj.anchor.y = 0.5;
    
    if (style.align === "center") {
        txtObj.x = node.w / 2;
        txtObj.anchor.x = 0.5;
    } else if (style.align === "right") {
        txtObj.x = node.w;
        txtObj.anchor.x = 1;
    }

    container.addChild(txtObj);
    
    if (textJoin) {
        joinStore.on(textJoin, "s", (val) => {
            if (container.destroyed) return;
            reflectState();
        }, renderer.currentScope ?? undefined);
    }

    const textHasTokens = node.content && node.content.includes('[');
    if (textHasTokens && renderer.cfApi) {
        const tokenWatcher = () => {
            if (container.destroyed) return;
            reflectState();
        };
        (renderer.cfApi as any).watch("TokenChangedEvent", tokenWatcher);
        
        container.on('destroyed', () => {
            (renderer.cfApi as any).unwatch("TokenChangedEvent", tokenWatcher);
        });
    }
}

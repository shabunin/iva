import { Container, Text } from 'pixi.js';
import { placeText, textLayout } from './textStyle';
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
    
    // wrap="True": lines break at the box; else one line
    const layout = textLayout(cssState0, node.w || 100, node.attributes?.wrap === 'True', 'left', node.attributes?.overrideFontAlignmentH);
    const txtObj = new Text({ text: "", style: layout.style });

    const reflectState = () => {
        let rawText = (textJoin && joinStore.has(textJoin, "s")) ? String(joinStore.get(textJoin, "s")) : (node.content || "");
        if (rawText.includes('[')) {
            txtObj.text = TokenEngine.replaceTokens(rawText, renderer.cfApi as any, { list: (node as any).listJoin, index: (node as any).listIndex });
        } else {
            txtObj.text = rawText;
        }
    };

    reflectState();
    placeText(txtObj, layout, node.w, node.h);

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

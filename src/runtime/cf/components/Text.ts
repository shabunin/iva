import { Container, Text } from 'pixi.js';
import { fitText, placeText, textLayout, underline } from './textStyle';
import { TokenEngine } from '../tokenEngine';
import { CFNode } from '../parser';
import { joinStore, normalizeJoinString } from '../joinStore';
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
    // text never takes a touch in iViewer: it goes to what's under it (a button the text is on)
    txtObj.eventMode = 'none';
    container.hitArea = null;

    const reflectState = () => {
        let rawText = (textJoin && joinStore.has(textJoin, "s")) ? String(joinStore.get(textJoin, "s")) : (node.content || "");
        if (rawText.includes('[')) {
            // its join's tokens first (a list item's { value, tokens }), then the global ones
            const tokens = textJoin ? renderer.cfApi?.tokensStore?.[normalizeJoinString('s', textJoin)] : undefined;
            rawText = TokenEngine.replaceTokens(rawText, renderer.cfApi as any, { list: (node as any).listJoin, index: (node as any).listIndex, tokens });
        }
        // what the box can show: a value too long for any texture would draw as a black box
        txtObj.text = fitText(rawText, layout, node.w, node.h);
    };

    reflectState();
    placeText(txtObj, layout, node.w, node.h);

    container.addChild(txtObj);
    if (layout.underline) underline(txtObj, container);
    
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

import { CFContext } from './jsapi/types';
import { joinStore } from './joinStore';

export interface TokenContext {
    data?: string;
    list?: string;
    index?: number;
    top?: number;
    visible?: number;
    count?: number;
    join?: string;
}

function evaluateMathExpression(expr: string): number {
    let jsExpr = expr
        .replace(/\bmin\b/g, 'Math.min')
        .replace(/\bmax\b/g, 'Math.max')
        .replace(/\babs\b/g, 'Math.abs')
        .replace(/\bround\b/g, 'Math.round')
        .replace(/\bfloor\b/g, 'Math.floor')
        .replace(/\bceil\b/g, 'Math.ceil');
        
    const cleanExpr = jsExpr.replace(/Math\.(min|max|abs|round|floor|ceil)/g, '');
    if (/^[0-9+\-*/().,\s]*$/.test(cleanExpr)) {
        try {
            const result = new Function(`return (${jsExpr});`)();
            return typeof result === 'number' && !isNaN(result) ? result : 0;
        } catch (e) {
            console.error('Failed to evaluate math expression:', expr, e);
        }
    }
    return 0;
}

export class TokenEngine {
    /**
     * Replaces CF tokens in a string.
     * Handles:
     * - [tokenName] -> Global Token from e0
     * - [@join] -> Value of a specific join
     * - [@join:tokenName] -> Specific token of a specific join
     * - Predefined tokens like [sliderval], [inputval], [ipv4address], etc.
     */
    static replaceTokens(text: string, ctx: CFContext, contextData?: TokenContext): string {
        if (!text) return text;

        let resolved = text;
        if (text.indexOf('[') !== -1) {
            resolved = text.replace(/\[([^\]]+)\]/g, (match, tokenContent) => {
                // Check predefined contextual tokens
                if (tokenContent.toLowerCase() === 'sliderval' || tokenContent.toLowerCase() === 'inputval') {
                    return contextData?.data ?? '0';
                }
                if (tokenContent.toLowerCase() === 'ipv4address') return ctx.ipv4address || '0.0.0.0';
                if (tokenContent.toLowerCase() === 'ipv4netmask') return ctx.ipv4netmask || '0.0.0.0';
                if (tokenContent.toLowerCase() === 'macaddress') return ctx.MACaddress || '00:00:00:00:00:00';
                if (tokenContent.toLowerCase() === 'networkssid') return ctx.networkSSID || 'WIFI';

                // List context tokens
                if (contextData?.list) {
                    if (tokenContent.toLowerCase() === 'list_join') return contextData.list;
                    if (tokenContent.toLowerCase() === 'item_index') return String(contextData.index ?? 0);
                }

                // List scroll contextual tokens
                if (tokenContent.toLowerCase() === 'join') return contextData?.join ?? '';
                if (tokenContent.toLowerCase() === 'top') return String(contextData?.top ?? 0);
                if (tokenContent.toLowerCase() === 'visible') return String(contextData?.visible ?? 0);
                if (tokenContent.toLowerCase() === 'count') return String(contextData?.count ?? 0);

                // Check [@join] or [@join:token]
                if (tokenContent.startsWith('@')) {
                    const parts = tokenContent.substring(1).split(':');
                    const join = parts[0];
                    if (parts.length === 1) {
                        const parsed = (ctx as any).parseJoin ? (ctx as any).parseJoin(join) : null;
                        if (parsed) {
                            const raw = joinStore.get(parsed.id, parsed.type);
                            if (raw !== undefined) return String(raw);
                        }
                        return ''; 
                    } else if (parts.length >= 2) {
                        const tokenName = parts.slice(1).join(':');
                        const joinTokens = ctx.tokensStore[join];
                        if (joinTokens && joinTokens[`[${tokenName}]`] !== undefined) {
                            return joinTokens[`[${tokenName}]`];
                        }
                        if (joinTokens && joinTokens[tokenName] !== undefined) {
                            return joinTokens[tokenName];
                        }
                    }
                }

                // Fallback to Global Tokens
                const globalTokens = ctx.tokensStore['e0'];
                if (globalTokens) {
                    if (globalTokens[match] !== undefined) return globalTokens[match];
                    if (globalTokens[tokenContent] !== undefined) return globalTokens[tokenContent];
                }

                return match;
            });
        }

        // Evaluate math expressions: {{ expression }}
        if (resolved.indexOf('{{') !== -1) {
            resolved = resolved.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
                return String(evaluateMathExpression(expr));
            });
        }

        return resolved;
    }
}

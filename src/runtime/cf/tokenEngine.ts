import { CFContext } from './jsapi/types';
import { joinStore } from './joinStore';
import { evaluateMath } from './mathExpr';

export interface TokenContext {
    data?: string;
    /** the object's own tokens (its join's): before the global ones */
    tokens?: Record<string, string>;
    list?: string;
    index?: number;
    top?: number;
    visible?: number;
    count?: number;
    join?: string;
}

/** {{ }}: iViewer's math (see mathExpr); one it can't read is 0, as before */
function evaluateMathExpression(expr: string): number {
    try {
        const v = evaluateMath(expr);
        return Number.isFinite(v) ? v : 0;
    } catch (e) {
        console.error('Failed to evaluate math expression:', expr, (e as Error).message);
        return 0;
    }
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
                            // a digital join as scripts see it: "1" / "0"
                            if (typeof raw === 'boolean') return raw ? '1' : '0';
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

                // The object's own tokens, then the global ones
                const own = contextData?.tokens;
                if (own) {
                    if (own[match] !== undefined) return own[match];
                    if (own[tokenContent] !== undefined) return own[tokenContent];
                }
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

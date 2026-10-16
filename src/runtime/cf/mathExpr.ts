/**
 * iViewer's math in {{ }} (and a feedback's transform), as CommandFusion's
 * wiki lists it - lowest priority first: and / or / xor; <= >= != == > <;
 * + -; * / %; ^ (power); and `t ? a : b`. Functions (angles in radians):
 * dtor rtod sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh,
 * log ln log2 log10 exp sqrt abs sign trunc rint near round ceil floor,
 * min max sum avg (any number of arguments), if(t, a, b). Variables: what
 * the caller gives (a transform's `value`). Parsed, never eval'd.
 */

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
    dtor: (a) => (a * Math.PI) / 180,
    rtod: (a) => (a * 180) / Math.PI,
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
    log: Math.log, ln: Math.log, log2: Math.log2, log10: Math.log10,
    exp: Math.exp, sqrt: Math.sqrt, abs: Math.abs, sign: Math.sign,
    trunc: Math.trunc, rint: (a) => Math.round(a), near: (a) => Math.round(a),
    round: (a) => Math.round(a), ceil: Math.ceil, floor: Math.floor,
    min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
    sum: (...a) => a.reduce((s, n) => s + n, 0),
    avg: (...a) => (a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0),
    if: (t, a, b) => (t ? a : b),
};

type Token = { kind: 'num'; v: number } | { kind: 'name'; v: string } | { kind: 'op'; v: string };

function tokenize(src: string): Token[] {
    const out: Token[] = [];
    const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|!=|==|&&|\|\||[-+*/%^()<>,?:!]))/y;
    let at = 0;
    while (at < src.length) {
        if (/^\s*$/.test(src.slice(at))) break;
        re.lastIndex = at;
        const m = re.exec(src);
        if (!m) throw new Error(`unexpected "${src.slice(at).trim().slice(0, 12)}"`);
        at = re.lastIndex;
        if (m[1] !== undefined) out.push({ kind: 'num', v: parseFloat(m[1]) });
        else if (m[2] !== undefined) {
            const word = m[2].toLowerCase();
            if (word === 'and' || word === 'or' || word === 'xor') out.push({ kind: 'op', v: word });
            else out.push({ kind: 'name', v: m[2] });
        } else out.push({ kind: 'op', v: m[3] === '&&' ? 'and' : m[3] === '||' ? 'or' : m[3] });
    }
    return out;
}

/** The value of an expression; throws on one it can't read. */
export function evaluateMath(src: string, vars: Record<string, number> = {}): number {
    const tokens = tokenize(src);
    let i = 0;
    const peek = () => tokens[i];
    const isOp = (v: string) => peek()?.kind === 'op' && peek()!.v === v;
    const expect = (v: string) => {
        if (!isOp(v)) throw new Error(`"${v}" expected`);
        i++;
    };

    const ternary = (): number => {
        const t = logical();
        if (!isOp('?')) return t;
        i++;
        const a = ternary();
        expect(':');
        const b = ternary();
        return t ? a : b;
    };
    const logical = (): number => {
        let v = conjunction();
        while (isOp('or') || isOp('xor')) {
            const op = tokens[i++].v;
            const r = conjunction();
            v = op === 'or' ? Number(!!v || !!r) : Number(!!v !== !!r);
        }
        return v;
    };
    const conjunction = (): number => {
        let v = comparison();
        while (isOp('and')) {
            i++;
            const r = comparison();
            v = Number(!!v && !!r);
        }
        return v;
    };
    const comparison = (): number => {
        let v = additive();
        for (;;) {
            const t = peek();
            if (t?.kind !== 'op' || !['<=', '>=', '!=', '==', '<', '>'].includes(t.v)) return v;
            i++;
            const r = additive();
            v = Number(t.v === '<=' ? v <= r : t.v === '>=' ? v >= r : t.v === '!=' ? v !== r : t.v === '==' ? v === r : t.v === '<' ? v < r : v > r);
        }
    };
    const additive = (): number => {
        let v = multiplicative();
        while (isOp('+') || isOp('-')) {
            const op = tokens[i++].v;
            const r = multiplicative();
            v = op === '+' ? v + r : v - r;
        }
        return v;
    };
    const multiplicative = (): number => {
        let v = unary();
        while (isOp('*') || isOp('/') || isOp('%')) {
            const op = tokens[i++].v;
            const r = unary();
            v = op === '*' ? v * r : op === '/' ? v / r : v % r;
        }
        return v;
    };
    const unary = (): number => {
        if (isOp('-')) {
            i++;
            return -unary();
        }
        if (isOp('+')) {
            i++;
            return unary();
        }
        if (isOp('!')) {
            i++;
            return Number(!unary());
        }
        return power();
    };
    const power = (): number => {
        const base = primary();
        if (!isOp('^')) return base;
        i++;
        return Math.pow(base, unary());
    };
    const primary = (): number => {
        const t = tokens[i++];
        if (!t) throw new Error('unexpected end');
        if (t.kind === 'num') return t.v;
        if (t.kind === 'op' && t.v === '(') {
            const v = ternary();
            expect(')');
            return v;
        }
        if (t.kind === 'name') {
            const name = t.v.toLowerCase();
            if (isOp('(')) {
                const fn = FUNCTIONS[name];
                if (!fn) throw new Error(`no function ${t.v}()`);
                i++;
                const args: number[] = [];
                if (!isOp(')')) {
                    args.push(ternary());
                    while (isOp(',')) {
                        i++;
                        args.push(ternary());
                    }
                }
                expect(')');
                return fn(...args);
            }
            if (t.v in vars) return vars[t.v];
            if (name in vars) return vars[name];
            if (name === 'pi') return Math.PI;
            if (name === 'e') return Math.E;
            throw new Error(`unknown "${t.v}"`);
        }
        throw new Error(`unexpected "${t.v}"`);
    };

    const v = ternary();
    if (i < tokens.length) throw new Error(`unexpected "${(tokens[i] as Token).v}"`);
    return v;
}

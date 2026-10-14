/**
 * Writing JSX: a tiny element model and a printer that keeps it readable
 * (props on one line when they fit, strings as "..." when JSX allows).
 */

export type PropValue = string | number | boolean | null | undefined | PropValue[] | { [k: string]: PropValue } | Code;

/** A JS expression written as is. */
export class Code {
  constructor(public code: string) {}
}

export interface JNode {
  type: string;
  props: [string, PropValue][];
  children: (JNode | Code)[];
}

export function j(type: string, props: [string, PropValue][] = [], children: (JNode | Code)[] = []): JNode {
  const out: [string, PropValue][] = [];
  for (const [k, v] of props) {
    if (v === undefined) continue;
    // several xml={{}} parts: one prop (<Raw xml="..."> is a string, left alone)
    const isAttrs = k === 'xml' && typeof v === 'object' && v !== null && !(v instanceof Code);
    const prev = isAttrs ? out.find(([pk, pv]) => pk === 'xml' && typeof pv === 'object') : undefined;
    if (prev) prev[1] = { ...(prev[1] as object), ...(v as object) };
    else out.push([k, isAttrs ? { ...(v as object) } : v]);
  }
  return { type, props: out, children };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A JS literal for a value. */
export function literal(v: PropValue, indent = ''): string {
  if (v instanceof Code) return v.code;
  if (v === null) return 'null';
  // multi-line text reads better as a template literal (when it has nothing a template would interpret)
  if (typeof v === 'string') return /\n/.test(v) && !/[`\\]|\$\{/.test(v) ? `\`${v}\`` : JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const items = v.map((x) => literal(x, indent + '  '));
    const one = `[${items.join(', ')}]`;
    if (one.length <= 80 && !one.includes('\n')) return one;
    return `[\n${items.map((x) => `${indent}  ${x},`).join('\n')}\n${indent}]`;
  }
  if (v && typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    const items = entries.map(([k, x]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${literal(x, indent + '  ')}`);
    const one = `{ ${items.join(', ')} }`;
    if (!items.length) return '{}';
    if (one.length <= 80 && !one.includes('\n')) return one;
    return `{\n${items.map((x) => `${indent}  ${x},`).join('\n')}\n${indent}}`;
  }
  return 'undefined';
}

/** A prop as JSX: name="text" when JSX reads the text back unchanged, else name={...}. */
function prop(name: string, v: PropValue, indent: string): string {
  if (v === true) return name;
  // JSX attribute strings decode &entities; and can't hold " or newlines
  if (typeof v === 'string' && !/["\n\r&{}]/.test(v) && !/^\s|\s$/.test(v) && v.length < 200) return `${name}="${v}"`;
  return `${name}={${literal(v, indent)}}`;
}

export function print(node: JNode | Code, indent = ''): string {
  if (node instanceof Code) return `${indent}${node.code}`;
  const parts = node.props.map(([k, v]) => prop(k, v, indent + '  '));
  const inline = `<${node.type}${parts.length ? ' ' + parts.join(' ') : ''}`;
  // one prop stays on the tag's line, even a multi-line one (<Raw xml={`...`} />)
  const head = parts.length === 1 || (inline.length + indent.length <= 120 && !inline.includes('\n'))
    ? inline
    : `<${node.type}\n${parts.map((p) => `${indent}  ${p}`).join('\n')}\n${indent}`;
  if (!node.children.length) return `${indent}${head}${head.endsWith('\n' + indent) ? '/>' : ' />'}`;
  const kids = node.children.map((c) => print(c, indent + '  ')).join('\n');
  return `${indent}${head}>\n${kids}\n${indent}</${node.type}>`;
}

/** A valid, readable JS identifier from a name. */
export function identifier(name: string, suffix: string, taken: Set<string>): string {
  let base = name.replace(/[^A-Za-z0-9_$]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ''));
  if (!base || /^\d/.test(base)) base = `_${base}`;
  base = base[0].toUpperCase() + base.slice(1) + suffix;
  let id = base;
  for (let n = 2; taken.has(id.toLowerCase()); n++) id = `${base}${n}`;
  taken.add(id.toLowerCase());
  return id;
}

/** A file name from a name (unique, case-insensitively). */
export function fileName(name: string, taken: Set<string>): string {
  const base = name.replace(/[^\w.-]+/g, '_').replace(/^\.+/, '') || 'unnamed';
  let f = base;
  for (let n = 2; taken.has(f.toLowerCase()); n++) f = `${base}_${n}`;
  taken.add(f.toLowerCase());
  return f;
}

/**
 * The .gui as an XML tree, and its serialization the way GUI Designer writes
 * it: UTF-8 declaration, two-space indent, one element per line, theme CSS in
 * CDATA. Attributes keep the order they were added in.
 */

export interface XNode {
  tag: string;
  attrs: [string, string][];
  children: XNode[];
  /** text content (escaped) */
  text?: string;
  /** text content written as CDATA */
  cdata?: string;
}

export type AttrValue = string | number | boolean | null | undefined;

export function el(tag: string, attrs: Record<string, AttrValue> = {}, children: XNode[] = [], text?: string): XNode {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    out.push([k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)]);
  }
  return { tag, attrs: out, children, text };
}

const escAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/\r/g, '&#13;').replace(/\n/g, '&#10;').replace(/\t/g, '&#9;');
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function write(node: XNode, depth: number, out: string[]) {
  const pad = '  '.repeat(depth);
  const attrs = node.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  if (node.cdata !== undefined) {
    out.push(`${pad}<${node.tag}${attrs}><![CDATA[${node.cdata.replace(/]]>/g, ']]]]><![CDATA[>')}]]></${node.tag}>`);
  } else if (node.children.length === 0) {
    out.push(node.text !== undefined && node.text !== ''
      ? `${pad}<${node.tag}${attrs}>${escText(node.text)}</${node.tag}>`
      : `${pad}<${node.tag}${attrs} />`);
  } else {
    // text and child elements together: text first (a <btn>'s <inactive> never has both)
    out.push(`${pad}<${node.tag}${attrs}>${node.text ? escText(node.text) : ''}`);
    for (const c of node.children) write(c, depth + 1, out);
    out.push(`${pad}</${node.tag}>`);
  }
}

export function serialize(root: XNode): string {
  const out = ['<?xml version="1.0" encoding="utf-8"?>'];
  write(root, 0, out);
  return out.join('\r\n') + '\r\n';
}

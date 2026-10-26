/**
 * The .gui as an XML tree, and its serialization the way GUI Designer writes
 * it: UTF-8 declaration, two-space indent, one element per line (one with text
 * and child elements, all on its line), theme CSS in CDATA. Attributes keep
 * the order they were added in.
 */

import { DOMParser } from '@xmldom/xmldom';

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
// a CR as &#13;: XML reads a raw one as LF
const escText = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#13;');

const attrsOf = (node: XNode) => node.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');

/** An element on one line, nothing added between its parts. */
function inline(node: XNode): string {
  const attrs = attrsOf(node);
  if (node.cdata !== undefined) return `<${node.tag}${attrs}><![CDATA[${node.cdata.replace(/]]>/g, ']]]]><![CDATA[>')}]]></${node.tag}>`;
  if (!node.children.length && !node.text) return `<${node.tag}${attrs} />`;
  return `<${node.tag}${attrs}>${node.text ? escText(node.text) : ''}${node.children.map(inline).join('')}</${node.tag}>`;
}

function write(node: XNode, depth: number, out: string[]) {
  const pad = '  '.repeat(depth);
  if (node.cdata !== undefined || node.children.length === 0 || node.text) {
    // text and child elements together too: inline, as GUI Designer writes them - whitespace there would be text
    // (iViewer shows every character of a button's <inactive>: '\n\nUNLOCK<img>' puts the text under its icon)
    out.push(pad + inline(node));
  } else {
    out.push(`${pad}<${node.tag}${attrsOf(node)}>`);
    for (const c of node.children) write(c, depth + 1, out);
    out.push(`${pad}</${node.tag}>`);
  }
}

export function serialize(root: XNode): string {
  const out = ['<?xml version="1.0" encoding="utf-8"?>'];
  write(root, 0, out);
  return out.join('\r\n') + '\r\n';
}

/** a button state's text, every character of it: iViewer shows them all (its lines centred) */
export const EXACT_TEXT = new Set(['inactive', 'active']);

/** DOM element -> XNode (whitespace-only text dropped, mixed text trimmed - not a button state's). */
export function fromDom(e: Element): XNode {
  const node: XNode = { tag: e.tagName, attrs: [], children: [] };
  for (let i = 0; i < e.attributes.length; i++) node.attrs.push([e.attributes[i].name, e.attributes[i].value]);
  let text = '';
  let cdata: string | undefined;
  for (let i = 0; i < e.childNodes.length; i++) {
    const c = e.childNodes[i];
    if (c.nodeType === 1) node.children.push(fromDom(c as Element));
    else if (c.nodeType === 4) cdata = (cdata ?? '') + c.nodeValue;
    else if (c.nodeType === 3) text += c.nodeValue ?? '';
  }
  if (cdata !== undefined) node.cdata = cdata;
  else if (text.trim()) node.text = node.children.length && !EXACT_TEXT.has(e.tagName) ? text.trim() : text;
  return node;
}

/** Parse XML (a document, or several elements) into XNodes. */
export function parseXml(xml: string): XNode[] {
  const errors: string[] = [];
  const doc = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level !== 'warning') errors.push(msg);
    },
  }).parseFromString(`<iva-root>${xml.replace(/^\uFEFF/, '').replace(/^<\?xml[^>]*\?>/, '')}</iva-root>`, 'text/xml');
  if (errors.length) throw new Error(`bad XML: ${errors[0]}`);
  const root = doc.documentElement as unknown as Element;
  const out: XNode[] = [];
  for (let i = 0; i < root.childNodes.length; i++) if (root.childNodes[i].nodeType === 1) out.push(fromDom(root.childNodes[i] as Element));
  return out;
}

/**
 * Are two .gui files the same project? Formatting, attribute order and the
 * order of the top-level sections don't count; themes are compared by name
 * (`.x` and `.x[state='0']` are the same theme state); GUI Designer's
 * <designer> line is ignored. Everything else must match.
 */

import { parseXml, type XNode } from '../compiler/xml.js';

const norm = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function themeKey(name: string) {
  const m = /^\.?([^[]*)(?:\[state='(\d+)'\])?$/.exec(name);
  return m ? `${m[1]}[${m[2] ?? '0'}]` : name;
}

export interface Diff {
  /** the element in the first document (undefined: a whole section / theme) */
  node?: XNode;
  /** an attribute that differs (else: text, children or the tag) */
  attr?: string;
  /** the first document's value of that attribute (undefined: absent) */
  value?: string;
  text: string;
}

function compareNode(path: string, a: XNode, b: XNode, out: Diff[]) {
  if (a.tag !== b.tag) {
    out.push({ node: a, text: `${path}: <${a.tag}> vs <${b.tag}>` });
    return;
  }
  const am = new Map(a.attrs);
  const bm = new Map(b.attrs);
  for (const k of new Set([...am.keys(), ...bm.keys()])) {
    if (am.get(k) !== bm.get(k)) out.push({ node: a, attr: k, value: am.get(k), text: `${path}/@${k}: ${JSON.stringify(am.get(k))} vs ${JSON.stringify(bm.get(k))}` });
  }
  const at = norm(a.cdata ?? a.text);
  const bt = norm(b.cdata ?? b.text);
  if (at !== bt) out.push({ node: a, text: `${path}/text(): ${JSON.stringify(at.slice(0, 60))} vs ${JSON.stringify(bt.slice(0, 60))}` });
  if (a.children.length !== b.children.length) {
    out.push({ node: a, text: `${path}: ${a.children.length} vs ${b.children.length} children (${a.children.map((c) => c.tag).join(',')} | ${b.children.map((c) => c.tag).join(',')})`.slice(0, 300) });
    return;
  }
  a.children.forEach((c, i) => compareNode(`${path}/${c.tag}[${i}]${label(c)}`, c, b.children[i], out));
}

const label = (n: XNode) => {
  const name = n.attrs.find(([k]) => k === 'name')?.[1];
  return name ? `(${name})` : '';
};

/** Differences between two .gui documents ([] = the same). */
export function compareGui(xmlA: string, xmlB: string): string[] {
  return compareTrees(parseXml(xmlA)[0], parseXml(xmlB)[0]).map((d) => d.text);
}

/** The same, on parsed documents; each difference says which element of `a` it is in. */
export function compareTrees(a: XNode, b: XNode): Diff[] {
  const out: Diff[] = [];
  const groups = (n: XNode) => {
    const m = new Map<string, XNode[]>();
    for (const c of n.children) m.set(c.tag, [...(m.get(c.tag) ?? []), c]);
    return m;
  };
  const ga = groups(a);
  const gb = groups(b);
  for (const tag of new Set([...ga.keys(), ...gb.keys()])) {
    const la = ga.get(tag) ?? [];
    const lb = gb.get(tag) ?? [];
    if (tag === 'themes') {
      const themes = (l: XNode[]) => new Map(l.flatMap((t) => t.children).map((t) => [themeKey(t.attrs.find(([k]) => k === 'name')?.[1] ?? ''), `${t.attrs.find(([k]) => k === 'type')?.[1]}: ${norm(t.cdata ?? t.text)}`]));
      const ta = themes(la);
      const tb = themes(lb);
      for (const k of new Set([...ta.keys(), ...tb.keys()])) {
        if (ta.get(k) !== tb.get(k)) out.push({ text: `theme ${k}: ${JSON.stringify(ta.get(k)?.slice(0, 80))} vs ${JSON.stringify(tb.get(k)?.slice(0, 80))}` });
      }
      continue;
    }
    if (tag === 'properties') {
      // GUI Designer's own <designer> line doesn't count; the original elements are kept (diffs point at them)
      const strip = (l: XNode[]) => l.map((p) => ({ ...p, children: p.children.filter((c) => c.tag !== 'designer') }));
      const sa = strip(la);
      const sb = strip(lb);
      sa.forEach((x, i) => sb[i] && compareNode(`/${tag}[${i}]`, x, sb[i], out));
      if (sa.length !== sb.length) out.push({ text: `/gui: ${sa.length} vs ${sb.length} <${tag}>` });
      continue;
    }
    if (la.length !== lb.length) {
      out.push({ text: `/gui: ${la.length} vs ${lb.length} <${tag}>` });
      continue;
    }
    la.forEach((x, i) => compareNode(`/${tag}[${i}]${label(x)}`, x, lb[i], out));
  }
  return out;
}

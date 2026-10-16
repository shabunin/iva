import type { CFNode, CFProject } from './parser';
import { normalizeJoinString } from './joinStore';

/** An object of the GUI as CF.getGuiDescription describes it (CommandFusion's JS API, "GUI"). */
export interface GuiObject {
  join: string;
  type: string;
  digitalJoin: string;
  [more: string]: string;
}

/** What CF.getGuiDescription hands a script (its url filled in by the CF object). */
export interface GuiDescription {
  name: string;
  url: string;
  portraitSize: { w: number; h: number };
  landscapeSize: { w: number; h: number };
  allJoins: string[];
  pages: { name: string; join: string; type: 'Page'; portraitObjects: GuiObject[]; landscapeObjects: GuiObject[] }[];
  subpages: { name: string; type: 'Subpage'; objects: GuiObject[] }[];
}

/** An object on a join: where the GUI puts it, its theme, its tags. */
export interface PlacedObject {
  x: number;
  y: number;
  w: number;
  h: number;
  theme: string;
  tags: string[];
}

/** The GUI as a script asks about it: its joins, their objects, its description. */
export interface GuiIndex {
  /** every join an object carries ("s1", "d5", "a1", "l1"; never join 0) */
  joins: Set<string>;
  /** the objects on a join (the first where it is placed: x, y, w, h, theme), with their tags from the GUI */
  objects: Map<string, PlacedObject[]>;
  /** a list's item subpages' objects, by join: what "l1:2:s1" can name */
  listItems: Map<string, Map<string, PlacedObject>>;
  description: GuiDescription;
}

/** A join's name as scripts use it: "s1", "l1:0:s1" - and not a tag ("label", "lights"). */
export const isJoinName = (s: string) => /^[adsl]\d+$/.test(s) || /^l\d+:\d+:[ads]\d+$/.test(s);

const TYPES: Record<string, string> = {
  btn: 'Button', gauge: 'Gauge', input: 'Input', img: 'Image', txt: 'Label', list: 'List', slider: 'Slider',
  subpage: 'SubpageRef', timer: 'Timer', video: 'Video', web: 'Webview',
};

const named = (type: string, n: string | undefined) => (n && n !== '0' ? normalizeJoinString(type, n) : '');
const tagsOf = (node: CFNode) => (node.attributes?.tags ?? '').split(/[\s,]+/).filter(Boolean);

/** An object's own join ("s1"; "" for join 0 or no object), as the renderer registers it. */
export const ownJoin = (node: CFNode) => describe(node)?.obj.join ?? '';

/**
 * An object's own join and the others it carries, as the renderer reads
 * them: a slider, gauge or knob is analog; a text, image, video or web view
 * serial; a list a list; a button, subpage or timer digital; an input field
 * its serial `s` (its `j` digital).
 */
function describe(node: CFNode): { obj: GuiObject; extra: string[] } | null {
  const a = node.attributes ?? {};
  const type = node.type;
  if (!TYPES[type] && type !== 'knob') return null;
  const own = type === 'input' ? named('s', a.s)
    : type === 'slider' || type === 'gauge' || type === 'knob' ? named('a', a.j)
      : type === 'txt' || type === 'img' || type === 'video' || type === 'web' ? named('s', a.j)
        : type === 'list' ? named('l', a.j) : named('d', a.j);
  const obj: GuiObject = { join: own, type: TYPES[type] ?? 'Slider', digitalJoin: type === 'input' ? named('d', a.j) : '' };
  const extra: string[] = [];
  if (type === 'btn') {
    const text = (state: 'inactive' | 'active') => named('s', node.children.find((c) => c.type === state)?.attributes?.s);
    obj.activeTextJoin = text('active');
    obj.inactiveTextJoin = text('inactive');
    extra.push(obj.activeTextJoin, obj.inactiveTextJoin);
  } else if (type === 'slider') {
    obj.pressedJoin = named('d', a.d);
    extra.push(obj.pressedJoin);
  } else if (type === 'video') {
    obj.playTriggerJoin = named('d', a.play);
    obj.stopTriggerJoin = named('d', a.stop);
    extra.push(obj.playTriggerJoin, obj.stopTriggerJoin);
  } else if (type === 'web') {
    obj.backTriggerJoin = named('d', a.back);
    obj.forwardTriggerJoin = named('d', a.forward);
    obj.refreshTriggerJoin = named('d', a.refresh);
    obj.stopTriggerJoin = named('d', a.stop);
    extra.push(obj.backTriggerJoin, obj.forwardTriggerJoin, obj.refreshTriggerJoin, obj.stopTriggerJoin, named('s', a.title));
  } else if (type === 'subpage') {
    obj.subpage = a.name ?? '';
  }
  if (obj.digitalJoin) extra.push(obj.digitalJoin);
  return { obj, extra: extra.filter(Boolean) };
}

/** The GUI's joins, objects and description, from the parsed project. */
export function indexGui(project: CFProject): GuiIndex {
  const joins = new Set<string>();
  const objects = new Map<string, PlacedObject[]>();
  const listItems = new Map<string, Map<string, PlacedObject>>();
  const order: string[] = [];
  const add = (j: string) => {
    if (!j || joins.has(j)) return;
    joins.add(j);
    order.push(j);
  };
  const placed = (node: CFNode): PlacedObject => ({ x: node.x, y: node.y, w: node.w, h: node.h, theme: node.attributes?.t ?? '', tags: tagsOf(node) });
  const scan = (nodes: CFNode[] | undefined) =>
    (nodes ?? []).flatMap((node) => {
      const d = describe(node);
      if (!d) return [];
      add(d.obj.join);
      d.extra.forEach(add);
      if (d.obj.join) {
        const list = objects.get(d.obj.join) ?? [];
        list.push(placed(node));
        objects.set(d.obj.join, list);
      }
      return [d.obj];
    });

  const pages = Object.values(project.pages).map((page) => {
    const join = named('d', page.attributes?.j);
    add(join);
    return { name: page.name, join, type: 'Page' as const, portraitObjects: scan(page.portrait), landscapeObjects: scan(page.landscape) };
  });
  const subpages = Object.values(project.subpages).map((sp) => ({ name: sp.name, type: 'Subpage' as const, objects: scan(sp.nodes) }));

  // a list's items: its item subpages' objects (their joins, where they are in an item)
  const itemObjects = (name: string) => {
    const out = new Map<string, PlacedObject>();
    for (const node of project.subpages[name]?.nodes ?? []) {
      const d = describe(node);
      if (!d) continue;
      for (const j of [d.obj.join, ...d.extra]) if (j && !out.has(j)) out.set(j, placed(node));
    }
    return out;
  };
  const lists = (nodes: CFNode[] | undefined) => (nodes ?? []).filter((n) => n.type === 'list' && n.attributes?.j && n.attributes.j !== '0');
  for (const node of [...Object.values(project.pages).flatMap((p) => [...lists(p.landscape), ...lists(p.portrait)]), ...Object.values(project.subpages).flatMap((s) => lists(s.nodes))]) {
    const own = listItems.get(`l${node.attributes.j}`) ?? new Map<string, PlacedObject>();
    for (const cell of ['headerSub', 'titleSub', 'contentSub', 'footerSub']) {
      const name = node.attributes[cell];
      if (name) for (const [j, o] of itemObjects(name)) if (!own.has(j)) own.set(j, o);
    }
    listItems.set(`l${node.attributes.j}`, own);
  }

  const raw = project.properties.raw as CFNode | undefined;
  const size = (o?: { width: number; height: number }) => ({ w: o?.width ?? 0, h: o?.height ?? 0 });
  return {
    joins,
    objects,
    listItems,
    description: {
      name: raw?.children?.find((c) => c.type === 'project')?.text ?? '',
      url: '',
      portraitSize: size(project.properties.portrait),
      landscapeSize: size(project.properties.landscape),
      allJoins: order,
      pages,
      subpages,
    },
  };
}

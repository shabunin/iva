/**
 * The names of a build's drawings in its image folder: readable - the element
 * they're for (knobs/volume/knob.png), or what they look like
 * (buttons/120x44-r12-2b3137.png) - one drawing a name, and a drawing made
 * again (the same key: what it's drawn from) under the name it got first.
 *
 * One registry a build, shared by the compiler and iva/ui (bundled with the
 * project, it reaches this through globalThis, as the build's look and screen
 * size), across the build's looks: a drawing the same in every look keeps one
 * name, one that differs gets another (knobs/volume-light).
 */

interface Registry {
  /** a drawing's key -> its name */
  byKey: Map<string, string>;
  /** the names given (lower case: iViewer's files, case-blind servers) */
  taken: Set<string>;
  /** a set's place in its look (the 2nd dial) -> the name the first look gave it */
  byPlace: Map<string, string>;
}
type Globals = { __ivaNames?: Registry };

/** A new registry: the build about to be made names its drawings afresh. @internal */
export function newNames() {
  (globalThis as Globals).__ivaNames = { byKey: new Map(), taken: new Set(), byPlace: new Map() };
}

/** @internal */
export function dropNames() {
  delete (globalThis as Globals).__ivaNames;
}

/** Russian letters as Latin ones (a label to a file name: Термостат -> termostat) */
const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
  р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};

/** Text as a file or folder name: lower case Latin letters and digits, words joined by - ('' if nothing's left). @internal */
export const fileName = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[а-яёіїєґ]/g, (c) => CYRILLIC[c] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

/**
 * The name (no extension) of the drawing `key` names what it's drawn from:
 * the one it got before, else the first of `names` not given yet, else the
 * first with a number (thermostat-2). @internal
 */
export function drawnFile(key: string, names: string[]): string {
  const g = globalThis as Globals;
  const reg = (g.__ivaNames ??= { byKey: new Map(), taken: new Set(), byPlace: new Map() });
  const had = reg.byKey.get(key);
  if (had) return had;
  const free = (n: string) => !reg.taken.has(n.toLowerCase());
  let name = names.find(free);
  for (let n = 2; !name; n++) if (free(`${names[0]}-${n}`)) name = `${names[0]}-${n}`;
  reg.byKey.set(key, name);
  reg.taken.add(name.toLowerCase());
  return name;
}

/**
 * The folder of a set of drawings (a dial's frames, a knob's parts): in
 * `kind`, named after `wanted` (its label, its join's name), else `fallback`.
 * In a build of several looks (each the same elements, in the same order),
 * the set at `place` (its kind's n-th) is the same set in each: drawn the
 * same, the same folder; drawn otherwise, the first look's name and this
 * look's after it (knobs/volume-light). @internal
 */
export function drawnSet(kind: string, key: string, wanted: string | undefined, fallback: string, look?: string, place?: string): string {
  const g = globalThis as Globals;
  const reg = (g.__ivaNames ??= { byKey: new Map(), taken: new Set(), byPlace: new Map() });
  const at = place !== undefined ? `${kind}#${place}` : undefined;
  const first = at ? reg.byPlace.get(at) : undefined;
  const name = drawnFile(`${kind}|${key}`, first && look ? [first, `${first}-${fileName(look)}`] : [`${kind}/${fileName(wanted ?? '') || fallback}`]);
  if (at && !first) reg.byPlace.set(at, name);
  return name;
}

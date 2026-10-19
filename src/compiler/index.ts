/**
 * compile(entry): a project's JSX -> a .gui, the files it uses, and the
 * named-join map. writeBuild() lays that out as a folder iViewer loads.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder, CompileError, flat, projectSize, type Asset, type BuildResult, type ScriptOut } from './build.js';
import { parseSize, sizeFolder, type ScreenSize } from './components.js';
import { evaluate, LoadError } from './load.js';
import { JsxError, type Child, type VNode } from './runtime.js';
import { mergeThemes } from './themes.js';
import { dropNames, newNames } from './names.js';
import { serialize } from './xml.js';
import { atlasFiles } from './atlas.js';

const COMPILER_DIR = path.dirname(fileURLToPath(import.meta.url));

export { CompileError } from './build.js';

export interface CompileResult {
  name: string;
  xml: string;
  assets: Asset[];
  scripts: ScriptOut[];
  joins: Record<string, Record<string, number>>;
  warnings: string[];
  /** the source files it was built from */
  files: string[];
  /** every file the build read (sources, copied assets, scripts) and the assets folder: what to watch */
  inputs: { files: string[]; dirs: string[] };
  /**
   * images: iViewer's image folder beside the .gui ('' = the .gui's folder);
   * scripts: their folder in the image folder - iViewer looks for scripts there
   */
  layout: { images: string; scripts: string };
  /** the panel size it was built for (the main orientation's) */
  size: ScreenSize;
  /** the other sizes the project asks to be built for (<Project sizes>): compile(entry, { size }) each */
  sizes: ScreenSize[];
}

export interface CompileOptions {
  /** build it at this size instead of the <Project>'s own ('1400x1400'): screen() gives it */
  size?: string | ScreenSize;
}

/** A build error with where it happened, ready to print. */
export class IvaError extends Error {
  constructor(message: string, public file?: string, public line?: number, public column?: number) {
    super(message);
  }

  /** "file:line:col: message" plus the offending lines. */
  format(cwd = process.cwd()): string {
    if (!this.file) return this.message;
    const where = `${path.relative(cwd, this.file)}${this.line ? `:${this.line}${this.column !== undefined ? `:${this.column + 1}` : ''}` : ''}`;
    let frame = '';
    if (this.line && fs.existsSync(this.file)) {
      const lines = fs.readFileSync(this.file, 'utf8').split(/\r?\n/);
      const from = Math.max(1, this.line - 2);
      const to = Math.min(lines.length, this.line + 1);
      const width = String(to).length;
      for (let n = from; n <= to; n++) {
        frame += `\n${n === this.line ? '>' : ' '} ${String(n).padStart(width)} | ${lines[n - 1]}`;
      }
    }
    return `${where}: ${this.message}${frame}`;
  }
}

function located(e: unknown, baseDir: string): IvaError {
  if (e instanceof IvaError) return e;
  if (e instanceof LoadError) return new IvaError(e.message, e.file, e.line, e.column);
  if (e instanceof CompileError || e instanceof JsxError || (e as Error)?.name === 'JsxError') {
    const s = (e as JsxError).source;
    return new IvaError((e as Error).message, s ? path.resolve(baseDir, s.fileName) : undefined, s?.lineNumber, s?.columnNumber);
  }
  const err = e as Error;
  // an exception in the project's own code: point at its first frame in a project file
  const frames = [...(err?.stack ?? '').matchAll(/\(?((?:\/|[A-Za-z]:\\)[^():]+\.(?:jsx?|tsx?|mjs)):(\d+):(\d+)\)?/g)];
  const m = frames.find((f) => !f[1].startsWith(COMPILER_DIR) && !f[1].includes(`${path.sep}iva-`));
  if (m) return new IvaError(err.message, m[1], Number(m[2]), Number(m[3]) - 1);
  const s = (err as any)?.ivaSource;
  return new IvaError(err?.message ?? String(e), s ? path.resolve(baseDir, s.fileName) : undefined, s?.lineNumber, s?.columnNumber);
}

const projectOf = (tree: Child) => flat([tree]).find((c): c is VNode => typeof c !== 'string' && c.type === 'Project');

/** <Project themes>: the looks, the one it starts in first; null without. */
function themesOf(tree: Child): string[] | null {
  const p = projectOf(tree)?.props;
  if (!p || p.themes === undefined) return null;
  const names: unknown = p.themes;
  if (!Array.isArray(names) || names.length < 2 || names.some((n) => typeof n !== 'string' || !/^[A-Za-z][\w-]*$/.test(n)) || new Set(names).size !== names.length) {
    throw new IvaError(`<Project themes>: two or more names, letters / digits / _ / - (themes={['dark', 'light']})`);
  }
  const start = p.theme ?? names[0];
  if (!names.includes(start)) throw new IvaError(`<Project theme="${start}">: one of ${names.join(', ')}`);
  return [start, ...names.filter((n) => n !== start)];
}

type BuildGlobals = { __ivaVariant?: string; __ivaScreen?: ScreenSize; __ivaScreenUsed?: boolean };

/** The project evaluated with screen() giving `size` (none: iva doesn't know it yet); whether it asked. */
async function evaluateAt(file: string, size: ScreenSize | undefined) {
  const g = globalThis as BuildGlobals;
  if (size) g.__ivaScreen = size;
  g.__ivaScreenUsed = false;
  try {
    const ev = await evaluate(file);
    return { ...ev, usedScreen: !!g.__ivaScreenUsed };
  } finally {
    delete g.__ivaScreen;
    delete g.__ivaScreenUsed;
  }
}

export async function compile(entry: string, opts: CompileOptions = {}): Promise<CompileResult> {
  const file = path.resolve(entry);
  const baseDir = path.dirname(file);
  const asked = typeof opts.size === 'string' ? parseSize(opts.size) : opts.size;
  if (opts.size !== undefined && !asked) throw new IvaError(`size: "${opts.size}" isn't one - WIDTHxHEIGHT in pixels, like 1400x1400`);
  try {
    // the drawings' names (names.ts): one registry for the build, from the evaluation its tree comes from on
    newNames();
    // a first look: the <Project> - its size, its looks
    const first = await evaluateAt(file, asked ?? undefined);
    let { files } = first;
    const project = projectOf(first.tree);
    const own = project ? projectSize(project.props) : null;
    // what screen() gives: the size asked for, else the project's own
    const size = asked ?? (own && typeof own !== 'string' ? own : undefined);
    const looks = themesOf(first.tree);
    let result: BuildResult;
    if (!looks) {
      let tree = first.tree;
      if (first.usedScreen && !asked && size) {
        // it laid itself out from screen() before iva knew the size: again, now that it does
        newNames();
        const ev = await evaluateAt(file, size);
        files = [...new Set([...files, ...ev.files])];
        tree = ev.tree;
      }
      result = new Builder(baseDir, { size: asked ?? undefined }).build(tree);
    } else {
      // once per look (the one it starts in first), merged into one .gui - the looks naming their drawings together
      newNames();
      const builds: BuildResult[] = [];
      for (const look of looks) {
        (globalThis as BuildGlobals).__ivaVariant = look;
        try {
          const ev = await evaluateAt(file, size);
          files = [...new Set([...files, ...ev.files])];
          builds.push(new Builder(baseDir, { themed: true, start: looks[0], size: asked ?? undefined }).build(ev.tree));
        } finally {
          delete (globalThis as BuildGlobals).__ivaVariant;
        }
      }
      result = mergeThemes(builds, looks);
    }
    const name = result.root.children[0].children.find((c) => c.tag === 'project')?.text ?? path.basename(file, path.extname(file));
    const used = [...files, ...result.inputs, ...result.assets.flatMap((a) => (a.file ? [a.file] : [])), ...result.scripts.flatMap((sc) => (sc.file ? [sc.file] : []))];
    const inputs = { files: [...new Set(used.map((f) => path.resolve(f)))], dirs: result.assetDir ? [result.assetDir] : [] };
    return {
      name, xml: serialize(result.root), assets: result.assets, scripts: result.scripts, joins: result.joins, warnings: result.warnings, files, inputs,
      layout: result.layout, size: result.size, sizes: result.sizes,
    };
  } catch (e) {
    throw located(e, baseDir);
  } finally {
    dropNames();
  }
}

/** A file-system-friendly version of the project name. */
export const slug = (name: string) => name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

/** Where a build's scripts go: in the image folder, where iViewer looks for them (images/scripts). */
export const scriptsDir = (layout: CompileResult['layout']): string => [layout.images, layout.scripts].filter(Boolean).join('/');

/**
 * outDir before a build empties it: not a folder the project's own files
 * are in (iva build -o . would wipe the project), and nothing in it but a
 * previous build (a .gui or joins.json) - anything else there is not iva's
 * to delete.
 */
function checkOutDir(result: CompileResult, outDir: string) {
  const out = path.resolve(outDir);
  const shown = path.relative(process.cwd(), out) || '.';
  const inside = (f: string) => {
    const rel = path.relative(out, path.resolve(f));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  const own = [...result.inputs.files, ...result.inputs.dirs].find(inside);
  if (own !== undefined) {
    throw new IvaError(`output folder ${shown}: the project's own files are in it (${path.relative(process.cwd(), own) || '.'}), and a build empties it first - give it a folder of its own, like dist/`);
  }
  if (!fs.existsSync(out)) return;
  if (!fs.statSync(out).isDirectory()) throw new IvaError(`output folder ${shown}: a file, not a folder`);
  const entries = fs.readdirSync(out);
  if (entries.length && !entries.some((e) => e.toLowerCase().endsWith('.gui') || e === 'joins.json')) {
    throw new IvaError(`output folder ${shown} isn't empty and isn't a previous build (no .gui or joins.json in it), and a build empties it first - give an empty folder, or a previous build's`);
  }
}

/**
 * outDir/<name>.gui; images/ beside it (iViewer's image folder: the
 * project's images, sounds and files, iva's drawings in backgrounds/, icons/,
 * controls/, web apps in apps/, the scripts in scripts/), joins.json. With
 * <Project folders={false}> everything beside the .gui (in its image folder,
 * if it names one). Returns the .gui path. outDir is emptied first - so it
 * must be a folder of the build's own (checkOutDir).
 */
export function writeBuild(result: CompileResult, outDir: string): string {
  checkOutDir(result, outDir);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  const gui = path.join(outDir, `${slug(result.name)}.gui`);
  fs.writeFileSync(gui, '﻿' + result.xml);
  const place = (dir: string, name: string) => {
    const dest = path.join(outDir, dir, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    return dest;
  };
  for (const a of result.assets) {
    const dest = place(result.layout.images, a.name);
    if (a.data) fs.writeFileSync(dest, a.data);
    else fs.copyFileSync(a.file!, dest);
  }
  for (const s of result.scripts) {
    const dest = place(scriptsDir(result.layout), s.name);
    if (s.file) fs.copyFileSync(s.file, dest);
    else fs.writeFileSync(dest, s.code ?? '');
  }
  for (const [name, data] of buildAtlas(result)) fs.writeFileSync(place('', name), data);
  fs.writeFileSync(path.join(outDir, 'joins.json'), JSON.stringify(result.joins, null, 2) + '\n');
  return gui;
}

/**
 * The build's images packed into sheets for the iva panel (atlas.ts):
 * iva-atlas/ beside the .gui, which the .gui doesn't name - iViewer goes on
 * loading the images one by one.
 */
export function buildAtlas(result: CompileResult): [string, Buffer][] {
  return atlasFiles(result.xml, result.assets, result.scripts.flatMap((s) => (s.code !== undefined ? [s.code] : [])));
}

/**
 * A build at several sizes (<Project sizes>): the first one's into outDir, each
 * other's into outDir/<W>w<H>h/ - a folder named the way iViewer matches a
 * device's screen in an archive of several GUIs. The .gui paths.
 */
export function writeBuilds(results: CompileResult[], outDir: string): string[] {
  const [main, ...others] = results;
  const guis = [writeBuild(main, outDir)];
  for (const r of others) guis.push(writeBuild(r, path.join(outDir, sizeFolder(r.size))));
  return guis;
}

/**
 * Who an archive is for: iViewer - every image a file of its own, no atlas
 * (<name>.gui.zip); or the iva panel - the images in sheets (iva-atlas/), and
 * only those not in a sheet as files of their own (<name>.iva.zip): a few
 * hundred files to unzip and load instead of thousands.
 */
export type ZipFor = 'iviewer' | 'panel';

/** Every size's files as one archive's: the first build's .gui first (iViewer falls back to the first it finds), the others in their size's folder. */
export function buildFilesAll(results: CompileResult[], forWhom: ZipFor = 'iviewer'): [string, Buffer][] {
  return results.flatMap((r, i) => buildFiles(r, forWhom).map(([p, d]): [string, Buffer] => [i ? `${sizeFolder(r.size)}/${p}` : p, d]));
}

/**
 * The build's files as one archive's: the .gui, images/... (scripts in
 * images/scripts/) - a zipped GUI, as iViewer loads one from a URL; for the
 * iva panel, its images in sheets instead (panelLeavesOut).
 */
export function buildFiles(result: CompileResult, forWhom: ZipFor = 'iviewer'): [string, Buffer][] {
  const at = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
  const atlas = forWhom === 'panel' ? buildAtlas(result) : [];
  const out = forWhom === 'panel' ? panelLeavesOut(result, atlas) : new Set<string>();
  return [
    [`${slug(result.name)}.gui`, Buffer.from('﻿' + result.xml, 'utf8')],
    ...result.assets.filter((a) => !out.has(a.name.toLowerCase())).map((a): [string, Buffer] => [at(result.layout.images, a.name), a.data ?? fs.readFileSync(a.file!)]),
    ...result.scripts.map((s): [string, Buffer] => [at(scriptsDir(result.layout), s.name), s.code !== undefined ? Buffer.from(s.code) : fs.readFileSync(s.file!)]),
    ...atlas,
  ];
}

/**
 * The images (asset names, lower case) the iva panel's archive leaves out:
 * those in its sheets - but for any a web page of the build names (a web view
 * loads it as a file) - and the @2x ones only iViewer's retina screens take.
 * The panel knows an image only in a sheet by its name all the same, and
 * waits for the images a look switched names (renderer whenLoaded).
 */
export function panelLeavesOut(result: CompileResult, atlas: [string, Buffer][]): Set<string> {
  const map = atlas.find(([p]) => p.endsWith('/atlas.json'));
  const packed: string[] = map ? Object.keys(JSON.parse(map[1].toString('utf8')).frames) : [];
  const pages = result.assets
    .filter((a) => /\.(html?|css|js|svg)$/i.test(a.name))
    .map((a) => (a.data ?? (a.file && fs.existsSync(a.file) ? fs.readFileSync(a.file) : Buffer.alloc(0))).toString('utf8').toLowerCase())
    .join('\n');
  const out = new Set<string>();
  for (const name of packed) if (!pages.includes(name.split('/').pop()!.toLowerCase())) out.add(name.toLowerCase());
  for (const a of result.assets) if (/@2x\.(png|jpe?g|gif)$/i.test(a.name)) out.add(a.name.toLowerCase());
  return out;
}

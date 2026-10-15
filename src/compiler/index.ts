/**
 * compile(entry): a project's JSX -> a .gui, the files it uses, and the
 * named-join map. writeBuild() lays that out as a folder iViewer loads.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Builder, CompileError, flat, type Asset, type BuildResult, type ScriptOut } from './build.js';
import { evaluate, LoadError } from './load.js';
import { JsxError, type Child, type VNode } from './runtime.js';
import { mergeThemes } from './themes.js';
import { serialize } from './xml.js';

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
  /** the folders beside the .gui: images (iViewer's image folder) and scripts; '' = beside it (<Project folders={false}>) */
  layout: { images: string; scripts: string };
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

/** <Project themes>: the looks, the one it starts in first; null without. */
function themesOf(tree: Child): string[] | null {
  const project = flat([tree]).find((c): c is VNode => typeof c !== 'string' && c.type === 'Project');
  const p = project?.props;
  if (!p || p.themes === undefined) return null;
  const names: unknown = p.themes;
  if (!Array.isArray(names) || names.length < 2 || names.some((n) => typeof n !== 'string' || !/^[A-Za-z][\w-]*$/.test(n)) || new Set(names).size !== names.length) {
    throw new IvaError(`<Project themes>: two or more names, letters / digits / _ / - (themes={['dark', 'light']})`);
  }
  const start = p.theme ?? names[0];
  if (!names.includes(start)) throw new IvaError(`<Project theme="${start}">: one of ${names.join(', ')}`);
  return [start, ...names.filter((n) => n !== start)];
}

export async function compile(entry: string): Promise<CompileResult> {
  const file = path.resolve(entry);
  const baseDir = path.dirname(file);
  try {
    const first = await evaluate(file);
    let { files } = first;
    const looks = themesOf(first.tree);
    let result: BuildResult;
    if (!looks) result = new Builder(baseDir).build(first.tree);
    else {
      // once per look (the one it starts in first), merged into one .gui
      const builds: BuildResult[] = [];
      for (const look of looks) {
        (globalThis as { __ivaVariant?: string }).__ivaVariant = look;
        try {
          const ev = await evaluate(file);
          files = [...new Set([...files, ...ev.files])];
          builds.push(new Builder(baseDir, { themed: true, start: looks[0] }).build(ev.tree));
        } finally {
          delete (globalThis as { __ivaVariant?: string }).__ivaVariant;
        }
      }
      result = mergeThemes(builds, looks);
    }
    const name = result.root.children[0].children.find((c) => c.tag === 'project')?.text ?? path.basename(file, path.extname(file));
    const used = [...files, ...result.inputs, ...result.assets.flatMap((a) => (a.file ? [a.file] : [])), ...result.scripts.flatMap((sc) => (sc.file ? [sc.file] : []))];
    const inputs = { files: [...new Set(used.map((f) => path.resolve(f)))], dirs: result.assetDir ? [result.assetDir] : [] };
    return {
      name, xml: serialize(result.root), assets: result.assets, scripts: result.scripts, joins: result.joins, warnings: result.warnings, files, inputs,
      layout: result.layout,
    };
  } catch (e) {
    throw located(e, baseDir);
  }
}

/** A file-system-friendly version of the project name. */
export const slug = (name: string) => name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'project';

/**
 * outDir/<name>.gui; images/ beside it (iViewer's image folder: the
 * project's images, sounds and files, iva's drawings in backgrounds/, icons/,
 * controls/, web apps in apps/), scripts/, joins.json. With
 * <Project folders={false}> everything beside the .gui. Returns the .gui path.
 */
export function writeBuild(result: CompileResult, outDir: string): string {
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
    const dest = place(result.layout.scripts, s.name);
    if (s.file) fs.copyFileSync(s.file, dest);
    else fs.writeFileSync(dest, s.code ?? '');
  }
  fs.writeFileSync(path.join(outDir, 'joins.json'), JSON.stringify(result.joins, null, 2) + '\n');
  return gui;
}

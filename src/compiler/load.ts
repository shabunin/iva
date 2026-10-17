/**
 * Evaluate a project's entry: esbuild bundles it (JSX in dev mode, so every
 * element knows its file and line) and the bundle runs in this process.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import { build, type Message, type Plugin } from 'esbuild';
import type { Child } from './runtime.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const LIB = path.join(HERE, '..', '..', 'lib');
/** the drivers iva has (lib/drivers/<name>/index.tsx): iva/drivers/<name> */
export const drivers = (): string[] =>
  fs.readdirSync(path.join(LIB, 'drivers')).filter((d) => fs.existsSync(path.join(LIB, 'drivers', d, 'index.tsx'))).sort();

/** `iva`, `iva/jsx-runtime`, `iva/jsx-dev-runtime`, `iva/ui`, `iva/drivers/<name>` -> the compiler's own modules. */
const ivaModules: Plugin = {
  name: 'iva',
  setup(b) {
    b.onResolve({ filter: /^iva(\/.*)?$/ }, (args) => {
      const sub = args.path.slice(3);
      if (sub === '' ) return { path: path.join(HERE, 'prelude.ts') };
      if (sub === '/jsx-runtime' || sub === '/jsx-dev-runtime') return { path: path.join(HERE, 'runtime.ts') };
      if (sub === '/ui') return { path: path.join(LIB, 'ui', 'index.tsx') };
      const driver = /^\/drivers\/([\w-]+)$/.exec(sub);
      if (driver && drivers().includes(driver[1])) return { path: path.join(LIB, 'drivers', driver[1], 'index.tsx') };
      return { errors: [{ text: `no module "${args.path}" (iva has: iva, iva/ui, ${drivers().map((d) => `iva/drivers/${d}`).join(', ')}, iva/jsx-runtime)` }] };
    });
  },
};

export class LoadError extends Error {
  constructor(message: string, public file?: string, public line?: number, public column?: number) {
    super(message);
  }
}

export interface Loaded {
  tree: Child;
  /** every source file the entry pulled in (to watch) */
  files: string[];
}

// exceptions in project code then point at the .jsx line, not the bundle
process.setSourceMapsEnabled?.(true);
const TMP = path.join(os.tmpdir(), `iva-${process.pid}`);
let seq = 0;
// gone with the process (each would leave an empty folder behind)
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

export async function evaluate(entry: string): Promise<Loaded> {
  const dir = path.dirname(entry);
  fs.mkdirSync(TMP, { recursive: true });
  const outfile = path.join(TMP, `bundle-${++seq}.mjs`);
  let result;
  try {
    result = await build({
      entryPoints: [entry],
      absWorkingDir: dir,
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      jsx: 'automatic',
      jsxDev: true,
      jsxImportSource: 'iva',
      inject: [path.join(HERE, 'prelude.ts')],
      loader: { '.js': 'jsx' },
      plugins: [ivaModules],
      metafile: true,
      outfile,
      sourcemap: 'inline',
      logLevel: 'silent',
    });
  } catch (e: any) {
    const m: Message | undefined = e.errors?.[0];
    if (m) throw new LoadError(m.text, m.location ? path.resolve(dir, m.location.file) : undefined, m.location?.line, m.location?.column);
    throw e;
  }
  // a real file (not a data: URL): Node applies its source map only then
  fs.writeFileSync(outfile, result.outputFiles[0].text);
  let mod: any;
  try {
    mod = await import(pathToFileURL(outfile).href);
  } finally {
    fs.rmSync(outfile, { force: true });
  }
  if (!('default' in mod)) throw new LoadError('the entry has no `export default` (it should export default <Project>...)', entry);
  return {
    tree: mod.default,
    files: Object.keys(result.metafile.inputs).map((f) => path.resolve(dir, f)).filter((f) => !f.startsWith(HERE)),
  };
}

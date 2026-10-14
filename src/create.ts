/**
 * iva create: a new project folder from a template (blank, demo), or from an
 * existing .gui (decompiled). Every project gets its types (iva.d.ts,
 * jsconfig.json), the element reference (IVA.md) and notes for people and AI
 * assistants (README.md, AGENTS.md, CLAUDE.md).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, slug } from './compiler/index.js';
import { DEVICES } from './compiler/components.js';
import { decompile } from './decompiler/index.js';
import { didYouMean } from './compiler/suggest.js';
import { writeTypes } from './types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATES = path.join(ROOT, 'templates');
export const VERSION: string = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

export interface CreateOptions {
  template?: string;
  /** a .gui to start from (decompiled) */
  from?: string;
  device?: string;
  name?: string;
}

export function templates(): string[] {
  return fs.readdirSync(TEMPLATES).filter((t) => !t.startsWith('_'));
}

function copyTemplate(src: string, dest: string, vars: Record<string, string>, written: string[], base = dest) {
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    // npm drops dotfiles from packages: templates name them without the dot
    const name = e.name === 'gitignore' ? '.gitignore' : e.name;
    const from = path.join(src, e.name);
    const to = path.join(dest, name);
    if (e.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyTemplate(from, to, vars, written, base);
    } else {
      const text = fs.readFileSync(from, 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
      fs.writeFileSync(to, text);
      written.push(path.relative(base, to));
    }
  }
}

export async function create(dir: string, opts: CreateOptions = {}) {
  const target = path.resolve(dir);
  if (fs.existsSync(target) && fs.readdirSync(target).length) throw new Error(`${dir} isn't empty`);
  const template = opts.template ?? (opts.from ? undefined : 'blank');
  if (template && !templates().includes(template)) throw new Error(`no template "${template}"${didYouMean(template, templates())} (templates: ${templates().join(', ')})`);
  const device = opts.device ?? 'iPad';
  if (!(device in DEVICES)) throw new Error(`no device "${device}"${didYouMean(device, Object.keys(DEVICES))} (devices: ${Object.keys(DEVICES).join(', ')})`);
  const name = opts.name ?? path.basename(target);
  const vars = { name, slug: slug(name), device };

  fs.mkdirSync(target, { recursive: true });
  const written: string[] = [];
  let warnings: string[] = [];
  if (opts.from) {
    const r = await decompile(opts.from, target);
    written.push(...r.files);
    warnings = [...new Set(r.warnings)];
    if (r.differences.length) warnings.push(`the decompiled project differs from ${opts.from} in ${r.differences.length} places`);
  } else {
    copyTemplate(path.join(TEMPLATES, template!), target, vars, written);
  }
  copyTemplate(path.join(TEMPLATES, '_common'), target, vars, written);
  for (const d of ['assets', 'scripts']) fs.mkdirSync(path.join(target, d), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'docs', 'components.md'), path.join(target, 'IVA.md'));
  written.push('IVA.md', ...writeTypes(target, VERSION));

  // it has to build as it is
  const built = await compile(path.join(target, 'app.jsx'));
  return { dir: target, files: written, warnings: [...warnings, ...built.warnings] };
}

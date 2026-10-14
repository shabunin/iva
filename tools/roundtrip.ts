/**
 * Decompile every .gui under a folder, compile it back, and compare:
 *   node --import tsx tools/roundtrip.ts fixtures/DemoUserInterfaces [-v]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decompile } from '../src/decompiler/index.ts';
import { compareGui } from '../src/decompiler/compare.ts';
import { compile } from '../src/compiler/index.ts';
import { findGuis } from '../src/server/project.ts';

const [root = 'fixtures/DemoUserInterfaces', ...flags] = process.argv.slice(2);
const verbose = flags.includes('-v');
const only = flags.find((f) => !f.startsWith('-'));
let ok = 0;
const raw: Record<string, number> = {};
const failed: string[] = [];
for (const g of findGuis(root)) {
  if (only && !g.rel.includes(only)) continue;
  const file = path.resolve(root, g.rel);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'iva-rt-'));
  try {
    const d = await decompile(file, out);
    for (const [k, v] of Object.entries(d.raw)) raw[k] = (raw[k] ?? 0) + v;
    const r = await compile(d.entry);
    const diffs = compareGui(fs.readFileSync(file, 'utf8'), r.xml);
    if (diffs.length) {
      failed.push(g.rel);
      console.log(`✗ ${g.rel}: ${diffs.length} differences`);
      for (const x of diffs.slice(0, verbose ? 50 : 4)) console.log(`    ${x}`);
    } else {
      ok++;
      if (verbose) console.log(`✓ ${g.rel}`);
    }
    if (verbose && d.warnings.length) console.log(`    warnings: ${[...new Set(d.warnings)].slice(0, 8).join('; ')}`);
  } catch (e: any) {
    failed.push(g.rel);
    console.log(`✗ ${g.rel}: ${e.format ? e.format() : e.stack}`);
  } finally {
    if (!flags.includes('--keep')) fs.rmSync(out, { recursive: true, force: true });
    else console.log(`    kept: ${out}`);
  }
}
console.log(`\n${ok} / ${ok + failed.length} identical; <Raw> kept: ${JSON.stringify(raw)}`);
process.exitCode = failed.length ? 1 : 0;

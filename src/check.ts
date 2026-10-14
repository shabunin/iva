/**
 * iva check: what the editor would underline (TypeScript over the project,
 * with iva's types) and a test build. Run before handing a project over.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { compile, IvaError } from './compiler/index.js';
import { VERSION } from './create.js';
import { JSCONFIG, writeTypes } from './types.js';

export interface CheckResult {
  problems: string[];
  warnings: string[];
  notes: string[];
}

export async function check(entry: string): Promise<CheckResult> {
  const file = path.resolve(entry);
  const dir = path.dirname(file);
  const notes: string[] = [];
  const problems: string[] = [];

  // types the project's editor uses: there and current
  const dts = path.join(dir, 'iva.d.ts');
  const current = fs.existsSync(dts) && fs.readFileSync(dts, 'utf8').startsWith(`// iva ${VERSION}:`);
  if (!current) notes.push(`${fs.existsSync(dts) ? 'updated' : 'wrote'} ${writeTypes(dir, VERSION).join(', ')}`);

  const jsconfig = path.join(dir, 'jsconfig.json');
  const raw = fs.existsSync(jsconfig) ? ts.readConfigFile(jsconfig, ts.sys.readFile).config : JSCONFIG;
  const parsed = ts.parseJsonConfigFileContent(raw, ts.sys, dir);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  for (const d of ts.getPreEmitDiagnostics(program)) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n  ');
    if (d.file && d.start !== undefined) {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
      problems.push(`${path.relative(process.cwd(), d.file.fileName)}:${line + 1}:${character + 1}: ${msg}`);
    } else {
      problems.push(msg);
    }
  }

  let warnings: string[] = [];
  try {
    warnings = (await compile(file)).warnings;
  } catch (e) {
    problems.push(e instanceof IvaError ? e.format() : String((e as Error)?.stack ?? e));
  }
  return { problems, warnings, notes };
}

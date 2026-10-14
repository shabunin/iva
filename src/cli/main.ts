/**
 * iva - iViewer assistant. `iva <command> [options]`.
 */
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAgapi, startDev } from '../server/dev.js';
import { compile, IvaError, slug, writeBuild } from '../compiler/index.js';
import { decompile } from '../decompiler/index.js';
import { create, templates, VERSION } from '../create.js';
import { check } from '../check.js';
import { writeTypes } from '../types.js';
import { DEVICES } from '../compiler/components.js';
import { openInDesigner } from '../designer.js';

const HELP = `iva - iViewer assistant (CommandFusion .gui projects)

Usage:
  iva create <dir>     a new project: --template blank|demo (default blank),
                       --device "iPad" | "iPhone X" | ..., or --from file.gui
  iva check [entry]    what the editor underlines + a test build
  iva types [dir]      (re)write iva.d.ts and jsconfig.json for editors
  iva build [entry]    compile a JSX project (default: app.jsx) into dist/:
                       the .gui, its images and scripts, joins.json
  iva dev [target]     live preview of a JSX project (app.jsx), a .gui, or a
                       folder of .gui files, backed by a Node runtime: real
                       TCP/UDP/HTTP from this machine; reloads on save
  iva decompile <file.gui> [dir]
                       turn a .gui (with its images and scripts) into a JSX
                       project in dir (default: a folder named after it), and
                       check that it compiles back to the same .gui
  iva designer [entry | file.gui]
                       build and open in CommandFusion GUI Designer (Wine on
                       Linux / macOS: $IVA_DESIGNER, $IVA_WINEPREFIX)
  iva help

Options (build):
  -o, --out <dir>      output folder (default: dist/ next to the entry)

Options (dev):
  -p, --port <n>       port (default 5180)
      --host <addr>    address to listen on (default 127.0.0.1; 0.0.0.0 for LAN)
      --agapi <dir>    agapi checkout (default: $IVA_AGAPI or ../agapi)
  -v, --verbose        log socket activity
`;

async function main(argv: string[]) {
  const [cmd = 'help', ...rest] = argv;
  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (cmd === 'create') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { template: { type: 'string', short: 't' }, from: { type: 'string' }, device: { type: 'string' }, name: { type: 'string' } },
    });
    if (!positionals[0]) throw new Error(`where? iva create my-panel [--template ${templates().join('|')}] [--device "${Object.keys(DEVICES)[3]}"]`);
    const r = await create(positionals[0], values);
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
    const rel = path.relative(process.cwd(), r.dir) || '.';
    process.stdout.write(`${rel}: ${r.files.length} files\n\n  cd ${rel}\n  iva dev\n`);
    return;
  }
  if (cmd === 'check') {
    const entry = path.resolve(rest[0] ?? 'app.jsx');
    if (!fs.existsSync(entry)) throw new Error(`no ${path.relative(process.cwd(), entry)} (pass the entry: iva check app.jsx)`);
    const r = await check(entry);
    for (const n of r.notes) process.stdout.write(`${n}\n`);
    for (const w of r.warnings) process.stderr.write(`warning: ${w}\n`);
    for (const p of r.problems) process.stderr.write(`${p}\n`);
    process.stdout.write(r.problems.length ? `${r.problems.length} problem${r.problems.length > 1 ? 's' : ''}\n` : 'ok\n');
    process.exitCode = r.problems.length ? 1 : 0;
    return;
  }
  if (cmd === 'designer') {
    let target = path.resolve(rest[0] ?? 'app.jsx');
    if (!fs.existsSync(target)) throw new Error(`no ${path.relative(process.cwd(), target)}`);
    if (!target.toLowerCase().endsWith('.gui')) {
      try {
        const result = await compile(target);
        for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
        target = writeBuild(result, path.join(path.dirname(target), 'dist'));
      } catch (e) {
        if (e instanceof IvaError) {
          process.stderr.write(`${e.format()}\n`);
          process.exitCode = 1;
          return;
        }
        throw e;
      }
    }
    const { exe } = openInDesigner(target);
    process.stdout.write(`opening ${path.relative(process.cwd(), target)} in ${exe}\n`);
    return;
  }
  if (cmd === 'types') {
    const dir = path.resolve(rest[0] ?? '.');
    process.stdout.write(`${writeTypes(dir, VERSION).join(', ')}\n`);
    return;
  }
  if (cmd === 'build') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { out: { type: 'string', short: 'o' }, help: { type: 'boolean', short: 'h' } },
    });
    if (values.help) {
      process.stdout.write(HELP);
      return;
    }
    const entry = path.resolve(positionals[0] ?? 'app.jsx');
    if (!fs.existsSync(entry)) throw new Error(`no ${path.relative(process.cwd(), entry) || entry} (pass the entry file: iva build app.jsx)`);
    const t0 = Date.now();
    try {
      const result = await compile(entry);
      for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`);
      const gui = writeBuild(result, path.resolve(values.out ?? path.join(path.dirname(entry), 'dist')));
      const counts = `${result.assets.length} files, ${result.scripts.length} scripts`;
      process.stdout.write(`${path.relative(process.cwd(), gui)} (${counts}) in ${Date.now() - t0} ms\n`);
    } catch (e) {
      if (e instanceof IvaError) {
        process.stderr.write(`${e.format()}\n`);
        process.exitCode = 1;
        return;
      }
      throw e;
    }
    return;
  }
  if (cmd === 'decompile') {
    const { positionals, values } = parseArgs({ args: rest, allowPositionals: true, options: { force: { type: 'boolean', short: 'f' } } });
    const gui = positionals[0];
    if (!gui || !fs.existsSync(gui)) throw new Error('give the .gui to decompile: iva decompile path/to/project.gui');
    const out = path.resolve(positionals[1] ?? slug(path.basename(gui, path.extname(gui))));
    if (fs.existsSync(out) && fs.readdirSync(out).length && !values.force) throw new Error(`${path.relative(process.cwd(), out)} isn't empty (use --force to write into it)`);
    const r = await decompile(gui, out);
    for (const w of [...new Set(r.warnings)]) process.stderr.write(`warning: ${w}\n`);
    const raw = Object.entries(r.raw).map(([k, v]) => `${v} <${k}>`).join(', ');
    process.stdout.write(`${path.relative(process.cwd(), r.entry)}: ${r.files.length} files${raw ? `; kept as <Raw>: ${raw}` : ''}\n`);
    // decompile() already compiled it back and compared
    if (r.differences.length) {
      process.stderr.write(`round trip: ${r.differences.length} differences from the original:\n${r.differences.slice(0, 20).map((d) => `  ${d}`).join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write('round trip: compiles back to the same .gui\n');
    }
    return;
  }
  if (cmd === 'dev') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        port: { type: 'string', short: 'p', default: '5180' },
        host: { type: 'string', default: '127.0.0.1' },
        agapi: { type: 'string' },
        verbose: { type: 'boolean', short: 'v', default: false },
        help: { type: 'boolean', short: 'h' },
      },
    });
    if (values.help) {
      process.stdout.write(HELP);
      return;
    }
    const server = await startDev({
      target: positionals[0] ?? (fs.existsSync('app.jsx') ? 'app.jsx' : '.'),
      port: Number(values.port),
      host: values.host!,
      agapi: resolveAgapi(values.agapi),
      verbose: values.verbose,
    });
    const stop = async () => {
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return;
  }
  process.stderr.write(`iva: unknown command "${cmd}"\n\n${HELP}`);
  process.exitCode = 2;
}

main(process.argv.slice(2)).catch((e) => {
  process.stderr.write(`iva: ${e?.message ?? e}\n`);
  process.exit(1);
});

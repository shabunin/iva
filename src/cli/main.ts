/**
 * iva - iViewer assistant. `iva <command> [options]`.
 */
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAgapi, startDev } from '../server/dev.js';
import { compile, IvaError, writeBuild } from '../compiler/index.js';

const HELP = `iva - iViewer assistant (CommandFusion .gui projects)

Usage:
  iva build [entry]    compile a JSX project (default: app.jsx) into dist/:
                       the .gui, its images and scripts, joins.json
  iva dev [target]     live preview of a JSX project (app.jsx), a .gui, or a
                       folder of .gui files, backed by a Node runtime: real
                       TCP/UDP/HTTP from this machine; reloads on save
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

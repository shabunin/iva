/**
 * iva - iViewer assistant. `iva <command> [options]`.
 */
import { parseArgs } from 'node:util';
import { resolveAgapi, startDev } from '../server/dev.js';

const HELP = `iva - iViewer assistant (CommandFusion .gui projects)

Usage:
  iva dev [target]     live preview of a .gui (or a folder of them), backed by
                       a Node runtime: real TCP/UDP/HTTP from this machine
  iva help

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
      target: positionals[0] ?? '.',
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

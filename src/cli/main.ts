/**
 * iva - iViewer assistant. `iva <command> [options]`.
 */
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { startDev } from '../server/dev.js';
import { buildFilesAll, compile, IvaError, slug, writeBuild, writeBuilds, type CompileResult } from '../compiler/index.js';
import { writeZip } from '../server/zip.js';
import { decompile } from '../decompiler/index.js';
import { create, templates, VERSION } from '../create.js';
import { check } from '../check.js';
import { writeTypes } from '../types.js';
import { DEVICES, sizeLabel } from '../compiler/components.js';
import { openInDesigner } from '../designer.js';
import { startDeviceServer } from '../server/device.js';
import QRCode from 'qrcode';

const HELP = `iva - iViewer assistant (CommandFusion .gui projects)

Usage:
  iva create <dir>     a new project: --template blank|demo (default blank),
                       --device "iPad" | "iPhone X" | ..., or --from file.gui
  iva check [entry]    what the editor underlines + a test build
  iva types [dir]      (re)write iva.d.ts and jsconfig.json for editors
  iva build [entry]    compile a JSX project (default: app.jsx) into dist/:
                       the .gui, its images and scripts, joins.json; with
                       <Project sizes>, a GUI per size in dist/<W>w<H>h/
  iva dev [target]     live preview of a JSX project (app.jsx), a .gui, or a
                       folder of .gui files, backed by a Node runtime: real
                       TCP/UDP/HTTP from this machine; reloads on save
  iva decompile <file.gui> [dir]
                       turn a .gui (with its images and scripts) into a JSX
                       project in dir (default: a folder named after it), and
                       check that it compiles back to the same .gui
  iva serve [entry | file.gui]
                       serve it to iViewer on a real device, as GUI Designer's
                       Upload Service does (port 8019); rebuilds on save and
                       reloads the panel on the device (--no-live: don't)
  iva designer [entry | file.gui]
                       build and open in CommandFusion GUI Designer (Wine on
                       Linux / macOS: $IVA_DESIGNER, $IVA_WINEPREFIX)
  iva help

Options (build):
  -o, --out <dir>      output folder (default: dist/ next to the entry)
      --zip            also <name>.gui.zip: the build in one file (a zipped GUI;
                       every size in it - iViewer loads the one for its screen)

Options (build, dev, serve, designer):
      --size <WxH>     build it for that screen (1400x1400) instead of the
                       <Project>'s own: screen() gives it; a phone's dense
                       screen: 1400x1400@3x (laid out at 467x467, scaled up)

Options (dev):
  -p, --port <n>       port (default 5180)
      --host <addr>    address to listen on (default 127.0.0.1; 0.0.0.0 for LAN)
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
  if (cmd === 'serve') {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        port: { type: 'string', short: 'p', default: '8019' }, host: { type: 'string', default: '0.0.0.0' }, 'no-live': { type: 'boolean', default: false },
        size: { type: 'string' },
      },
    });
    const target = positionals[0] ?? (fs.existsSync('app.jsx') ? 'app.jsx' : undefined);
    if (!target || !fs.existsSync(target)) throw new Error('serve what? iva serve app.jsx | iva serve project.gui');
    const server = await startDeviceServer({ target, port: Number(values.port), host: values.host!, live: !values['no-live'], size: values.size });
    if (!server.addresses.length) process.stdout.write('no network address found: is this machine on a network?\n');
    process.stdout.write(`\nServing ${server.name} for iViewer. On the device, set iViewer's GUI File URL to:\n\n`);
    for (const a of server.addresses) process.stdout.write(`    ${a.url.padEnd(28)} ${a.iface}${a.kind ? ` (${a.kind})` : ''}\n`);
    process.stdout.write('\n(the device must reach that address: same network, or the same VPN / ZeroTier network)\n');
    if (server.addresses[0]) {
      // a cf:// link opens iViewer (iOS camera / Android scanner)
      const link = server.addresses[0].url.replace(/^http:/, 'cf:');
      const qr = await QRCode.toString(link, { type: 'terminal', small: true });
      process.stdout.write(`\nor scan ${link}:\n${qr}\n`);
    }
    process.stdout.write(values['no-live'] ? '' : 'Saving the project rebuilds it and reloads the panel on the device.\n\n');
    const stop = async () => {
      await server.close();
      process.exit(0);
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    return;
  }
  if (cmd === 'designer') {
    const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { size: { type: 'string' } } });
    let target = path.resolve(positionals[0] ?? 'app.jsx');
    if (!fs.existsSync(target)) throw new Error(`no ${path.relative(process.cwd(), target)}`);
    if (!target.toLowerCase().endsWith('.gui')) {
      try {
        const result = await compile(target, { size: values.size });
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
      options: { out: { type: 'string', short: 'o' }, zip: { type: 'boolean' }, size: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    });
    if (values.help) {
      process.stdout.write(HELP);
      return;
    }
    const entry = path.resolve(positionals[0] ?? 'app.jsx');
    if (!fs.existsSync(entry)) throw new Error(`no ${path.relative(process.cwd(), entry) || entry} (pass the entry file: iva build app.jsx)`);
    try {
      // --size: that one; else the project's own size, then each of <Project sizes>
      const results: CompileResult[] = [];
      const built = (r: CompileResult, t0: number) => {
        for (const w of r.warnings) process.stderr.write(`warning: ${results.length ? `${sizeLabel(r.size)}: ` : ''}${w}\n`);
        results.push(r);
        return Date.now() - t0;
      };
      const times: number[] = [];
      let t0 = Date.now();
      times.push(built(await compile(entry, { size: values.size }), t0));
      for (const size of values.size ? [] : results[0].sizes) {
        t0 = Date.now();
        times.push(built(await compile(entry, { size }), t0));
      }
      const guis = writeBuilds(results, path.resolve(values.out ?? path.join(path.dirname(entry), 'dist')));
      results.forEach((r, i) => {
        const at = r.size.scale ? `${sizeLabel(r.size)}: laid out at ${r.size.width}x${r.size.height}` : sizeLabel(r.size);
        const counts = `${at}, ${r.assets.length} files, ${r.scripts.length} scripts`;
        process.stdout.write(`${path.relative(process.cwd(), guis[i])} (${counts}) in ${times[i]} ms\n`);
      });
      if (values.zip) {
        // the same files in one archive: iViewer loads it from a URL (GUI File URL .../name.gui.zip)
        const zip = `${guis[0]}.zip`;
        fs.writeFileSync(zip, writeZip(buildFilesAll(results)));
        process.stdout.write(`${path.relative(process.cwd(), zip)} (${Math.round(fs.statSync(zip).size / 1024)} KiB)\n`);
      }
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
        verbose: { type: 'boolean', short: 'v', default: false },
        size: { type: 'string' },
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
      verbose: values.verbose,
      size: values.size,
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

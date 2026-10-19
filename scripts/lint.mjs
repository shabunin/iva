// tsc over iva (strict): every file, the runtime in src/runtime included.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

// tsc's own script under this node (not `npx`: on Windows that's npx.cmd, which spawn can't start)
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
const r = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], { encoding: 'utf8' });
if (r.status !== 0) {
  console.log(r.error ? String(r.error) : (r.stdout + r.stderr).trim());
  process.exit(1);
}
console.log('lint: ok');

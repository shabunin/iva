// tsc over iva (strict): every file, the runtime in src/runtime included.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], { encoding: 'utf8' });
if (r.status !== 0) {
  console.log((r.stdout + r.stderr).trim());
  process.exit(1);
}
console.log('lint: ok');

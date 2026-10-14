// tsc over iva, reporting only iva's own files: agapi's sources (type-checked
// through the imports) aren't built with `strict`, and aren't ours to fix here.
import { spawnSync } from 'node:child_process';

const r = spawnSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], { encoding: 'utf8' });
const own = (r.stdout + r.stderr).split('\n').filter((l) => /^(src|test|scripts|lib)\//.test(l));
if (own.length) {
  console.log(own.join('\n'));
  process.exit(1);
}
console.log('lint: ok');

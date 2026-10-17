/**
 * <WebApp>: a web page the panel serves itself. Its code (a JavaScript /
 * TypeScript module and what it imports: npm packages, iva/web) is bundled
 * here into one script, shipped with the .gui, and served by the panel's own
 * HTTP server (iva-http.js) inside the page it sends.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IVA_ROOT = path.resolve(HERE, '..', '..');
const WEB_LIB = path.join(IVA_ROOT, 'lib', 'web');

/** Web apps iva brings: entry="iva:trend". */
export const BUILT_IN: Record<string, string> = {
  trend: path.join(WEB_LIB, 'trend.ts'),
  chart: path.join(WEB_LIB, 'chart.ts'),
};

/** The panel's HTTP server and web app host (iva-http.js). */
export const HTTP_RUNTIME = fs.readFileSync(path.join(HERE, 'iva-http.js'), 'utf8');

export interface Bundle {
  /** the script, as UTF-8 */
  code: Buffer;
  /** the files it was made from (to watch) */
  inputs: string[];
}

const cache = new Map<string, { bundle: Bundle; stamps: [string, number][] }>();
const stamp = (f: string) => {
  try {
    return fs.statSync(f).mtimeMs;
  } catch {
    return -1;
  }
};

/** The entry's file: 'iva:name' (built in) or a path from `fromDir`. */
export function resolveEntry(entry: string, fromDir: string): string {
  const builtIn = /^iva:(\w+)$/.exec(entry);
  if (builtIn) {
    const file = BUILT_IN[builtIn[1]];
    if (!file) throw new Error(`no built-in web app "${entry}" (iva has: ${Object.keys(BUILT_IN).map((k) => `iva:${k}`).join(', ')})`);
    return file;
  }
  const file = path.resolve(fromDir, entry);
  if (!fs.existsSync(file)) throw new Error(`entry not found: ${entry}`);
  return file;
}

/**
 * One script for the system WebView iViewer shows it in (Safari 15 /
 * Chrome 90 or later): minified, `</script` escaped (it goes inside the
 * page), CSS its modules import added as a <style>. Packages
 * come from the project's node_modules, else iva's own (uplot, chart.js,
 * three come with iva). Cached until a file it read changes.
 */
export function bundleWebApp(file: string): Bundle {
  return bundleModule(file, 'web');
}

/**
 * A <Script entry>: one script for the panel's JavaScript engine (iViewer's
 * hidden system WebView, the iva panel's), its packages from the project's
 * node_modules, else iva's. Cached until a file it read changes.
 */
export function bundlePanelScript(file: string): Bundle {
  return bundleModule(file, 'panel');
}

function bundleModule(file: string, kind: 'web' | 'panel'): Bundle {
  const hit = cache.get(`${kind}:${file}`);
  if (hit && hit.stamps.every(([f, t]) => stamp(f) === t)) return hit.bundle;
  let result;
  try {
    result = buildSync({
      entryPoints: [file],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: ['safari15', 'chrome90'],
      minify: true,
      legalComments: 'none',
      charset: 'utf8',
      metafile: true,
      // write: false - the names only tell the script from the CSS its imports make
      outfile: path.join(WEB_LIB, kind === 'web' ? 'app.js' : 'panel.js'),
      alias: kind === 'web' ? { 'iva/web': path.join(WEB_LIB, 'client.ts') } : {},
      nodePaths: [path.join(IVA_ROOT, 'node_modules')],
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
    });
  } catch (e: any) {
    const m = e.errors?.[0];
    throw new Error(m ? `${m.location ? `${m.location.file}:${m.location.line}: ` : ''}${m.text}` : String(e?.message ?? e));
  }
  const files = result.outputFiles ?? [];
  const js = files.find((f) => f.path.endsWith('.js'))?.text ?? '';
  const css = files.find((f) => f.path.endsWith('.css'))?.text;
  // CSS the modules import: a <style> the script adds first
  const styled = css ? `(function(){var s=document.createElement('style');s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();\n${js}` : js;
  const code = styled.replace(/<\/(script)/gi, '<\\/$1');
  const inputs = Object.keys(result.metafile!.inputs)
    .filter((f) => !f.includes(':'))
    .map((f) => path.resolve(f))
    .filter((f) => !f.startsWith(path.join(IVA_ROOT, 'node_modules')) || f === file);
  const bundle = { code: Buffer.from(code, 'utf8'), inputs };
  cache.set(`${kind}:${file}`, { bundle, stamps: [...new Set([file, ...inputs])].map((f) => [f, stamp(f)]) });
  return bundle;
}

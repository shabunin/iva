/**
 * Watch a project folder for changes, and keep watching: Node's recursive
 * watcher dies when a folder inside goes away (iva build replacing dist/,
 * say) - it is started again instead of taking the server down.
 */

import fs from 'node:fs';
import path from 'node:path';

const IGNORED = /(^|[\\/])(\.|node_modules|dist)([\\/]|$)/;

export function watchTree(dir: string, recursive: boolean, onChange: (file: string) => void, log: (msg: string) => void = () => {}) {
  let watcher: fs.FSWatcher | null = null;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;
  let changed = '';
  const start = () => {
    if (closed) return;
    try {
      watcher = fs.watch(dir, { recursive }, (_ev, file) => {
        if (!file || IGNORED.test(String(file))) return;
        changed = String(file);
        clearTimeout(timer);
        timer = setTimeout(() => onChange(changed), 150);
      });
      watcher.on('error', (e: NodeJS.ErrnoException) => {
        watcher?.close();
        watcher = null;
        if (e.code !== 'ENOENT') log(`watching ${dir}: ${e.message} - watching again`);
        setTimeout(start, 300);
      });
    } catch (e: any) {
      log(`can't watch ${dir}: ${e.message} - trying again`);
      setTimeout(start, 1000);
    }
  };
  start();
  return {
    close() {
      closed = true;
      clearTimeout(timer);
      watcher?.close();
    },
  };
}

/**
 * Watch the files a build read, wherever they are (shared components
 * outside the project, iva/ui itself), and folders whose new files count
 * (assets/): nothing else, so logs or dist/ written next to the project
 * don't trigger a rebuild. Each file is watched through its folder, so an
 * editor saving by rename is still seen. set() replaces what's watched
 * after each build.
 */
export function watchInputs(onChange: (file: string) => void, log: (msg: string) => void = () => {}) {
  const watchers = new Map<string, { close(): void }>();
  let files = new Set<string>();
  let trees: string[] = [];
  let timer: NodeJS.Timeout | undefined;
  const fire = (file: string) => {
    clearTimeout(timer);
    timer = setTimeout(() => onChange(path.relative(process.cwd(), file) || file), 150);
  };
  const watchDir = (dir: string, recursive: boolean) => {
    const key = `${recursive ? 'tree' : 'dir'}:${dir}`;
    if (watchers.has(key)) return;
    watchers.set(key, watchTree(dir, recursive, (rel) => {
      const file = path.join(dir, rel);
      if (recursive || files.has(file)) fire(file);
    }, log));
  };
  return {
    set(next: { files: string[]; dirs: string[] }) {
      files = new Set(next.files.map((f) => path.resolve(f)));
      trees = next.dirs.map((d) => path.resolve(d));
      const want = new Set([...[...files].map((f) => `dir:${path.dirname(f)}`), ...trees.map((d) => `tree:${d}`)]);
      for (const [key, w] of watchers) {
        if (!want.has(key)) {
          w.close();
          watchers.delete(key);
        }
      }
      for (const f of files) if (fs.existsSync(path.dirname(f))) watchDir(path.dirname(f), false);
      for (const d of trees) if (fs.existsSync(d)) watchDir(d, true);
    },
    close() {
      clearTimeout(timer);
      for (const w of watchers.values()) w.close();
      watchers.clear();
    },
  };
}

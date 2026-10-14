/**
 * Watch a project folder for changes, and keep watching: Node's recursive
 * watcher dies when a folder inside goes away (iva build replacing dist/,
 * say) - it is started again instead of taking the server down.
 */

import fs from 'node:fs';

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

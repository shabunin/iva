/**
 * Watch a project folder for changes, and keep watching: Node's recursive
 * watcher dies when a folder inside goes away (iva build replacing dist/,
 * say) - it is started again instead of taking the server down.
 */

import fs from 'node:fs';
import path from 'node:path';

const IGNORED = /(^|[\\/])(\.|node_modules|dist)([\\/]|$)/;

export function watchTree(
  dir: string, recursive: boolean, onChange: (file: string) => void, log: (msg: string) => void = () => {},
  counts: (file: string) => boolean = () => true,
) {
  let watcher: fs.FSWatcher | null = null;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;
  let changed = '';
  const start = () => {
    if (closed) return;
    try {
      watcher = fs.watch(dir, { recursive }, (_ev, file) => {
        if (!file || IGNORED.test(String(file)) || !counts(String(file))) return;
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

/** A file as it is (time, size, inode: an editor saving by rename makes a new one); '' when there's none. */
function stamp(file: string): string {
  try {
    const s = fs.statSync(file);
    return `${s.mtimeMs}:${s.size}:${s.ino}`;
  } catch {
    return '';
  }
}

/**
 * Watch the files a build read, wherever they are (shared components
 * outside the project, iva/ui itself), and folders whose new files count
 * (assets/): nothing else, so logs or dist/ written next to the project
 * don't trigger a rebuild. Each file is watched through its folder, so an
 * editor saving by rename is still seen. set() replaces what's watched
 * after each build.
 *
 * A file counts as changed when it's no longer as the build left it: set()
 * notes each one. A build's own writes (a kit drawing pictures into .neu/ as
 * the project evaluates) are files as the build left them, so they don't
 * build again - whenever fs.watch tells of them: after the build, or while it
 * runs (a project with themes is evaluated once a look, with awaits between).
 * The events seen while a build runs are kept and decided once it's over
 * (onChange's promise settled), against what its set() noted, so one build
 * runs at a time. A file that changed while the build ran, after it was read
 * maybe, keeps the state it had when the build began: its event builds again.
 */
export function watchInputs(onChange: (file: string) => unknown, log: (msg: string) => void = () => {}) {
  const watchers = new Map<string, { close(): void }>();
  let files = new Map<string, string>();
  let trees: string[] = [];
  let began = new Map<string, string>();
  // while a build runs: the files events named (true: seen in a tree), for when it's over
  let held: Map<string, boolean> | null = null;
  let closed = false;
  let timer: NodeJS.Timeout | undefined;
  // a file read: when it isn't as noted; in a tree, any other file too (a new asset)
  const counts = (file: string, inTree: boolean) => {
    const noted = files.get(file);
    return noted === undefined ? inTree : stamp(file) !== noted;
  };
  const hold = (file: string, inTree: boolean) => {
    held!.set(file, inTree || held!.get(file) === true);
  };
  const fire = (file: string, inTree = false) => {
    if (closed) return;
    if (held) {
      hold(file, inTree);
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      began = new Map([...files.keys()].map((f) => [f, stamp(f)]));
      held = new Map();
      void Promise.resolve(onChange(path.relative(process.cwd(), file) || file)).finally(over);
    }, 150);
  };
  // the build is over (its set() done, or none if it threw): what was seen meanwhile that counts builds again
  const over = () => {
    const seen = held ?? new Map<string, boolean>();
    held = null;
    let last = '';
    for (const [file, inTree] of seen) if (counts(file, inTree)) last = file;
    if (last) fire(last);
  };
  const watchDir = (dir: string, recursive: boolean) => {
    const key = `${recursive ? 'tree' : 'dir'}:${dir}`;
    if (watchers.has(key)) return;
    const seen = (rel: string) => {
      const file = path.join(dir, rel);
      if (!held) return counts(file, recursive);
      hold(file, recursive);
      return false;
    };
    watchers.set(key, watchTree(dir, recursive, (rel) => fire(path.join(dir, rel), recursive), log, seen));
  };
  return {
    set(next: { files: string[]; dirs: string[] }) {
      files = new Map(next.files.map((f) => path.resolve(f)).map((f) => {
        const now = stamp(f);
        const then = began.get(f);
        return [f, then && then !== now ? then : now];
      }));
      trees = next.dirs.map((d) => path.resolve(d));
      const want = new Set([...[...files.keys()].map((f) => `dir:${path.dirname(f)}`), ...trees.map((d) => `tree:${d}`)]);
      for (const [key, w] of watchers) {
        if (!want.has(key)) {
          w.close();
          watchers.delete(key);
        }
      }
      for (const f of files.keys()) if (fs.existsSync(path.dirname(f))) watchDir(path.dirname(f), false);
      for (const d of trees) if (fs.existsSync(d)) watchDir(d, true);
    },
    close() {
      closed = true;
      clearTimeout(timer);
      for (const w of watchers.values()) w.close();
      watchers.clear();
    },
  };
}

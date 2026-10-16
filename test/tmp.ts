import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const made: string[] = [];
process.on('exit', () => {
  for (const dir of made) fs.rmSync(dir, { recursive: true, force: true });
});

/** A new folder in the system's temp folder, removed when the test process ends (a test run leaves nothing behind). */
export function tmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(dir);
  return dir;
}

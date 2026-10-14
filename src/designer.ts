/**
 * iva designer: open a .gui in CommandFusion GUI Designer (Windows; on Linux
 * and macOS through Wine). Where it is: $IVA_DESIGNER (the .exe), and on
 * Wine $IVA_WINEPREFIX; else the usual install places.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXE = path.join('drive_c', 'Program Files (x86)', 'CommandFusion', 'guiDesigner.exe');

export function findDesigner(): { exe: string; prefix?: string } {
  if (process.env.IVA_DESIGNER) {
    const exe = path.resolve(process.env.IVA_DESIGNER);
    if (!fs.existsSync(exe)) throw new Error(`IVA_DESIGNER: no ${exe}`);
    const prefix = process.env.IVA_WINEPREFIX ?? exe.match(/^(.*?)[\\/]drive_c[\\/]/)?.[1];
    return { exe, prefix };
  }
  if (process.platform === 'win32') {
    const exe = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'CommandFusion', 'guiDesigner.exe');
    if (fs.existsSync(exe)) return { exe };
  } else {
    for (const prefix of [process.env.IVA_WINEPREFIX, process.env.WINEPREFIX, path.join(os.homedir(), '.wine-cf'), path.join(os.homedir(), '.wine')]) {
      if (prefix && fs.existsSync(path.join(prefix, EXE))) return { exe: path.join(prefix, EXE), prefix };
    }
  }
  throw new Error('GUI Designer not found: set IVA_DESIGNER to guiDesigner.exe (and IVA_WINEPREFIX to its Wine prefix)');
}

/** Start GUI Designer with the .gui (detached: it keeps running after iva exits). */
export function openInDesigner(gui: string) {
  const { exe, prefix } = findDesigner();
  const file = path.resolve(gui);
  if (process.platform === 'win32') {
    spawn(exe, [file], { detached: true, stdio: 'ignore' }).unref();
    return { exe };
  }
  const env = { ...process.env, ...(prefix ? { WINEPREFIX: prefix } : {}) };
  const win = spawnSync('winepath', ['-w', file], { env, encoding: 'utf8' }).stdout?.trim() || `Z:${file.replace(/\//g, '\\')}`;
  spawn('wine', [exe, win], { env, detached: true, stdio: 'ignore' }).unref();
  return { exe, prefix };
}

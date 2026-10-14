/**
 * Minimal process shim (T0). Not a full Node process.
 */

function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad')) return 'darwin';
  if (ua.includes('mac')) return 'darwin';
  if (ua.includes('win')) return 'win32';
  if (ua.includes('linux')) return 'linux';
  return 'browser';
}

export const processShim = {
  env: {} as Record<string, string | undefined>,
  platform: detectPlatform(),
  arch: 'x64',
  version: 'iva-runtime',
  versions: {},
  browser: true as boolean | undefined,
  nextTick(callback: (...args: any[]) => void, ...args: any[]): void {
    queueMicrotask(() => callback(...args));
  },
  cwd(): string {
    return '/';
  },
};

export type ProcessShim = typeof processShim;

export function installProcessGlobal(target: typeof globalThis = globalThis): void {
  const g = target as any;
  if (!g.process) {
    g.process = processShim;
  } else {
    // Fill gaps only
    if (typeof g.process.nextTick !== 'function') {
      g.process.nextTick = processShim.nextTick.bind(processShim);
    }
  }
}

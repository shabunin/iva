/**
 * The phone as a GUI's scripts have it - CF.device's brightness, volume and
 * battery, the system bars, CF.setDeviceProperty, CF.interceptHardwareKey -
 * and the screen's auto-lock (CF.loadGUI's autoLockDelay): the app's side of
 * them (PanelDevice.kt) over window.ivaAndroid, a message channel Android
 * offers the panel's own page only (no web view in a GUI gets it). No
 * channel (an older app, a desktop build): null.
 *
 * To the app: hello (a page starting: the keys forgotten, the brightness and
 * the bars the panel's own again), set, keys, autoLock. From it: state (what
 * changed; quiet: what a set made of it) and key (one let go, held so long).
 */
import type { HostDeviceControl, HostDeviceProperties } from '../src/runtime/stdlib/host';

interface Channel {
  postMessage(message: string): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
}

export interface AndroidDevice extends HostDeviceControl {
  /** the screen kept on for so many minutes without a touch, then the device may lock (0: kept on) */
  autoLock(minutes: number): void;
}

export function androidDevice(): AndroidDevice | null {
  const channel = (window as unknown as { ivaAndroid?: Channel }).ivaAndroid;
  if (typeof channel?.postMessage !== 'function') return null;
  const post = (m: object) => channel.postMessage(JSON.stringify(m));
  const watchers: ((p: HostDeviceProperties, quiet: boolean) => void)[] = [];
  let onKey: ((keyCode: number, held: number) => void) | null = null;
  let first: ((p: HostDeviceProperties) => void) | null = null;
  const initial = new Promise<HostDeviceProperties>((resolve) => (first = resolve));
  channel.addEventListener('message', (e) => {
    let m: { type?: string; properties?: HostDeviceProperties; quiet?: boolean; keyCode?: number; held?: number };
    try {
      m = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (m.type === 'state' && m.properties) {
      // the first: the answer to hello, all of it
      if (first) {
        first(m.properties);
        first = null;
      } else for (const w of watchers) w(m.properties, !!m.quiet);
    } else if (m.type === 'key' && typeof m.keyCode === 'number') onKey?.(m.keyCode, Number(m.held) || 0);
  });
  post({ type: 'hello' });
  return {
    properties: () => initial,
    onChange: (cb) => void watchers.push(cb),
    set: (change) => post({ type: 'set', change }),
    keys: (keys, cb) => {
      onKey = cb;
      post({ type: 'keys', keys });
    },
    autoLock: (minutes) => post({ type: 'autoLock', minutes }),
  };
}

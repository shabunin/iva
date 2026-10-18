/**
 * A browser's device, as far as a page sees it: the battery (Chrome's
 * navigator.getBattery). Brightness, volume, the bars and the hardware keys
 * are nothing a page can reach: CF keeps what a script sets of them.
 */
import type { HostDeviceControl, HostDeviceProperties } from '../stdlib/host';

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

export function browserDevice(): HostDeviceControl | undefined {
  const nav = (globalThis as { navigator?: { getBattery?: () => Promise<BatteryManager> } }).navigator;
  if (typeof nav?.getBattery !== 'function') return undefined;
  const battery = nav.getBattery().catch(() => null);
  const read = (b: BatteryManager): HostDeviceProperties => ({
    batteryLevel: b.level,
    batteryChargeStatus: b.charging ? (b.level >= 1 ? 'full' : 'charging') : 'unplugged',
  });
  return {
    properties: async () => {
      const b = await battery;
      return b ? read(b) : {};
    },
    onChange: (cb) => {
      void battery.then((b) => {
        if (!b) return;
        for (const ev of ['levelchange', 'chargingchange']) b.addEventListener(ev, () => cb(read(b), false));
      });
    },
    set: () => {},
  };
}

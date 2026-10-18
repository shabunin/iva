/**
 * The device API on a host that has the device (the panel app on Android,
 * here a fake of it) and on one that hasn't: CF.device's brightness,
 * volume, battery as the device has them, DevicePropertyChangedEvent on the
 * device's changes and not on a script's own, CF.setDeviceProperty,
 * CF.interceptHardwareKey.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { setHost, type HostDeviceChange, type HostDeviceProperties, type HostHardwareKey } from '../src/runtime/stdlib/host.ts';

(globalThis as any).window ??= { devicePixelRatio: 1 };

/** a device: its properties at first, the changes it makes, what it was asked to set, the keys it was told of, a key let go */
function fakeDevice(start: HostDeviceProperties) {
  let changes: (p: HostDeviceProperties, quiet: boolean) => void = () => {};
  let onKey: (keyCode: number, held: number) => void = () => {};
  const sets: HostDeviceChange[] = [];
  let keys: HostHardwareKey[] = [];
  const control = {
    properties: async () => start,
    onChange: (cb: typeof changes) => (changes = cb),
    set: (c: HostDeviceChange) => void sets.push(c),
    keys: (k: HostHardwareKey[], cb: typeof onKey) => {
      keys = k;
      onKey = cb;
    },
  };
  return { control, sets, keys: () => keys, change: (p: HostDeviceProperties, quiet = false) => changes(p, quiet), letGo: (k: number, held: number) => onKey(k, held) };
}

/** a CF on a host with that device, its device loaded, and what DevicePropertyChangedEvent told */
async function cfOn(dev: ReturnType<typeof fakeDevice> | null) {
  setHost({ name: 't', net: {} as any, deviceControl: dev?.control } as any);
  const cf: any = new CFAPI();
  await cf.loadDevice();
  const heard: [string, unknown][] = [];
  cf.watch(cf.DevicePropertyChangedEvent, (p: string, v: unknown) => heard.push([p, v]));
  return { cf, heard };
}

test("CF.device: the device's brightness, volume, battery from the start (no event for them); each change after it makes: DevicePropertyChangedEvent (property, value), once", async (t) => {
  t.after(() => setHost(null));
  const dev = fakeDevice({ screenBrightness: 0.4, soundOutputVolume: 0.6, batteryLevel: 0.82, batteryChargeStatus: 'charging', statusBar: 'hidden', navigationBar: 'hidden' });
  const { cf, heard } = await cfOn(dev);
  assert.deepEqual([cf.device.screenBrightness, cf.device.soundOutputVolume, cf.device.batteryLevel, cf.device.batteryChargeStatus], [0.4, 0.6, 0.82, cf.CHARGE_CHARGING]);
  assert.deepEqual(heard, []);
  // the battery, the user's brightness, a swipe showing the status bar
  dev.change({ batteryLevel: 0.83 });
  dev.change({ batteryLevel: 0.83, batteryChargeStatus: 'full' });
  dev.change({ screenBrightness: 0.7 });
  dev.change({ statusBar: 'visible' });
  dev.change({ statusBar: 'hidden', navigationBar: 'hidden' });
  dev.change({ soundOutputVolume: 0.6 });
  assert.deepEqual(heard, [
    [cf.BatteryLevelProperty, 0.83],
    [cf.BatteryChargeStatusProperty, cf.CHARGE_FULL],
    [cf.ScreenBrightnessProperty, 0.7],
    [cf.StatusBarAppearanceProperty, cf.STATUS_BAR_VISIBLE],
    [cf.StatusBarAppearanceProperty, cf.STATUS_BAR_HIDDEN],
  ]);
  assert.equal(cf.device.batteryLevel, 0.83);
  // quiet: what a set made of the device (a volume on its step) - CF.device has it, no script hears
  dev.change({ soundOutputVolume: 0.4667 }, true);
  assert.equal(cf.device.soundOutputVolume, 0.4667);
  assert.equal(heard.length, 5);
});

test("CF.setDeviceProperty: brightness and volume 0 to 1 (clipped), the bars shown or hidden, the status bar's text - asked of the device, CF.device has it at once, no event; nonsense refused", async (t) => {
  t.after(() => setHost(null));
  const dev = fakeDevice({ screenBrightness: 0.5, soundOutputVolume: 0.5 });
  const { cf, heard } = await cfOn(dev);
  cf.setDeviceProperty(cf.ScreenBrightnessProperty, 0.25);
  assert.equal(cf.device.screenBrightness, 0.25);
  cf.setDeviceProperty(cf.ScreenBrightnessProperty, 3);
  cf.setDeviceProperty(cf.SoundOutputVolumeProperty, '0.3');
  cf.setDeviceProperty(cf.StatusBarAppearanceProperty, cf.STATUS_BAR_VISIBLE);
  cf.setDeviceProperty(cf.StatusBarAppearanceProperty, cf.STATUS_BAR_BLACK_TEXT);
  cf.setDeviceProperty(cf.NavigationBarAppearanceProperty, cf.NAVIGATION_BAR_VISIBLE);
  assert.deepEqual(dev.sets, [
    { screenBrightness: 0.25 },
    { screenBrightness: 1 },
    { soundOutputVolume: 0.3 },
    { statusBar: 'visible' },
    { statusBarText: 'black' },
    { navigationBar: 'visible' },
  ]);
  assert.deepEqual([cf.device.screenBrightness, cf.device.soundOutputVolume], [1, 0.3]);
  // the device reporting what was set: nothing new, no event
  dev.change({ screenBrightness: 1, statusBar: 'visible', navigationBar: 'visible' });
  assert.deepEqual(heard, []);
  // refused: no number, a bar value that isn't one, the battery (read only), not a property
  cf.setDeviceProperty(cf.ScreenBrightnessProperty, 'dim');
  cf.setDeviceProperty(cf.StatusBarAppearanceProperty, 'pink');
  cf.setDeviceProperty(cf.NavigationBarAppearanceProperty, cf.STATUS_BAR_HIDDEN);
  cf.setDeviceProperty(cf.BatteryLevelProperty, 0.5);
  cf.setDeviceProperty('SOMETHING', 1);
  assert.equal(dev.sets.length, 6);
  assert.equal(cf.device.batteryLevel, 1);
});

test('CF.interceptHardwareKey: the keys told to the device (code, hold, intercept); a key let go calls the callbacks of as short a hold with (keyCode, held); a null callback ends that watch', async (t) => {
  t.after(() => setHost(null));
  const dev = fakeDevice({});
  const { cf } = await cfOn(dev);
  const calls: string[] = [];
  cf.interceptHardwareKey(cf.HARDWARE_KEY_BACK, 0, cf.KEYPRESS_INTERCEPT, (k: number, held: number) => calls.push(`back ${k} ${held}`));
  cf.interceptHardwareKey(cf.HARDWARE_KEY_BACK, 1000, cf.KEYPRESS_INTERCEPT, (k: number, held: number) => calls.push(`long back ${held}`));
  cf.interceptHardwareKey(cf.HARDWARE_KEY_VOLUME_UP, 250, cf.KEYPRESS_OBSERVE, () => calls.push('volume up'));
  assert.deepEqual(dev.keys(), [
    { keyCode: 4, pressTime: 0, intercept: true },
    { keyCode: 4, pressTime: 1000, intercept: true },
    { keyCode: 24, pressTime: 250, intercept: false },
  ]);
  dev.letGo(4, 120);
  dev.letGo(4, 1500);
  dev.letGo(24, 100);
  dev.letGo(24, 300);
  dev.letGo(25, 300);
  assert.deepEqual(calls, ['back 4 120', 'back 4 1500', 'long back 1500', 'volume up']);
  // the same three again: the callback replaced; null: that watch ended
  cf.interceptHardwareKey(4, 0, cf.KEYPRESS_INTERCEPT, () => calls.push('back again'));
  cf.interceptHardwareKey(4, 1000, cf.KEYPRESS_INTERCEPT, null);
  assert.deepEqual(dev.keys(), [{ keyCode: 24, pressTime: 250, intercept: false }, { keyCode: 4, pressTime: 0, intercept: true }]);
  calls.length = 0;
  dev.letGo(4, 2000);
  assert.deepEqual(calls, ['back again']);
  // no key code: refused; a callback that throws doesn't stop the others
  cf.interceptHardwareKey('BACK', 0, cf.KEYPRESS_INTERCEPT, () => {});
  assert.equal(dev.keys().length, 2);
  cf.interceptHardwareKey(24, 0, cf.KEYPRESS_OBSERVE, () => {
    throw new Error('oops');
  });
  calls.length = 0;
  dev.letGo(24, 400);
  assert.deepEqual(calls, ['volume up']);
});

test('no device on the host (the preview without a battery): CF.device keeps what a script sets; the keys go nowhere, nothing breaks', async (t) => {
  t.after(() => setHost(null));
  const { cf, heard } = await cfOn(null);
  cf.setDeviceProperty(cf.ScreenBrightnessProperty, 0.3);
  cf.setDeviceProperty(cf.SoundOutputVolumeProperty, 0.2);
  assert.deepEqual([cf.device.screenBrightness, cf.device.soundOutputVolume], [0.3, 0.2]);
  cf.interceptHardwareKey(cf.HARDWARE_KEY_BACK, 0, cf.KEYPRESS_INTERCEPT, () => {});
  assert.deepEqual(heard, []);
  assert.equal(cf.device.batteryChargeStatus, cf.CHARGE_UNKNOWN);
});

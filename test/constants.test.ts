/**
 * The CF object's documented constants (Utilities, Device and Sensors APIs),
 * and CF.loadAsset's cache modes as the docs have them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { CONSTANTS } from '../src/runtime/cf/jsapi/constants.ts';
import { loadAsset } from '../src/runtime/cf/jsapi/utilities.ts';

(globalThis as any).window ??= { devicePixelRatio: 1 };

test("the documented constants are there, as strings, each its own: loadAsset's cache modes, device properties and their values, hardware keys, sensors, beacons", () => {
  const CF: any = new CFAPI();
  const names = [
    'CACHE_READONLY', 'CACHE', 'NO_CACHE', 'RECACHE', 'DECACHE',
    'ScreenBrightnessProperty', 'SoundOutputVolumeProperty', 'BatteryLevelProperty', 'BatteryChargeStatusProperty', 'StatusBarAppearanceProperty', 'NavigationBarAppearanceProperty',
    'CHARGE_UNKNOWN', 'CHARGE_UNPLUGGED', 'CHARGE_CHARGING', 'CHARGE_FULL',
    'STATUS_BAR_HIDDEN', 'STATUS_BAR_VISIBLE', 'STATUS_BAR_WHITE_TEXT', 'STATUS_BAR_BLACK_TEXT', 'NAVIGATION_BAR_HIDDEN', 'NAVIGATION_BAR_VISIBLE',
    'KEYPRESS_INTERCEPT', 'KEYPRESS_OBSERVE', 'HARDWARE_KEY_BACK', 'HARDWARE_KEY_VOLUME_UP', 'HARDWARE_KEY_VOLUME_DOWN',
    'AccelerometerSensor', 'GyroscopeSensor', 'AttitudeSensor', 'HeadingSensor', 'LocationSensor',
    'BeaconDetectionEvent', 'BeaconProximityUnknown', 'BeaconProximityImmediate', 'BeaconProximityNear', 'BeaconProximityFar',
  ];
  for (const n of names) assert.equal(typeof CF[n], 'string', `CF.${n}`);
  assert.equal(new Set(names.map((n) => CF[n])).size, names.length, 'distinct values');
  // the Sensors API's names of the two sensors CF.device.hasSensors is keyed by: the same keys
  assert.equal(CF.AccelerometerSensor, CF.Accelerometer);
  assert.equal(CF.GyroscopeSensor, CF.Gyroscope);
  assert.equal(CF.device.batteryChargeStatus, CF.CHARGE_UNKNOWN);
  // a beacon event is watchable like any other
  const beacons: unknown[] = [];
  CF.watch(CF.BeaconDetectionEvent, (list: unknown) => beacons.push(list));
  CF.dispatchEvent(CF.BeaconDetectionEvent, [{ uuid: 'u', major: 1, minor: 2, proximity: CF.BeaconProximityNear, rssi: -60 }]);
  assert.equal(beacons.length, 1);
});

test('CF.loadAsset: CACHE_READONLY (the default) and CACHE read the cache, CACHE keeps; NO_CACHE and RECACHE load afresh, RECACHE keeps; DECACHE drops it and calls nothing back', async () => {
  const fetched: [string, RequestInit | undefined][] = [];
  let body = 'one';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    fetched.push([url, init]);
    const bytes = new TextEncoder().encode(body);
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  }) as unknown as typeof fetch;
  try {
    const ctx: any = { renderer: null };
    const flush = () => new Promise((r) => setImmediate(r));
    const load = async (mode?: string) => {
      let got: unknown = 'not called';
      loadAsset(ctx, 'notes.txt', CONSTANTS.UTF8, (data: unknown) => { got = data; }, mode);
      await flush();
      await flush();
      return got;
    };
    // the default: loaded, not kept - loaded again next time
    assert.equal(await load(), 'one');
    assert.equal(await load(), 'one');
    assert.equal(fetched.length, 2);
    // CACHE: loaded once, kept; CACHE and CACHE_READONLY read it from there
    body = 'two';
    assert.equal(await load(CONSTANTS.CACHE), 'two');
    assert.equal(await load(CONSTANTS.CACHE), 'two');
    assert.equal(await load(CONSTANTS.CACHE_READONLY), 'two');
    assert.equal(fetched.length, 3);
    // NO_CACHE: afresh, the cache left as it was
    body = 'three';
    assert.equal(await load(CONSTANTS.NO_CACHE), 'three');
    assert.deepEqual(fetched[3], ['notes.txt', { cache: 'no-store' }]);
    assert.equal(await load(CONSTANTS.CACHE), 'two');
    // RECACHE: afresh, and kept
    body = 'four';
    assert.equal(await load(CONSTANTS.RECACHE), 'four');
    assert.deepEqual(fetched[4], ['notes.txt', { cache: 'no-store' }]);
    assert.equal(await load(CONSTANTS.CACHE), 'four');
    assert.equal(fetched.length, 5);
    // DECACHE: nothing loaded, nothing called back; the next CACHE loads again
    assert.equal(await load(CONSTANTS.DECACHE), 'not called');
    assert.equal(fetched.length, 5);
    body = 'five';
    assert.equal(await load(CONSTANTS.CACHE), 'five');
    assert.equal(fetched.length, 6);
    // binary: a char a byte
    body = 'Aé';
    assert.equal(await (async () => { let got: unknown; loadAsset(ctx, 'bin', CONSTANTS.BINARY, (d: unknown) => { got = d; }, CONSTANTS.NO_CACHE); await flush(); await flush(); return got; })(), 'AÃ©');
  } finally {
    globalThis.fetch = realFetch;
  }
});

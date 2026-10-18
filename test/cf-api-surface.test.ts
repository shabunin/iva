/**
 * CommandFusion's JavaScript API, member by member (commandfusion.com/docs/
 * scripting: gui, lists, display, sound, net, video, sensors, util, globals,
 * startup, modules), on the live CF object of iva's runtime running a GUI
 * (test/gui-runtime.ts): every documented function a function, every event,
 * constant and variable there - a script never meets "undefined is not a
 * function" - and the CRC and hash known answers. The lists are the ones
 * docs/cf-api-compatibility.md was written from.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui, answer } from './gui-runtime.ts';

const GUI = '<page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1"><portrait /><landscape /></page>';

/** the 44 documented functions, by the docs' page */
const FUNCTIONS = {
  startup: ['watch', 'unwatch'],
  gui: ['getJoin', 'getJoins', 'setJoin', 'setJoins', 'setToken', 'addTag', 'removeTag', 'getProperties', 'setProperties', 'getGuiDescription'],
  lists: ['listAdd', 'listUpdate', 'listRemove', 'listScroll', 'listInfo', 'listContents'],
  display: ['flipToPage'],
  sound: ['playSound', 'stopSound', 'muteSound', 'unmuteSound'],
  net: ['setSystemProperties', 'send', 'runCommand', 'runMacro', 'stopMacro', 'request', 'startLookup', 'stopLookup', 'startPublishing', 'stopPublishing'],
  sensors: ['startMonitoring', 'stopMonitoring'],
  util: ['log', 'logObject', 'crc', 'hash', 'openURL', 'loadGUI', 'loadAsset', 'setDeviceProperty', 'interceptHardwareKey'],
};

/** the 25 documented events */
const EVENTS = [
  'PreloadingCompleteEvent', 'JoinChangeEvent', 'InputFieldEditedEvent', 'KeyboardUpEvent', 'KeyboardDownEvent',
  'ObjectPressedEvent', 'ObjectDraggedEvent', 'ObjectReleasedEvent', 'GUISuspendedEvent', 'GUIResumedEvent',
  'OrientationChangeEvent', 'PageFlipEvent',
  'ListWillStartScrollingEvent', 'ListDidScrollEvent', 'ListDidEndScrollingEvent',
  'NetworkStatusChangeEvent', 'ConnectionStatusChangeEvent', 'FeedbackMatchedEvent',
  'MovieInfoReceivedEvent', 'MoviePlaybackStateChangedEvent', 'MovieLoadStateChangedEvent',
  'DevicePropertyChangedEvent', 'ApplicationCallbackEvent', 'PushNotificationEvent',
  'BeaconDetectionEvent',
];

/** the documented constants (globals, util, sensors; LandscapeOrienation: the globals page's own spelling) */
const CONSTANTS = [
  'GlobalTokensJoin',
  'PortraitOrientation', 'LandscapeOrientation', 'LandscapeOrienation',
  'AnimationCurveLinear', 'AnimationCurveEaseIn', 'AnimationCurveEaseOut', 'AnimationCurveEaseInOut',
  'UTF8', 'BINARY',
  'Hash_MD5', 'Hash_SHA1', 'Hash_SHA256', 'Hash_SHA384', 'Hash_SHA512',
  'CRC_8', 'CRC_16', 'CRC_16_CCITT', 'CRC_16_MODBUS', 'CRC_32', 'CRC_32C',
  'OUTPUT_NUMBER', 'OUTPUT_STRING', 'OUTPUT_BINARY', 'OUTPUT_BINARY_LE',
  'LastItem', 'AllItems',
  'TopPosition', 'MiddlePosition', 'BottomPosition', 'VisiblePosition', 'RelativePosition', 'PixelPosition',
  'Accelerometer', 'Gyroscope',
  'AccelerometerSensor', 'GyroscopeSensor', 'AttitudeSensor', 'HeadingSensor', 'LocationSensor',
  'BeaconProximityUnknown', 'BeaconProximityImmediate', 'BeaconProximityNear', 'BeaconProximityFar',
  'CACHE_READONLY', 'CACHE', 'NO_CACHE', 'RECACHE', 'DECACHE',
  'ScreenBrightnessProperty', 'SoundOutputVolumeProperty', 'BatteryLevelProperty', 'BatteryChargeStatusProperty',
  'StatusBarAppearanceProperty', 'NavigationBarAppearanceProperty',
  'CHARGE_UNKNOWN', 'CHARGE_UNPLUGGED', 'CHARGE_CHARGING', 'CHARGE_FULL',
  'STATUS_BAR_HIDDEN', 'STATUS_BAR_VISIBLE', 'STATUS_BAR_WHITE_TEXT', 'STATUS_BAR_BLACK_TEXT',
  'NAVIGATION_BAR_HIDDEN', 'NAVIGATION_BAR_VISIBLE',
  'KEYPRESS_INTERCEPT', 'KEYPRESS_OBSERVE',
  'HARDWARE_KEY_BACK', 'HARDWARE_KEY_VOLUME_UP', 'HARDWARE_KEY_VOLUME_DOWN',
];

/** CF.device's documented fields */
const DEVICE = [
  'platform', 'version', 'model', 'uuid', 'legacyUniqueIdentifier', 'uniqueIdentifier', 'name',
  'screenBrightness', 'soundOutputVolume', 'batteryLevel', 'batteryChargeStatus', 'hasSensors', 'displayDensity', 'machineName', 'pushid',
];

/** the documented variables on CF itself */
const VARIABLES = ['guiURL', 'currentPage', 'currentOrientation', 'systems', 'modules', 'ipv4address', 'ipv4netmask', 'ipv6address', 'ipv6netmask', 'MACaddress', 'networkType', 'networkSSID'];

test('every documented function is a function on the live CF object (44)', async () => {
  const { CF } = await runGui(GUI);
  const all = Object.values(FUNCTIONS).flat();
  assert.equal(all.length, 44);
  assert.equal(new Set(all).size, all.length, 'each once');
  const missing = all.filter((name) => typeof (CF as any)[name] !== 'function');
  assert.deepEqual(missing, []);
});

test('every documented event (25), constant and CF.device field exists; the events and constants are distinct strings', async () => {
  const { CF } = await runGui(GUI);
  assert.equal(EVENTS.length, 25);
  const cf = CF as any;
  assert.deepEqual(EVENTS.filter((e) => typeof cf[e] !== 'string'), []);
  assert.equal(new Set(EVENTS.map((e) => cf[e])).size, EVENTS.length, 'each event its own name');
  assert.deepEqual(CONSTANTS.filter((c) => cf[c] === undefined || cf[c] === null), []);
  // the typo the docs carry is the landscape orientation itself
  assert.equal(cf.LandscapeOrienation, cf.LandscapeOrientation);
  assert.deepEqual([cf.OUTPUT_NUMBER, cf.OUTPUT_STRING, cf.OUTPUT_BINARY, cf.OUTPUT_BINARY_LE], [0, 1, 2, 3]);
  assert.deepEqual(DEVICE.filter((f) => !(f in cf.device)), []);
  assert.deepEqual(['platform', 'version', 'model', 'uuid', 'uniqueIdentifier', 'name', 'machineName', 'pushid'].filter((f) => typeof cf.device[f] !== 'string'), []);
  assert.deepEqual(['screenBrightness', 'soundOutputVolume', 'batteryLevel', 'displayDensity'].filter((f) => typeof cf.device[f] !== 'number'), []);
  assert.equal(typeof cf.device.hasSensors, 'object');
  assert.deepEqual(VARIABLES.filter((v) => cf[v] === undefined), []);
  assert.equal(typeof cf.systems, 'object');
  assert.ok(Array.isArray(cf.modules));
});

test("CF.crc known answers for \"123456789\": CRC_8 F4, CRC_16 BB3D, CRC_16_CCITT 29B1, CRC_16_MODBUS 4B37, CRC_32 CBF43926, CRC_32C E3069283; the output formats", async () => {
  const { CF } = await runGui(GUI);
  const crc = async (type: string, format: number) => (await answer<[unknown]>((cb) => CF.crc(type, '123456789', format, cb)))[0];
  const hex = await Promise.all([CF.CRC_8, CF.CRC_16, CF.CRC_16_CCITT, CF.CRC_16_MODBUS, CF.CRC_32, CF.CRC_32C].map((t) => crc(t, CF.OUTPUT_STRING)));
  assert.deepEqual(hex, ['F4', 'BB3D', '29B1', '4B37', 'CBF43926', 'E3069283']);
  assert.equal(await crc(CF.CRC_32, CF.OUTPUT_NUMBER), 0xcbf43926);
  assert.equal(await crc(CF.CRC_16, CF.OUTPUT_BINARY), '\xbb\x3d');
  assert.equal(await crc(CF.CRC_16, CF.OUTPUT_BINARY_LE), '\x3d\xbb');
});

test('CF.hash known answers for "abc": MD5 900150983cd24fb0d6963f7d28e17f72, SHA1 a9993e364706816aba3e25717850c26c9cd0d89d', async () => {
  const { CF } = await runGui(GUI);
  const hash = async (type: string) => (await answer<[string]>((cb) => CF.hash(type, 'abc', cb)))[0];
  assert.equal(await hash(CF.Hash_MD5), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(await hash(CF.Hash_SHA1), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(await hash(CF.Hash_SHA256), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

// A virtual Matter light on this machine (matter.js's own server node): to try the example without a device.
// An extended colour light - OnOff, LevelControl and ColorControl on endpoint 1 - commissionable on the network
// with the example's placeholder setup code (passcode 20202021, discriminator 3840: 34970112332).
//
//   node examples/matter/virtual-light.mjs [--port 5540] [--passcode 20202021] [--discriminator 3840] [--clear]
//
// Its state (fabric, certificates) is kept in examples/matter/.virtual-light (--clear starts it over: the panel's
// controller must then forget it too - clear the panel's tokens). Each change of the light's state is printed.
import { Endpoint, Environment, ServerNode, VendorId } from '@matter/main';
import { ColorControlServer } from '@matter/main/behaviors/color-control';
import { ExtendedColorLightDevice } from '@matter/main/devices/extended-color-light';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: '5540' },
    passcode: { type: 'string', default: '20202021' },
    discriminator: { type: 'string', default: '3840' },
    clear: { type: 'boolean', default: false },
  },
});
const dir = path.join(import.meta.dirname, '.virtual-light');
if (values.clear) fs.rmSync(dir, { recursive: true, force: true });
const env = Environment.default;
env.vars.set('storage.path', dir);
env.vars.set('logger.format', 'plain');

const say = (m) => process.stdout.write(`[light] ${m}\n`);

const node = await ServerNode.create({
  id: 'iva-virtual-light',
  network: { port: Number(values.port) },
  commissioning: { passcode: Number(values.passcode), discriminator: Number(values.discriminator) },
  productDescription: { name: 'iva virtual light', deviceType: ExtendedColorLightDevice.deviceType },
  basicInformation: {
    vendorName: 'iva', vendorId: VendorId(0xfff1), nodeLabel: 'iva virtual light', productName: 'Virtual light', productLabel: 'Virtual light',
    productId: 0x8000, serialNumber: 'iva-virtual-light-1', uniqueId: 'iva-virtual-light-1',
  },
});
// matter.js's extended colour light has XY and colour temperature; hue and saturation (what the driver sends) added,
// with the colour temperature range the cluster asks for
const Light = ExtendedColorLightDevice.with(ColorControlServer.with('HueSaturation', 'Xy', 'ColorTemperature'));
const light = new Endpoint(Light, {
  id: 'light',
  colorControl: {
    colorMode: 0, enhancedColorMode: 0, currentHue: 0, currentSaturation: 0,
    colorTempPhysicalMinMireds: 153, colorTempPhysicalMaxMireds: 500, colorTemperatureMireds: 250, coupleColorTempToLevelMinMireds: 153, startUpColorTemperatureMireds: 250,
  },
});
await node.add(light);
light.events.onOff.onOff$Changed.on((on) => say(`on/off: ${on ? 'on' : 'off'}`));
light.events.levelControl.currentLevel$Changed.on((level) => say(`level: ${level}`));
light.events.colorControl.currentHue$Changed.on((hue) => say(`hue: ${hue}`));
light.events.colorControl.currentSaturation$Changed.on((sat) => say(`saturation: ${sat}`));
node.lifecycle.commissioned.on(() => say('commissioned'));
node.lifecycle.decommissioned.on(() => say('decommissioned'));
node.lifecycle.online.on(() => {
  const c = node.state.commissioning;
  say(`online on port ${values.port}: ${c.commissioned ? `commissioned (fabrics: ${Object.keys(c.fabrics ?? {}).length})` : `commissionable - passcode ${values.passcode}, discriminator ${values.discriminator}; pairing code ${c.pairingCodes?.manualPairingCode ?? '?'}`}`);
});
await node.run();

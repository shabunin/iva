/**
 * iva/drivers/mqtt's client id: the same GUI on two panels connects as two
 * clients (a broker drops the one connected when another comes with its id),
 * each its device's id, kept across reconnects; one given stays as given.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { MQTT_RUNTIME } from '../lib/drivers/mqtt/runtime.ts';
import { tmpDir } from './tmp.ts';

/** the driver's script on a stand-in panel with this CF.device; what <Mqtt> starts it with run on it */
function panel(device: Record<string, string> | undefined, add: string) {
  const sent: string[] = [];
  const conn: ((system: string, up: boolean) => void)[] = [];
  const CF: any = {
    JoinChangeEvent: 'join', FeedbackMatchedEvent: 'fb', ConnectionStatusChangeEvent: 'conn', device,
    send(_system: string, data: string) { sent.push(data); },
    setJoin() {},
    watch(event: string, ...args: any[]) { if (event === 'conn') conn.push(args[1]); },
    setSystemProperties() {},
    log() {},
  };
  const IvaMqtt = new Function('CF', 'setTimeout', 'setInterval', 'clearInterval', `${MQTT_RUNTIME}\n${add}\nreturn IvaMqtt;`)(CF, () => 0, () => 0, () => {});
  /** the system connected (again): the client id its CONNECT gives */
  const connect = (): string => {
    for (const cb of conn) cb('m', false);
    for (const cb of conn) cb('m', true);
    const r = IvaMqtt.parse(sent.join(''));
    sent.length = 0;
    assert.equal(r.packets.length, 1);
    assert.equal(r.packets[0].name, 'connect');
    return r.packets[0].clientId;
  };
  return { connect };
}

/** the IvaMqtt.add line <Mqtt> compiles to */
async function compiled(props: string): Promise<string> {
  const dir = tmpDir('iva-mqtt-id-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Mqtt } from 'iva/drivers/mqtt';
export default (<Project name="T" width={1024} height={768}><Page name="Main"><Mqtt name="m" host="h" ${props} /></Page></Project>);
`);
  const r = await compile(path.join(dir, 'app.jsx'));
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  return /IvaMqtt\.add\([^\n]*?\);/.exec(start)![0];
}

/** what a broker has to take: 1-23 letters and digits (MQTT 3.1.1, 3.1.3.1) */
const SAFE = /^[0-9a-zA-Z]{1,23}$/;

test("<Mqtt> with no clientId: each panel its own, from its device's id, the same on every reconnect", async () => {
  const add = await compiled('');
  assert.doesNotMatch(add, /clientId/);
  const phone = panel({ uniqueIdentifier: '3F2A9C1B-7D4E-4F0A-9B12-55C0FFEE0001', uuid: 'old' }, add);
  const ipad = panel({ uniqueIdentifier: '8E11D0A4-2B6C-4C3D-8A77-0123456789AB', uuid: 'old' }, add);
  const a = phone.connect();
  const b = ipad.connect();
  assert.notEqual(a, b);
  assert.equal(a, 'iva3F2A9C1B7D4E4F0A9B12');
  assert.match(a, SAFE);
  assert.match(b, SAFE);
  assert.equal(phone.connect(), a, 'the same id after a reconnect');
  // the older field when that's all there is
  assert.equal(panel({ uuid: 'abc-123' }, add).connect(), 'ivaabc123');
});

test('no device id: one made up, kept while the GUI runs; a clientId given stays as given', async () => {
  const add = await compiled('');
  const one = panel(undefined, add);
  const id = one.connect();
  assert.match(id, SAFE);
  assert.match(id, /^iva./);
  assert.equal(one.connect(), id);
  assert.notEqual(panel({ uniqueIdentifier: '', uuid: '' }, add).connect(), id);
  const given = await compiled('clientId="kitchen-panel"');
  assert.match(given, /clientId: "kitchen-panel"/);
  assert.equal(panel({ uniqueIdentifier: '3F2A9C1B' }, given).connect(), 'kitchen-panel');
});

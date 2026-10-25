/**
 * iva/drivers/mqtt's "no echo" on iva's own runtime, whose join events come
 * a microtask after the change, each in its turn, none for a value the join
 * already has: what subscriptions set is never published back - several
 * messages for a join in one read, a retained one again on a reconnect -
 * and the panel's own change always is.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
import { MQTT_RUNTIME } from '../lib/drivers/mqtt/runtime.ts';

const GUI = `<page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1"><portrait /><landscape /></page>`;

/** the driver on the runtime's CF, connected; the broker's side the test's: what's sent, what comes back */
async function panel() {
  const { CF } = await runGui(GUI);
  const sent: string[] = [];
  (CF as any).send = (_system: string, data: string) => sent.push(data);
  const IvaMqtt = new Function('CF', `${MQTT_RUNTIME}\nreturn IvaMqtt;`)(CF);
  IvaMqtt.add('mqtt', {
    keepalive: 0,
    subscribe: { 'home/level': { join: 'a1', type: 'a' }, 'home/lamp': { join: 'd1', type: 'd' } },
    publish: { 'home/level/set': { join: 'a1', type: 'a' }, 'home/lamp/set': { join: 'd1', type: 'd', on: 'ON', off: 'OFF' } },
  });
  /** bytes from the broker, in one read; then the join events they bring */
  const feed = async (data: string) => {
    CF.dispatchEvent(CF.FeedbackMatchedEvent, 'mqtt', 'frame', data);
    await new Promise((r) => setTimeout(r, 0));
  };
  /** the PUBLISHes sent since last asked, as topic=payload */
  const published = (): string[] => {
    const r = IvaMqtt.parse(sent.join(''));
    sent.length = 0;
    return r.packets.filter((p: any) => p.name === 'publish').map((p: any) => `${p.topic}=${p.payload}`);
  };
  /** the panel's own change (a slider, a button) */
  const change = async (join: string, v: number) => {
    CF.setJoin(join, v);
    await new Promise((r) => setTimeout(r, 0));
  };
  const msg = (topic: string, payload: string) => IvaMqtt.encode.publish(topic, payload);
  CF.dispatchEvent(CF.ConnectionStatusChangeEvent, 'mqtt', true, '::1:1883');
  await feed(IvaMqtt.encode.connack(0));
  published();
  return { CF, feed, published, change, msg };
}

test('two messages for a join in one read (a dimmer ramping): neither published back; the next change of the panel is', async () => {
  const { feed, published, change, msg } = await panel();
  await feed(msg('home/level', '10') + msg('home/level', '30'));
  assert.deepEqual(published(), []);
  await feed(msg('home/level', '100') + msg('home/level', '200') + msg('home/level', '100'));
  assert.deepEqual(published(), []);
  await change('a1', 500);
  assert.deepEqual(published(), ['home/level/set=500']);
  // on, off, on in one read: three events, none of them a command
  await feed(msg('home/lamp', 'ON') + msg('home/lamp', 'OFF') + msg('home/lamp', 'ON'));
  assert.deepEqual(published(), []);
  await change('d1', 0);
  assert.deepEqual(published(), ['home/lamp/set=OFF']);
});

test('a message the join has already (a retained one again on a reconnect) brings no event: the next one still isn\'t published back, the panel\'s change is', async () => {
  const { feed, published, change, msg } = await panel();
  await feed(msg('home/level', '30'));
  await feed(msg('home/level', '30'));
  await feed(msg('home/level', '10'));
  assert.deepEqual(published(), []);
  // back to the value the unanswered write had: the panel's, so published
  await change('a1', 30);
  assert.deepEqual(published(), ['home/level/set=30']);
  await feed(msg('home/lamp', 'ON'));
  await feed(msg('home/lamp', 'ON'));
  await change('d1', 0);
  await change('d1', 1);
  assert.deepEqual(published(), ['home/lamp/set=OFF', 'home/lamp/set=ON']);
  // many messages the join has, then a new one: still no echo
  for (let i = 0; i < 40; i++) await feed(msg('home/lamp', 'ON'));
  await feed(msg('home/lamp', 'OFF'));
  assert.deepEqual(published(), []);
});

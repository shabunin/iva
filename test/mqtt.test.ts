/**
 * iva/drivers/mqtt: the codec (every packet, the remaining length's edges,
 * frames split and merged), topic filters, the driver's script on a stand-in
 * panel (what it sends, watches and sets), and what the component compiles to.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/compiler/index.ts';
import { MQTT_RUNTIME } from '../lib/drivers/mqtt/runtime.ts';
import { tmpDir } from './tmp.ts';

const EXAMPLE = path.resolve(import.meta.dirname, '../examples/mqtt/app.jsx');
const b = (...codes: number[]) => String.fromCharCode(...codes);
const codes = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

type Watcher = { event: string; system?: string; feedback?: string; joins?: string | string[]; cb: (...a: any[]) => void };

/** The driver's script on a stand-in panel: what it sends, watches, sets and asks of the system; its timers run by the test. */
function panel() {
  const sent: string[] = [];
  const joins: Record<string, any> = {};
  const sets: [string, any][] = [];
  const props: [string, any][] = [];
  const watchers: Watcher[] = [];
  const timers: ({ fn: () => void; ms: number; repeat: boolean } | null)[] = [];
  const CF: any = {
    JoinChangeEvent: 'join', FeedbackMatchedEvent: 'fb', ConnectionStatusChangeEvent: 'conn',
    send(_system: string, data: string) { sent.push(data); },
    setJoin(j: string, v: any) {
      joins[j] = v;
      sets.push([j, v]);
    },
    watch(event: string, ...args: any[]) {
      // CF.watch(FeedbackMatchedEvent, system, feedback, cb); else (joins?, cb, fireNow?)
      if (event === 'fb' && typeof args[0] === 'string' && typeof args[1] === 'string') {
        watchers.push({ event, system: args[0], feedback: args[1], cb: args[2] });
        return;
      }
      let i = 0;
      const js = typeof args[i] === 'string' || Array.isArray(args[i]) ? args[i++] : undefined;
      watchers.push({ event, joins: js, cb: args[i] });
    },
    setSystemProperties(name: string, changes: any) { props.push([name, changes]); },
    log() {},
  };
  const IvaMqtt = new Function('CF', 'setTimeout', 'setInterval', 'clearInterval', `${MQTT_RUNTIME}\nreturn IvaMqtt;`)(
    CF,
    (fn: () => void, ms = 0) => timers.push({ fn, ms, repeat: false }),
    (fn: () => void, ms = 0) => timers.push({ fn, ms, repeat: true }),
    (id: number) => { timers[id - 1] = null; });
  /** the system's connection came up, or went */
  const connection = (up: boolean, system = 'mqtt') => {
    for (const w of watchers) if (w.event === 'conn' && w.joins === system) w.cb(system, up, up ? '10.0.0.1:1883' : null);
  };
  /** bytes from the broker, as the feedback hands them over */
  const feed = (data: string, system = 'mqtt') => {
    for (const w of watchers) if (w.event === 'fb' && w.system === system && w.feedback === 'frame') w.cb('frame', data);
  };
  /** a join changed (the panel's event: the value as text) */
  const change = (j: string, v: any) => {
    for (const w of watchers) if (w.event === 'join' && (Array.isArray(w.joins) ? w.joins.includes(j) : w.joins === j)) w.cb(j, String(v));
  };
  /** what was sent, as packets; forgotten */
  const packets = (): any[] => {
    const r = IvaMqtt.parse(sent.join(''));
    assert.equal(r.rest, '', 'whole packets sent');
    sent.length = 0;
    return r.packets;
  };
  /** every timer due runs once (an interval stays) */
  const tick = () => {
    for (const t of [...timers]) {
      if (!t) continue;
      t.fn();
      if (!t.repeat) timers[timers.indexOf(t)] = null;
    }
  };
  return { CF, IvaMqtt, sent, joins, sets, props, watchers, timers, connection, feed, change, packets, tick };
}

test('the codec: every packet encodes and decodes back; CONNECT laid out as the spec has it', () => {
  const { IvaMqtt: M } = panel();
  const one = (s: string) => {
    const r = M.parse(s);
    assert.equal(r.packets.length, 1);
    assert.equal(r.rest, '');
    return r.packets[0];
  };
  const connect = M.encode.connect({ clientId: 'iva', user: 'me', password: 'pw', keepalive: 60, clean: true });
  // type 1, 23 bytes: "MQTT", level 4, flags user + password + clean session, keepalive 60, then the strings
  assert.deepEqual(codes(connect.slice(0, 12)), [0x10, 23, 0, 4, 77, 81, 84, 84, 4, 0xc2, 0, 60]);
  assert.deepEqual(one(connect), { type: 1, name: 'connect', protocol: 'MQTT', level: 4, clean: true, keepalive: 60, clientId: 'iva', user: 'me', password: 'pw' });
  assert.deepEqual(one(M.encode.connect({ clientId: 'x', clean: false })), { type: 1, name: 'connect', protocol: 'MQTT', level: 4, clean: false, keepalive: 0, clientId: 'x' });
  // a password alone goes with an empty user name (the spec wants the user flag with it)
  assert.deepEqual(one(M.encode.connect({ password: 'pw' })), { type: 1, name: 'connect', protocol: 'MQTT', level: 4, clean: true, keepalive: 0, clientId: '', user: '', password: 'pw' });
  assert.deepEqual(one(M.encode.connack(0)), { type: 2, name: 'connack', sessionPresent: false, code: 0 });
  assert.deepEqual(one(M.encode.connack(5, true)), { type: 2, name: 'connack', sessionPresent: true, code: 5 });
  assert.deepEqual(one(M.encode.publish('a/b', 'hi')), { type: 3, name: 'publish', dup: false, qos: 0, retain: false, topic: 'a/b', payload: 'hi' });
  assert.deepEqual(one(M.encode.publish('a/b', 'hi', { qos: 1, retain: true, dup: true, id: 1234 })),
    { type: 3, name: 'publish', dup: true, qos: 1, retain: true, topic: 'a/b', id: 1234, payload: 'hi' });
  assert.deepEqual(one(M.encode.puback(65535)), { type: 4, name: 'puback', id: 65535 });
  assert.deepEqual(one(M.encode.subscribe(7, [{ filter: 'a/#', qos: 1 }, { filter: 'b' }])), { type: 8, name: 'subscribe', id: 7, topics: [{ filter: 'a/#', qos: 1 }, { filter: 'b', qos: 0 }] });
  assert.equal(M.encode.subscribe(7, []).charCodeAt(0), 0x82); // the flags the spec fixes
  assert.deepEqual(one(M.encode.suback(7, [0, 1, 0x80])), { type: 9, name: 'suback', id: 7, codes: [0, 1, 128] });
  assert.deepEqual(one(M.encode.unsubscribe(8, ['a/#', 'b'])), { type: 10, name: 'unsubscribe', id: 8, filters: ['a/#', 'b'] });
  assert.equal(M.encode.unsubscribe(8, []).charCodeAt(0), 0xa2);
  assert.deepEqual(one(M.encode.unsuback(8)), { type: 11, name: 'unsuback', id: 8 });
  assert.equal(M.encode.pingreq(), b(0xc0, 0));
  assert.deepEqual(one(M.encode.pingreq()), { type: 12, name: 'pingreq' });
  assert.deepEqual(one(M.encode.pingresp()), { type: 13, name: 'pingresp' });
  assert.equal(M.encode.disconnect(), b(0xe0, 0));
  assert.deepEqual(one(M.encode.disconnect()), { type: 14, name: 'disconnect' });
  // strings go as UTF-8, their length in bytes
  const pk = M.encode.publish('π/temp', M.utf8('21°'));
  assert.deepEqual(codes(pk.slice(2, 4)), [0, 7]);
  assert.equal(one(pk).topic, 'π/temp');
  assert.equal(M.text(one(pk).payload), '21°');
});

test('the remaining length: 127 in one byte, 128 in two, 16383 in two, 16384 in three', () => {
  const { IvaMqtt: M } = panel();
  for (const [len, head] of [[127, [0x7f]], [128, [0x80, 0x01]], [16383, [0xff, 0x7f]], [16384, [0x80, 0x80, 0x01]]] as [number, number[]][]) {
    const pk = M.encode.publish('t', 'x'.repeat(len - 3)); // the body: the topic (3 bytes) and the payload
    assert.deepEqual(codes(pk.slice(1, 1 + head.length)), head, `${len}`);
    assert.equal(pk.length, 1 + head.length + len);
    const r = M.parse(pk);
    assert.equal(r.packets[0].payload.length, len - 3);
    assert.equal(r.rest, '');
  }
  assert.throws(() => M.parse(b(0x30, 0x80, 0x80, 0x80, 0x80, 0x01)), /bad remaining length/);
});

test('packets split or merged across TCP reads come out whole', () => {
  const { IvaMqtt: M } = panel();
  const first = M.encode.publish('t/1', 'one');
  const ack = M.encode.puback(300);
  const long = M.encode.publish('t/2', 'x'.repeat(200)); // a two-byte remaining length
  const all = first + ack + long;
  // one read
  let r = M.parse(all);
  assert.deepEqual(r.packets.map((p: any) => p.name), ['publish', 'puback', 'publish']);
  assert.equal(r.rest, '');
  // a byte a read
  let rest = '';
  const got: any[] = [];
  for (const ch of all) {
    r = M.parse(rest + ch);
    rest = r.rest;
    got.push(...r.packets);
  }
  assert.deepEqual(got.map((p) => p.name), ['publish', 'puback', 'publish']);
  assert.equal(got[2].payload.length, 200);
  assert.equal(rest, '');
  // cut inside the remaining length: nothing yet, all of it kept
  r = M.parse(long.slice(0, 2));
  assert.deepEqual(r.packets, []);
  assert.equal(r.rest, long.slice(0, 2));
  // the driver puts them together as the feedback hands them over
  const p = panel();
  p.IvaMqtt.add('mqtt', { subscribe: { 't/+': { join: 's1', type: 's' } } });
  p.connection(true);
  p.feed(p.IvaMqtt.encode.connack(0));
  p.feed(all.slice(0, 5));
  assert.equal(p.joins.s1, undefined);
  p.feed(all.slice(5, 10)); // the first packet is 10 bytes
  assert.equal(p.joins.s1, 'one');
  p.feed(all.slice(10, 13));
  assert.equal(p.joins.s1, 'one');
  p.feed(all.slice(13));
  assert.equal(p.joins.s1, 'x'.repeat(200));
});

test('UTF-8 both ways: text to bytes a char a byte and back; what isn\'t UTF-8 stays as it is', () => {
  const { IvaMqtt: M } = panel();
  for (const s of ['plain', 'héllo wörld', 'Привет', '€', '😀 emoji', '']) {
    const bytes = M.utf8(s);
    assert.equal(bytes, Buffer.from(s, 'utf8').toString('latin1'), s);
    assert.equal(M.text(bytes), s);
  }
  assert.equal(M.text(b(0xff, 0x41)), b(0xff, 0x41));
  assert.equal(M.text(b(0x41, 0xc3)), b(0x41, 0xc3)); // cut short
  assert.equal(M.text(b(0xc3, 0x41)), b(0xc3, 0x41)); // no continuation
});

test('topic filters: + a level, # the rest, neither a $SYS topic', () => {
  const { IvaMqtt: M } = panel();
  const yes = [['a/b', 'a/b'], ['a/+', 'a/b'], ['a/+', 'a/'], ['+/b', 'a/b'], ['a/#', 'a/b/c'], ['a/#', 'a'], ['#', 'a/b'], ['#', '/'], ['a/+/c', 'a/b/c'], ['+/+', 'a/b'],
    ['$SYS/#', '$SYS/broker/load'], ['a/+/#', 'a/b'], ['+/+/+', 'a//c']];
  const no = [['a/b', 'a/c'], ['a/+', 'a/b/c'], ['a/+', 'a'], ['a/#', 'b/a'], ['+', 'a/b'], ['#', '$SYS/x'], ['+/x', '$SYS/x'], ['a/b', 'A/b'], ['a/B', 'a/b/'], ['a/+/#', 'a']];
  for (const [f, t] of yes) assert.ok(M.matches(f, t), `${f} takes ${t}`);
  for (const [f, t] of no) assert.ok(!M.matches(f, t), `${f} doesn't take ${t}`);
});

test('payload to join and back: digital words, analog ranges, serial text, JSON paths, templates', () => {
  const { IvaMqtt: M } = panel();
  const d = { type: 'd' };
  const a = { type: 'a', range: [0, 100] };
  const s = { type: 's' };
  for (const on of ['1', 'true', 'ON', 'On', 'on', '2', ' TRUE ']) assert.equal(M.toJoin(d, on), 1, on);
  for (const off of ['0', 'false', 'OFF', 'off', '0.0']) assert.equal(M.toJoin(d, off), 0, off);
  assert.equal(M.toJoin(d, 'maybe'), undefined);
  assert.equal(M.toJoin(d, ''), undefined);
  assert.equal(M.toJoin(a, '50'), 32768);
  assert.equal(M.toJoin(a, '0'), 0);
  assert.equal(M.toJoin(a, '100'), 65535);
  assert.equal(M.toJoin(a, '150'), 65535);
  assert.equal(M.toJoin(a, '-5'), 0);
  assert.equal(M.toJoin({ type: 'a' }, '1000'), 1000);
  assert.equal(M.toJoin(a, '21.5 C'), Math.round(0.215 * 65535));
  assert.equal(M.toJoin(a, 'warm'), undefined);
  assert.equal(M.toJoin({ type: 'a', range: [-20, 40] }, '10'), 32768);
  assert.equal(M.toJoin(s, 'text'), 'text');
  // a field of a JSON payload
  assert.equal(M.toJoin({ type: 'a', range: [0, 50], path: 'value' }, '{"value": 25}'), 32768);
  assert.equal(M.toJoin({ type: 'd', path: 'state.on' }, '{"state": {"on": true}}'), 1);
  assert.equal(M.toJoin({ type: 'd', path: 'state.on' }, '{"state": {"on": false}}'), 0);
  assert.equal(M.toJoin({ type: 's', path: 'readings.1.name' }, '{"readings": [{"name": "a"}, {"name": "b"}]}'), 'b');
  assert.equal(M.toJoin({ type: 's', path: 'state' }, '{"state": {"on": true}}'), '{"on":true}');
  assert.equal(M.toJoin({ type: 'd', path: 'on' }, 'not json'), undefined);
  assert.equal(M.toJoin({ type: 'd', path: 'on' }, '{"off": 1}'), undefined);
  assert.equal(M.toJoin({ type: 'd', path: 'a.b' }, '{"a": 1}'), undefined);
  // back
  assert.equal(M.toPayload(d, '1'), '1');
  assert.equal(M.toPayload(d, '0'), '0');
  assert.equal(M.toPayload({ type: 'd', on: 'ON', off: 'OFF' }, 1), 'ON');
  assert.equal(M.toPayload({ type: 'd', on: 'ON', off: 'OFF' }, '0'), 'OFF');
  assert.equal(M.toPayload(a, 32768), '50');
  assert.equal(M.toPayload({ type: 'a', range: [0, 1], decimals: 2 }, 32768), '0.50');
  assert.equal(M.toPayload({ type: 'a' }, 1000), '1000');
  assert.equal(M.toPayload(s, 'hi'), 'hi');
  assert.equal(M.toPayload({ type: 'd', on: 'true', off: 'false', template: '{"state": {value}}' }, 1), '{"state": true}');
  assert.equal(M.toPayload({ type: 'a', range: [0, 100], template: '{value}%' }, 65535), '100%');
});

test('the driver on a panel: CONNECT when the system connects, SUBSCRIBE after CONNACK, joins from PUBLISH, PUBLISH on a join change, no echo, pings', () => {
  const p = panel();
  const { IvaMqtt: M, joins, change, feed, connection, packets } = p;
  M.add('mqtt', {
    clientId: 'panel', user: 'u', password: 'p', keepalive: 30, status: 's1', log: 's2', logLines: 2,
    subscribe: { 'home/lamp': { join: 'd1', type: 'd' }, 'home/temp': { join: 'a1', type: 'a', path: 'value', range: [0, 50] }, 'home/text': { join: 's3', type: 's' }, 'sensors/+/state': { join: 'd2', type: 'd', qos: 1 } },
    publish: { 'home/lamp/set': { join: 'd1', type: 'd', on: 'ON', off: 'OFF', retain: true, qos: 1 }, 'home/dim/set': { join: 'a2', type: 'a', range: [0, 100] }, 'home/say': { join: 's4', type: 's' } },
  });
  assert.equal(joins.s1, 'Connecting');
  assert.deepEqual(packets(), [], 'nothing before the system connects');
  connection(true);
  assert.equal(joins.s1, 'Connecting');
  assert.deepEqual(packets(), [{ type: 1, name: 'connect', protocol: 'MQTT', level: 4, clean: true, keepalive: 30, clientId: 'panel', user: 'u', password: 'p' }]);
  feed(M.encode.connack(0));
  assert.equal(joins.s1, 'Connected');
  const [sub] = packets();
  assert.equal(sub.name, 'subscribe');
  assert.deepEqual(sub.topics, [{ filter: 'home/lamp', qos: 0 }, { filter: 'home/temp', qos: 0 }, { filter: 'home/text', qos: 0 }, { filter: 'sensors/+/state', qos: 1 }]);
  feed(M.encode.suback(sub.id, [0, 0, 0, 1]));
  // in: the joins
  feed(M.encode.publish('home/lamp', 'ON'));
  assert.equal(joins.d1, 1);
  feed(M.encode.publish('home/temp', '{"value": 25}'));
  assert.equal(joins.a1, 32768);
  feed(M.encode.publish('home/text', M.utf8('héllo')));
  assert.equal(joins.s3, 'héllo');
  // a QoS 1 publish in: acknowledged
  feed(M.encode.publish('sensors/door/state', 'true', { qos: 1, id: 77 }));
  assert.equal(joins.d2, 1);
  assert.deepEqual(packets(), [{ type: 4, name: 'puback', id: 77 }]);
  // a payload the join can't take: left alone
  feed(M.encode.publish('home/lamp', 'maybe'));
  assert.equal(joins.d1, 1);
  feed(M.encode.publish('home/temp', '{"other": 1}'));
  assert.equal(joins.a1, 32768);
  // the echo of what the driver set: not published back
  change('d1', 1);
  assert.deepEqual(packets(), []);
  // the user's change: published, retained, QoS 1 with a packet id - then acknowledged
  change('d1', 0);
  let [pub] = packets();
  assert.equal(pub.name, 'publish');
  assert.equal(pub.topic, 'home/lamp/set');
  assert.equal(M.text(pub.payload), 'OFF');
  assert.deepEqual([pub.qos, pub.retain, pub.dup], [1, true, false]);
  assert.ok(pub.id > 0);
  assert.ok(M.broker('mqtt').pending[pub.id]);
  feed(M.encode.puback(pub.id));
  assert.deepEqual(M.broker('mqtt').pending, {});
  change('a2', 32768);
  [pub] = packets();
  assert.deepEqual([pub.topic, pub.payload, pub.qos, pub.retain], ['home/dim/set', '50', 0, false]);
  change('s4', 'hi there');
  [pub] = packets();
  assert.deepEqual([pub.topic, pub.payload], ['home/say', 'hi there']);
  // the log: the last two lines
  assert.equal(joins.s2, '> home/dim/set: 50\n> home/say: hi there');
  // the pings: PINGREQ every keepalive, answered
  p.tick();
  assert.deepEqual(packets(), [{ type: 12, name: 'pingreq' }]);
  feed(M.encode.pingresp());
  // the connection gone: Disconnected; a QoS 1 publish meanwhile waits; the next connect does it all again, the publish as a duplicate
  connection(false);
  assert.equal(joins.s1, 'Disconnected');
  change('d1', 1);
  change('a2', 0);
  assert.deepEqual(packets(), []);
  connection(true);
  feed(M.encode.connack(0));
  const again = packets();
  assert.deepEqual(again.map((x: any) => x.name), ['connect', 'subscribe', 'publish']);
  assert.equal(again[2].dup, true);
  assert.equal(M.text(again[2].payload), 'ON');
  assert.equal(joins.s2, '> home/dim/set: 0 (not connected: dropped)\n> home/lamp/set: ON (again)');
});

test('two <Mqtt> on one system add up; a script subscribes with a handler and publishes; reconnect points the system elsewhere', () => {
  const p = panel();
  const { IvaMqtt: M, change, feed, connection, packets } = p;
  M.add('mqtt', { clientId: 'one', subscribe: { 'a': { join: 'd1', type: 'd' } } });
  M.add('mqtt', { subscribe: { 'b': { join: 'd2', type: 'd' } }, publish: { 'b/set': { join: 'd2', type: 'd' } } });
  const got: [string, string][] = [];
  M.subscribe('mqtt', 'c/#', (topic: string, payload: string) => got.push([topic, payload]), 1);
  assert.equal(p.watchers.filter((w) => w.event === 'conn').length, 1, 'one connection watch for the system');
  connection(true);
  assert.equal(packets()[0].clientId, 'one');
  feed(M.encode.connack(0));
  const [sub] = packets();
  assert.deepEqual(sub.topics, [{ filter: 'a', qos: 0 }, { filter: 'b', qos: 0 }, { filter: 'c/#', qos: 1 }]);
  feed(M.encode.publish('c/d', 'payload'));
  assert.deepEqual(got, [['c/d', 'payload']]);
  change('d2', 1);
  assert.deepEqual(packets().map((x: any) => [x.topic, x.payload]), [['b/set', '1']]);
  M.publish('mqtt', 'say', 'hello', { retain: true });
  assert.deepEqual(packets().map((x: any) => [x.topic, x.payload, x.retain]), [['say', 'hello', true]]);
  // a subscription added while connected goes out at once
  M.subscribe('mqtt', 'e', () => {});
  assert.deepEqual(packets()[0].topics, [{ filter: 'e', qos: 0 }]);
  // off, the address, on: each its own call (iViewer keeps the old address when it comes with enabled: false)
  M.reconnect('mqtt', '10.0.0.2', 1884);
  assert.deepEqual(p.props, [['mqtt', { enabled: false }], ['mqtt', { address: '10.0.0.2', port: 1884 }]]);
  p.tick();
  assert.deepEqual(p.props[2], ['mqtt', { enabled: true }]);
});

test('a refused CONNACK: the status says the code, nothing is subscribed; the next connect tries again', () => {
  const p = panel();
  p.IvaMqtt.add('mqtt', { status: 's1', subscribe: { a: { join: 'd1', type: 'd' } } });
  p.connection(true);
  p.feed(p.IvaMqtt.encode.connack(5));
  assert.equal(p.joins.s1, 'Refused (code 5)');
  assert.deepEqual(p.packets().map((x: any) => x.name), ['connect']);
  p.connection(false);
  assert.equal(p.joins.s1, 'Refused (code 5)');
  p.connection(true);
  assert.equal(p.joins.s1, 'Connecting');
  p.feed(p.IvaMqtt.encode.connack(0));
  assert.equal(p.joins.s1, 'Connected');
  assert.deepEqual(p.packets().map((x: any) => x.name), ['connect', 'subscribe']);
});

test('a ping unanswered by the next one: the system is started over (enabled off, then on); keepalive 0: no pings', () => {
  const p = panel();
  p.IvaMqtt.add('mqtt', { keepalive: 10, status: 's1' });
  p.connection(true);
  p.feed(p.IvaMqtt.encode.connack(0));
  p.packets();
  p.tick();
  assert.deepEqual(p.packets().map((x: any) => x.name), ['pingreq']);
  p.tick();
  assert.equal(p.joins.s1, 'Disconnected');
  assert.deepEqual(p.props, [['mqtt', { enabled: false }]]);
  p.tick();
  assert.deepEqual(p.props[1], ['mqtt', { enabled: true }]);
  assert.deepEqual(p.packets(), []);
  const q = panel();
  q.IvaMqtt.add('mqtt', { keepalive: 0 });
  q.connection(true);
  q.feed(q.IvaMqtt.encode.connack(0));
  assert.equal(q.timers.filter((t) => t).length, 0);
});

const project = (body: string) => {
  const dir = tmpDir('iva-mqtt-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { Mqtt } from 'iva/drivers/mqtt';
export default (
  <Project name="T" width={1024} height={768}>
    <Page name="Main">${body}</Page>
  </Project>
);
`);
  return path.join(dir, 'app.jsx');
};

test('<Mqtt> compiles to one system with the catch-all feedback, its script once, and the OnStart line with the joins', async () => {
  const r = await compile(project(`
      <Button x={0} y={0} w={100} h={50} join={d('lamp')} feedback="toggle" text="Lamp" />
      <Mqtt name="mqtt" host="192.168.1.10" port={1883} clientId="panel" user="u" password="p" keepalive={30} ssl status={s('mqttStatus')} log="s:mqttLog"
            subscribe={{ 'home/lamp': d('lamp'), 'home/temp': { join: a('temp'), path: 'value', range: [0, 50], qos: 1 }, 'home/text': s('text') }}
            publish={{ 'home/lamp/set': { join: d('lamp'), on: 'ON', off: 'OFF', retain: true, qos: 1 }, 'home/dim/set': { join: a('dim'), range: [0, 100], decimals: 1 }, 'home/say': { join: s('say'), template: '{"text": "{value}"}' } }} />
      <Mqtt system="mqtt" subscribe={{ 'home/other': 'd5' }} />`));
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.scripts.map((x) => x.name), ['iva-joins.js', 'iva-mqtt.js', 'iva-start.js']);
  for (const sc of r.scripts) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  assert.equal((r.xml.match(/<system /g) ?? []).length, 1);
  assert.match(r.xml, /<system name="mqtt" ip="192\.168\.1\.10" port="1883" origin="0" protocol="tcp" alwayson="1" [^>]*ssl="1" [^>]*eom="" [^>]*textEncoding="ISO-8859-1" js="">\s*<fb name="frame" regex="\(\?s\)\(\.\*\)" \/>\s*<\/system>/);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.ok(start.includes('IvaMqtt.add("mqtt", { clientId: "panel", user: "u", password: "p", keepalive: 30, status: Joins.s["mqttStatus"], log: Joins.s["mqttLog"], ' +
    'subscribe: { "home/lamp": { join: Joins.d["lamp"], type: "d" }, "home/temp": { join: Joins.a["temp"], type: "a", path: "value", range: [0,50], qos: 1 }, "home/text": { join: Joins.s["text"], type: "s" } }, ' +
    'publish: { "home/lamp/set": { join: Joins.d["lamp"], type: "d", on: "ON", off: "OFF", qos: 1, retain: true }, "home/dim/set": { join: Joins.a["dim"], type: "a", range: [0,100], decimals: 1 }, ' +
    `"home/say": { join: Joins.s["say"], type: "s", template: ${JSON.stringify('{"text": "{value}"}')} } } });`), start);
  assert.ok(start.includes('IvaMqtt.add("mqtt", { subscribe: { "home/other": { join: "d5", type: "d" } } });'), start);
  // joins no element has get numbers too: the script reads them by name
  for (const [t, name] of [['serial', 'mqttStatus'], ['serial', 'mqttLog'], ['analog', 'temp'], ['serial', 'text'], ['analog', 'dim'], ['serial', 'say']]) assert.ok(r.joins[t][name], `${t} ${name}`);
  // the defaults: port 1883, 8883 with ssl, client id iva, keepalive 60
  const plain = await compile(project(`<Mqtt name="m" host="h" />`));
  assert.match(plain.xml, /<system name="m" ip="h" port="1883" /);
  assert.ok(plain.scripts.find((x) => x.name === 'iva-start.js')!.code!.includes('IvaMqtt.add("m", { clientId: "iva", keepalive: 60 });'));
  const tls = await compile(project(`<Mqtt name="m" host="h" ssl />`));
  assert.match(tls.xml, /<system name="m" ip="h" port="8883" [^>]*ssl="1"/);
});

test('<Mqtt> checks what it is given', async () => {
  const bad = (body: string, re: RegExp) => assert.rejects(compile(project(body)), re);
  await bad(`<Mqtt host="h" />`, /give name="mqtt"/);
  await bad(`<Mqtt name="m" system="m" host="h" />`, /name or system, one of them/);
  await bad(`<Mqtt name="m" />`, /"m": a host/);
  await bad(`<Mqtt name="m" host="h" subscribe={{ a: l('x') }} />`, /subscribe "a": a d\('name'\) \/ a\('name'\) \/ s\('name'\) join, got/);
  await bad(`<Mqtt name="m" host="h" publish={{ a: 'lamp' }} />`, /publish "a": a d\('name'\) \/ a\('name'\) \/ s\('name'\) join, got "lamp"/);
  await bad(`<Mqtt name="m" host="h" status={d('x')} />`, /status: a s\('name'\) join/);
  await bad(`<Mqtt system="m" host="h" />`, /belong to the <Mqtt name="m">/);
  await bad(`<Mqtt name="m" host="h" publish={{ 'a/+': d('x') }} />`, /a topic, not a filter/);
  await bad(`<Mqtt name="m" host="h" port={70000} />`, /port: a number 1-65535/);
  await bad(`<Mqtt name="m" host="h" subscribe={{ a: { join: a('x'), range: [1] } }} />`, /range: \[min, max\]/);
  await bad(`<Mqtt name="m" host="h" subscribe={{ a: { join: a('x'), qos: 2 } }} />`, /qos 0 or 1/);
  await bad(`<Mqtt name="m" host="h" keepalive={-1} />`, /keepalive: seconds/);
});

test("a driver iva doesn't have: the error lists the ones it has", async () => {
  const dir = tmpDir('iva-mqtt-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), `import { X } from 'iva/drivers/nope';\nexport default (<Project name="T" width={1024} height={768}><Page name="Main" /></Project>);\n`);
  await assert.rejects(compile(path.join(dir, 'app.jsx')), /no module "iva\/drivers\/nope" \(iva has: iva, iva\/ui, (iva\/drivers\/[\w-]+, )*iva\/drivers\/mqtt(, iva\/drivers\/[\w-]+)*, iva\/jsx-runtime\)/);
});

test('the example builds, for the phone too: the broker once, its script once, the page from the size', async () => {
  const r = await compile(EXAMPLE);
  assert.deepEqual(r.warnings, []);
  const names = r.scripts.map((x) => x.name);
  assert.deepEqual([...names].sort(), ['example.js', 'iva-joins.js', 'iva-mqtt.js', 'iva-start.js', 'iva-ui.js']);
  assert.deepEqual([names[0], names[4]], ['iva-joins.js', 'iva-start.js']);
  for (const sc of r.scripts) if (sc.code) assert.doesNotThrow(() => new Function(sc.code!), sc.name);
  assert.equal((r.xml.match(/<system /g) ?? []).length, 1);
  assert.match(r.xml, /<system name="mqtt" ip="::1" port="1883" /);
  const start = r.scripts.find((x) => x.name === 'iva-start.js')!.code!;
  assert.equal(start.match(/IvaMqtt\.add\(/g)!.length, 1);
  assert.match(start, /status: Joins\.s\["mqttStatus"\], log: Joins\.s\["mqttLog"\], logLines: 10/);
  const phone = await compile(EXAMPLE, { size: '1400x1400@3x' });
  assert.deepEqual(phone.warnings, []);
  assert.equal((phone.xml.match(/<system /g) ?? []).length, 1);
});

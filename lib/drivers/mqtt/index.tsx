/**
 * iva/drivers/mqtt - an MQTT broker on the panel: topics in and out of joins.
 *
 *   import { Mqtt } from 'iva/drivers/mqtt';
 *   <Mqtt name="mqtt" host="192.168.1.10" port={1883} status={s('mqttStatus')}
 *         subscribe={{ 'home/lamp': d('lamp'), 'home/temp': { join: a('temp'), path: 'value', range: [0, 50] } }}
 *         publish={{ 'home/lamp/set': { join: d('lamp'), on: 'ON', off: 'OFF', retain: true } }} />
 *
 * The component brings its own <System> (TCP, no EOM: the bytes as they
 * come, a char a byte) with a catch-all <Feedback>, and the client itself -
 * CONNECT, SUBSCRIBE, PUBLISH (QoS 0 and 1), PINGREQ on the keepalive - is
 * one script, iva-mqtt.js (runtime.ts), wired up with <OnStart>. Works on
 * CommandFusion iViewer and on iva's own runtime.
 */

import { Feedback, OnStart, Script, System, type JoinRef, type VNode } from 'iva';
import { MQTT_RUNTIME } from './runtime.js';

/** a join with its type: d('lamp'), a(12), s('text'), or 'd:lamp', 'a12' */
export type MqttJoin = JoinRef | string;

/** A topic (a filter: + a level, # the rest) into a join. */
export interface MqttSubscription {
  /** digital from 1/0, true/false, on/off; analog a number mapped from `range` onto 0..65535; serial the text */
  join: MqttJoin;
  /** a field of a JSON payload, dotted: 'value', 'state.on' */
  path?: string;
  /** what 0..65535 stands for (analog; default 0..65535) */
  range?: [number, number];
  /** the QoS asked of the broker (default 0) */
  qos?: 0 | 1;
}
/** A join's changes published to a topic. */
export interface MqttPublication {
  join: MqttJoin;
  /** digital: the payloads (default '1' / '0') */
  on?: string;
  off?: string;
  /** analog: the join's 0..65535 mapped back to this (default 0..65535), a whole number unless `decimals` */
  range?: [number, number];
  decimals?: number;
  /** the payload with {value} in it: '{"state": {value}}' */
  template?: string;
  /** 1: delivered at least once (a PUBACK awaited; sent again on the next connect if none came) */
  qos?: 0 | 1;
  retain?: boolean;
}
export interface MqttProps {
  /** the system's name: this <Mqtt> brings the <System> (host, port, ... here) */
  name?: string;
  /** another <Mqtt>'s system: these topics on its broker (no host or port here) */
  system?: string;
  host?: string;
  /** default 1883 (8883 with ssl) */
  port?: number;
  /** MQTT over TLS (where the runtime has it: iva's does, with any certificate) */
  ssl?: boolean;
  /** default 'iva' and this device's id, each panel its own (one given here is the same on every panel the GUI runs on: a broker drops a client when another connects with its id) */
  clientId?: string;
  user?: string;
  password?: string;
  /** seconds between pings (default 60; 0: none) */
  keepalive?: number;
  /** default true (false: the broker keeps the session's subscriptions) */
  cleanSession?: boolean;
  /** serial join: Connecting / Connected / Disconnected / Refused (code N) */
  status?: MqttJoin;
  /** serial join: the last messages in and out, a line each */
  log?: MqttJoin;
  /** how many (default 8) */
  logLines?: number;
  /** topic filter -> join (or { join, path, range, qos }) */
  subscribe?: Record<string, MqttJoin | MqttSubscription>;
  /** topic -> join (or { join, on, off, range, decimals, template, qos, retain }) */
  publish?: Record<string, MqttJoin | MqttPublication>;
}

type Typed = { type: 'd' | 'a' | 's'; code: string; ref: MqttJoin };

/** a join's type and its JavaScript ("d12", or Joins.d["name"] for a named one, as lib/ui's jsJoin) */
function joinOf(what: string, j: unknown, types: string): Typed {
  const bad = () => new Error(`Mqtt ${what}: a ${types.split('').map((t) => `${t}('name')`).join(' / ')} join, got ${JSON.stringify(j)}`);
  let type: string;
  let id: number | string;
  if (j && typeof j === 'object' && (j as JoinRef).$$join === 1) ({ type, id } = j as JoinRef);
  else if (typeof j === 'string') {
    const m = /^([das])(?::(.+)|(\d+))$/.exec(j);
    if (!m) throw bad();
    type = m[1];
    id = m[3] !== undefined ? Number(m[3]) : m[2];
  } else throw bad();
  if (!types.includes(type)) throw bad();
  const code = typeof id === 'number' ? JSON.stringify(`${type}${id}`) : `Joins.${type}[${JSON.stringify(id)}]`;
  return { type: type as Typed['type'], code, ref: j as MqttJoin };
}

const isRange = (r: unknown): r is [number, number] => Array.isArray(r) && r.length === 2 && r.every((n) => typeof n === 'number' && isFinite(n));

/** an object literal for the script: the join as code, the rest as JSON */
function literal(fields: [string, string | undefined][]): string {
  return `{ ${fields.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join(', ')} }`;
}

export function Mqtt(props: MqttProps): VNode {
  const { name, system, host, ssl, clientId, user, password, keepalive = 60, cleanSession, status, log, logLines, subscribe = {}, publish = {} } = props;
  if (!name && !system) throw new Error('Mqtt: give name="mqtt" (the broker, with host and port) or system="mqtt" (topics on a broker another <Mqtt> brings)');
  if (name && system) throw new Error('Mqtt: name or system, one of them');
  const sys = String(name ?? system);
  const own = !!name;
  if (own && !host) throw new Error(`Mqtt "${sys}": a host (the broker's address)`);
  if (!own && (host !== undefined || props.port !== undefined || ssl !== undefined || clientId !== undefined || user !== undefined || password !== undefined)) {
    throw new Error(`Mqtt system="${sys}": host, port, ssl and the credentials belong to the <Mqtt name="${sys}"> that brings the broker`);
  }
  const port = props.port ?? (ssl ? 8883 : 1883);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Mqtt "${sys}": port: a number 1-65535`);
  if (keepalive !== undefined && (!Number.isInteger(keepalive) || keepalive < 0)) throw new Error(`Mqtt "${sys}": keepalive: seconds (0: no pings)`);

  const joins: MqttJoin[] = [];
  const statusJoin = status === undefined ? undefined : joinOf('status', status, 's');
  const logJoin = log === undefined ? undefined : joinOf('log', log, 's');
  for (const j of [statusJoin, logJoin]) if (j) joins.push(j.ref);

  const subs: string[] = [];
  for (const [filter, v] of Object.entries(subscribe)) {
    if (!filter) throw new Error(`Mqtt "${sys}": an empty topic filter`);
    const o: MqttSubscription = v && typeof v === 'object' && !('$$join' in v) ? (v as MqttSubscription) : { join: v as MqttJoin };
    const j = joinOf(`subscribe "${filter}"`, o.join, 'das');
    if (o.range !== undefined && !isRange(o.range)) throw new Error(`Mqtt "${sys}": subscribe "${filter}": range: [min, max]`);
    if (o.qos !== undefined && o.qos !== 0 && o.qos !== 1) throw new Error(`Mqtt "${sys}": subscribe "${filter}": qos 0 or 1`);
    joins.push(j.ref);
    subs.push(`${JSON.stringify(filter)}: ${literal([
      ['join', j.code], ['type', JSON.stringify(j.type)], ['path', o.path === undefined ? undefined : JSON.stringify(o.path)],
      ['range', o.range === undefined ? undefined : JSON.stringify(o.range)], ['qos', o.qos ? '1' : undefined],
    ])}`);
  }
  const pubs: string[] = [];
  for (const [topic, v] of Object.entries(publish)) {
    if (!topic || /[+#]/.test(topic)) throw new Error(`Mqtt "${sys}": publish "${topic}": a topic, not a filter (no + or #)`);
    const o: MqttPublication = v && typeof v === 'object' && !('$$join' in v) ? (v as MqttPublication) : { join: v as MqttJoin };
    const j = joinOf(`publish "${topic}"`, o.join, 'das');
    if (o.range !== undefined && !isRange(o.range)) throw new Error(`Mqtt "${sys}": publish "${topic}": range: [min, max]`);
    if (o.qos !== undefined && o.qos !== 0 && o.qos !== 1) throw new Error(`Mqtt "${sys}": publish "${topic}": qos 0 or 1`);
    joins.push(j.ref);
    pubs.push(`${JSON.stringify(topic)}: ${literal([
      ['join', j.code], ['type', JSON.stringify(j.type)], ['on', o.on === undefined ? undefined : JSON.stringify(o.on)], ['off', o.off === undefined ? undefined : JSON.stringify(o.off)],
      ['range', o.range === undefined ? undefined : JSON.stringify(o.range)], ['decimals', o.decimals === undefined ? undefined : String(o.decimals)],
      ['template', o.template === undefined ? undefined : JSON.stringify(o.template)], ['qos', o.qos ? '1' : undefined], ['retain', o.retain ? 'true' : undefined],
    ])}`);
  }
  const options = literal([
    ['clientId', clientId === undefined ? undefined : JSON.stringify(clientId)], ['user', user === undefined ? undefined : JSON.stringify(user)],
    ['password', password === undefined ? undefined : JSON.stringify(password)], ['keepalive', own ? String(keepalive) : undefined],
    ['clean', cleanSession === false ? 'false' : undefined], ['status', statusJoin?.code], ['log', logJoin?.code],
    ['logLines', logLines === undefined ? undefined : String(logLines)],
    ['subscribe', subs.length ? `{ ${subs.join(', ')} }` : undefined], ['publish', pubs.length ? `{ ${pubs.join(', ')} }` : undefined],
  ]);
  return (
    <>
      {own && (
        // ISO-8859-1: a byte a char, in and out - what MQTT's bytes need (no encoding would do on iViewer, but iva's runtime reads UTF-8 where it sees it)
        <System name={sys} host={host!} port={port} protocol="tcp" ssl={ssl} textEncoding="ISO-8859-1">
          <Feedback name="frame" regex="(?s)(.*)" />
        </System>
      )}
      <Script name="iva-mqtt.js" code={MQTT_RUNTIME} />
      <OnStart js={`IvaMqtt.add(${JSON.stringify(sys)}, ${options});`} joins={joins} />
    </>
  );
}

export default Mqtt;

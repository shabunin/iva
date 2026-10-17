/**
 * The MQTT driver against a real broker: mosquitto on a port of its own,
 * the driver's script on iva's own runtime - a TCP <System> with the
 * catch-all feedback as <Mqtt> compiles it, over Node's sockets - and
 * mosquitto_pub / mosquitto_sub on the other side. Skipped where mosquitto
 * isn't installed.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import net from 'node:net';
import dgram from 'node:dgram';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { ControlSystem } from '../src/runtime/cf/systemManager.ts';
import { net as stdnet } from '../src/runtime/stdlib/net/index.ts';
import { joinStore, normalizeJoinString } from '../src/runtime/cf/joinStore.ts';
import { MQTT_RUNTIME } from '../lib/drivers/mqtt/runtime.ts';

(globalThis as any).window ??= { devicePixelRatio: 1 };

const found = (name: string) => ['/usr/sbin', '/usr/bin', '/usr/local/sbin', '/usr/local/bin', '/opt/homebrew/sbin', '/opt/homebrew/bin'].map((d) => `${d}/${name}`).find((f) => fs.existsSync(f));
const MOSQUITTO = found('mosquitto');
const PUB = found('mosquitto_pub');
const SUB = found('mosquitto_sub');
const skip = !MOSQUITTO ? 'mosquitto is not installed (apt install mosquitto mosquitto-clients)'
  : !PUB || !SUB ? 'mosquitto_pub / mosquitto_sub are not installed (apt install mosquitto-clients)' : false;
const run = promisify(execFile);

const freePort = () => new Promise<number>((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => {
    const port = (s.address() as net.AddressInfo).port;
    s.close(() => resolve(port));
  });
});
/** till a connection there is taken (5 s at most) */
async function listening(host: string, port: number, why: () => string) {
  for (let i = 0; i < 100; i++) {
    const ok = await new Promise<boolean>((resolve) => {
      const c = net.connect(port, host);
      c.on('connect', () => { c.destroy(); resolve(true); });
      c.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`nothing listens on ${host}:${port}: ${why()}`);
}
/** till it holds (5 s at most) */
async function until(what: string, cond: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`waited 5 s for ${what}`);
}

test("the driver on iva's runtime against mosquitto: CONNECT, SUBSCRIBE, joins from mosquitto_pub (UTF-8 text too), a retained publish mosquitto_sub reads, no echo", { skip }, async () => {
  const port = await freePort();
  // no config (Ubuntu's AppArmor lets mosquitto read one under /etc/mosquitto only): local only, 127.0.0.1 and ::1, anyone
  const broker = spawn(MOSQUITTO!, ['-p', String(port), '-v'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let brokerLog = '';
  broker.stdout!.on('data', (d) => (brokerLog += d));
  broker.stderr!.on('data', (d) => (brokerLog += d));
  broker.on('error', (e) => (brokerLog += `\n[broker] ${e.message}`));
  // the runtime's sockets: Node's
  stdnet.setProvider({
    name: 'node', Socket: net.Socket, Server: net.Server,
    createTcpSocket: () => new net.Socket() as any,
    createUdpSocket: (type?: any) => dgram.createSocket(type ?? 'udp4') as any,
    createTcpServer: (o?: any, l?: any) => net.createServer(o, l) as any,
  });
  joinStore.clear();
  const cf = new CFAPI();
  (cf as any).renderer = { project: { commands: {}, systems: [], macros: [] } };
  // joins' changes reach the script as iViewer gives them (what CF.init's bridge does)
  const bridge = (id: string, type: string, val: any) => cf.dispatchEvent(cf.JoinChangeEvent, normalizeJoinString(type, id), type === 'd' ? (val ? '1' : '0') : String(val), {}, []);
  joinStore.onAny(bridge as any);
  // the system as <Mqtt> compiles it (::1: the broker here, by a real connection - 127.0.0.1 would be a loopback system, inside the runtime)
  const sys = new ControlSystem(cf, {
    type: 'system', attributes: { name: 'mqtt', ip: '::1', port: String(port), protocol: 'tcp', alwayson: '1', offlinequeue: '1', eom: '', textEncoding: 'ISO-8859-1' },
    children: [{ type: 'fb', attributes: { name: 'frame', regex: '(?s)(.*)' }, children: [] }],
  } as any);
  cf.controlSystems = { mqtt: sys };
  const IvaMqtt = new Function('CF', `${MQTT_RUNTIME}\nreturn IvaMqtt;`)(cf);
  const s = (j: string) => joinStore.get(j, 's');
  const text = 'héllo wörld – ✓';
  try {
    await listening('::1', port, () => brokerLog);
    IvaMqtt.add('mqtt', {
      clientId: 'iva-test', keepalive: 5, status: 's1', log: 's2',
      subscribe: { 'home/lamp': { join: 'd1', type: 'd' }, 'home/temp': { join: 'a1', type: 'a', path: 'value', range: [0, 50] }, 'home/text': { join: 's3', type: 's' } },
      publish: { 'home/lamp/set': { join: 'd1', type: 'd', on: 'ON', off: 'OFF', retain: true, qos: 1 } },
    });
    assert.equal(s('1'), 'Connecting');
    sys.start();
    await until('the status Connected', () => s('1') === 'Connected');
    assert.match(brokerLog, /New client connected from [\da-f.:]+ as iva-test \(p2, c1, k5\)/);
    await until('the subscriptions', () => /home\/text \(QoS 0\)/.test(brokerLog));
    assert.match(brokerLog, /home\/lamp \(QoS 0\)/);
    assert.match(brokerLog, /home\/temp \(QoS 0\)/);
    // from the other side: the joins
    await run(PUB!, ['-p', String(port), '-t', 'home/lamp', '-m', 'ON']);
    await until('the lamp on', () => joinStore.get('1', 'd') === true);
    await run(PUB!, ['-p', String(port), '-t', 'home/temp', '-m', '{"value": 25}']);
    await until('the temperature', () => joinStore.get('1', 'a') === 32768);
    await run(PUB!, ['-p', String(port), '-t', 'home/text', '-m', text]);
    await until('the text', () => s('3') === text);
    // what the subscription set isn't published back; the panel's own change is - retained, so mosquitto_sub reads it afterwards
    assert.doesNotMatch(brokerLog, /Received PUBLISH from iva-test/);
    cf.setJoin('d1', 0);
    await until('the PUBLISH', () => /Received PUBLISH from iva-test \(d0, q1, r1, m\d+, 'home\/lamp\/set', \.\.\. \(3 bytes\)\)/.test(brokerLog));
    await until('its PUBACK', () => Object.keys(IvaMqtt.broker('mqtt').pending).length === 0);
    const { stdout } = await run(SUB!, ['-p', String(port), '-t', 'home/lamp/set', '-C', '1', '-W', '5']);
    assert.equal(stdout.trim(), 'OFF');
    assert.equal(s('2'), `< home/lamp: ON\n< home/temp: {"value": 25}\n< home/text: ${text}\n> home/lamp/set: OFF`);
  } finally {
    sys.stop();
    joinStore.offAny(bridge as any);
    // the broker stopped: SIGTERM, then SIGKILL if it lingers; one that refuses signals (mosquitto under
    // AppArmor, from a confined shell) is left running rather than holding the test up
    const exit = (ms: number) => Promise.race([new Promise<void>((r) => broker.once('exit', () => r())), new Promise<void>((r) => setTimeout(r, ms).unref())]);
    if (broker.exitCode === null) {
      broker.kill();
      await exit(3000);
    }
    if (broker.exitCode === null) {
      broker.kill('SIGKILL');
      await exit(1000);
    }
    broker.stdout!.destroy();
    broker.stderr!.destroy();
    broker.unref();
  }
});

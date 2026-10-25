/**
 * iva/drivers/matter: a join's changes as the device's commands - one at a
 * time, the latest value sent once the one out is answered (a slider
 * dragged changes its join dozens of times a second), a pick's hue and
 * saturation as one, a failed command not holding up the next.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Environment } from '@matter/general';
import type { CF } from '../lib/drivers/matter/runtime/cf.ts';
import { MatterDriver, type DeviceSpec } from '../lib/drivers/matter/runtime/controller.ts';

/** the driver on a stand-in panel, one device bound to a stand-in node whose commands the test answers */
function bound(spec: DeviceSpec) {
  const joins: Record<string, string> = {};
  const log: string[] = [];
  const watchers: { event: string; args: unknown[]; cb: (...a: any[]) => void }[] = [];
  const cf: CF = {
    FeedbackMatchedEvent: 'fb', JoinChangeEvent: 'join', ConnectionStatusChangeEvent: 'conn', GlobalTokensJoin: 'e0',
    ipv4address: '192.168.2.20', MACaddress: '', runtime: 'iva', systems: { matter0: { address: '0.0.0.0', port: 5540, enabled: true } },
    send() {},
    watch(event, ...args) { watchers.push({ event, args, cb: args.pop() as (...a: any[]) => void }); },
    setSystemProperties() {},
    startLookup() {},
    stopLookup() {},
    setToken() {},
    getJoin(join, cb) { cb(join, joins[join] ?? '', {}); },
    setJoin(join, value) { joins[join] = String(value); },
    log(m) { log.push(m); },
  };
  /** the commands sent, each answered (or failed) by the test */
  const sent: { command: string; args: any; answer: (ok?: boolean) => void }[] = [];
  const command = (name: string) => (args?: unknown) => new Promise<void>((resolve, reject) => {
    sent.push({ command: name, args, answer: (ok = true) => (ok ? resolve() : reject(new Error('timed out'))) });
  });
  /** what the device reports (its attributes' listeners) */
  const report: Record<string, (v: number | boolean) => void> = {};
  const client = {
    addOnOffAttributeListener: (f: any) => (report.onOff = f), getOnOffAttribute: async () => false, on: command('on'), off: command('off'),
    addCurrentLevelAttributeListener: (f: any) => (report.level = f), getCurrentLevelAttribute: async () => 0, moveToLevelWithOnOff: command('level'),
    addCurrentHueAttributeListener: (f: any) => (report.hue = f), addCurrentSaturationAttributeListener: (f: any) => (report.saturation = f),
    moveToHueAndSaturation: command('color'),
  };
  const node = { getDeviceById: () => ({ getClusterClient: () => client }) };
  const driver = new MatterDriver(cf, { slots: 1 }, new Environment(`matter-commands-${spec.cluster}`));
  (driver as unknown as { bindCluster(name: string, spec: DeviceSpec, node: unknown): void }).bindCluster('it', spec, node);
  /** a join changed on the panel: its JoinChangeEvent */
  const change = (join: string, value: number) => {
    joins[join] = String(value);
    for (const w of watchers) if (w.event === 'join' && w.args[0] === join) w.cb(join, String(value));
  };
  return { sent, report, change, joins, log };
}

/** the timers and answers due run */
const turn = () => new Promise((r) => setTimeout(r, 5));
const toLevel = (v: number) => Math.round((v / 65535) * 254);

test('LevelControl: a slider dragged - one command out at a time, the latest value next, nothing more once it\'s sent', async () => {
  const { sent, change } = bound({ node: 1, cluster: 'LevelControl', join: 'a1' });
  await turn();
  change('a1', 1000);
  await turn();
  assert.deepEqual(sent.map((s) => s.args.level), [toLevel(1000)]);
  // 60 more while it's out: none sent yet
  for (let v = 2000; v <= 61000; v += 1000) change('a1', v);
  await turn();
  assert.equal(sent.length, 1);
  // answered: the latest, once
  sent[0].answer();
  await turn();
  assert.deepEqual(sent.map((s) => s.args.level), [toLevel(1000), toLevel(61000)]);
  sent[1].answer();
  await turn();
  assert.equal(sent.length, 2);
  // changes in one turn: one command, with the last
  change('a1', 10000);
  change('a1', 20000);
  await turn();
  assert.deepEqual(sent.slice(2).map((s) => s.args.level), [toLevel(20000)]);
});

test('a failed command is said, and the next change is still sent', async () => {
  const { sent, change, log } = bound({ node: 1, cluster: 'LevelControl', join: 'a1' });
  await turn();
  change('a1', 30000);
  await turn();
  change('a1', 40000);
  sent[0].answer(false);
  await turn();
  assert.ok(log.some((l) => /it: command failed: timed out/.test(l)), log.join('\n'));
  assert.deepEqual(sent.map((s) => s.args.level), [toLevel(30000), toLevel(40000)]);
  sent[1].answer();
  await turn();
  change('a1', 50000);
  await turn();
  assert.deepEqual(sent.map((s) => s.args.level), [toLevel(30000), toLevel(40000), toLevel(50000)]);
});

test('ColorControl: hue and saturation picked together, one command; dragged while one is out, the latest of both next, the light\'s report meanwhile not undoing them', async () => {
  const { sent, change, report } = bound({ node: 1, cluster: 'ColorControl', hue: 'a1', saturation: 'a2' });
  change('a1', 10000);
  change('a2', 20000);
  await turn();
  assert.deepEqual(sent.map((s) => [s.args.hue, s.args.saturation]), [[toLevel(10000), toLevel(20000)]]);
  for (let v = 11000; v <= 40000; v += 1000) change('a1', v);
  change('a2', 50000);
  report.hue(toLevel(10000));
  sent[0].answer();
  await turn();
  assert.deepEqual(sent.map((s) => [s.args.hue, s.args.saturation]), [[toLevel(10000), toLevel(20000)], [toLevel(40000), toLevel(50000)]]);
  sent[1].answer();
  await turn();
  assert.equal(sent.length, 2);
  // the saturation alone: the hue as last sent
  change('a2', 60000);
  await turn();
  assert.deepEqual([sent[2].args.hue, sent[2].args.saturation], [toLevel(40000), toLevel(60000)]);
});

test('OnOff: taps while a command is out make one more, the last of them', async () => {
  const { sent, change, report } = bound({ node: 1, cluster: 'OnOff', join: 'd1' });
  await turn();
  change('d1', 1);
  await turn();
  report.onOff(true);
  change('d1', 0);
  change('d1', 1);
  change('d1', 0);
  await turn();
  assert.deepEqual(sent.map((s) => s.command), ['on']);
  sent[0].answer();
  await turn();
  assert.deepEqual(sent.map((s) => s.command), ['on', 'off']);
});

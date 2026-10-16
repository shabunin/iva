import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { ControlSystem } from '../src/runtime/cf/systemManager.ts';

// the CF object reads the screen's density
(globalThis as any).window ??= { devicePixelRatio: 1 };

const tick = () => new Promise((r) => setTimeout(r, 0));

/** a system as the CF object holds it: what a sleep and a wake do to it */
function fakeSystem(name: string, events: string[], enabled = true) {
  return {
    name,
    enabled,
    stop() {
      this.enabled = false;
      events.push(`stop ${name}`);
    },
    start() {
      events.push(`start ${name}`);
    },
  };
}

test('in the background the GUI sleeps: GUISuspended, its systems closed; back: GUIResumed, the same systems again', async () => {
  const cf = new CFAPI();
  const events: string[] = [];
  cf.watch(cf.GUISuspendedEvent, () => events.push('suspended'));
  cf.watch(cf.GUIResumedEvent, () => events.push('resumed'));
  cf.watch(cf.NetworkStatusChangeEvent, (s: { ipv4address: string }) => events.push(`network ${s.ipv4address}`));
  const avr = fakeSystem('AVR', events);
  // the loopback alias '' is the same system; one a script stopped stays stopped
  cf.controlSystems = { AVR: avr, '': avr, Off: fakeSystem('Off', events, false) };
  cf.ipv4address = '10.0.0.5';

  cf.suspend();
  cf.suspend();
  assert.equal(cf.suspended, true);
  assert.deepEqual(events, ['suspended', 'stop AVR']);
  cf.resume();
  await tick();
  // the same network: no NetworkStatusChangeEvent
  assert.deepEqual(events, ['suspended', 'stop AVR', 'resumed', 'start AVR']);
  assert.equal(cf.suspended, false);
  assert.equal(avr.enabled, true);

  // asleep, and back on another network
  events.length = 0;
  cf.suspend();
  cf.ipv4address = '192.168.1.7';
  cf.resume();
  await tick();
  assert.deepEqual(events, ['suspended', 'stop AVR', 'resumed', 'start AVR', 'network 192.168.1.7']);
});

test('the screen unlocking shows and hides the page a few times: one wake, once it stays shown', async () => {
  const page = { visibilityState: 'visible' };
  (globalThis as any).document = page;
  const cf = new CFAPI();
  const events: string[] = [];
  cf.watch(cf.GUISuspendedEvent, () => events.push('suspended'));
  cf.watch(cf.GUIResumedEvent, () => events.push('resumed'));
  const flip = (to: string) => {
    page.visibilityState = to;
    (cf as any).onVisibility();
  };
  flip('hidden');
  flip('visible');
  flip('hidden');
  flip('visible');
  assert.deepEqual(events, ['suspended']);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(events, ['suspended', 'resumed']);
});

test('the panel app paused and resumed six times as the screen unlocks (Android): its systems stopped once, started once it stays in front', async () => {
  const cf = new CFAPI();
  const events: string[] = [];
  cf.controlSystems = { Web: fakeSystem('Web', events) };
  cf.setAsleep(true);
  for (let i = 0; i < 6; i++) {
    cf.setAsleep(false);
    cf.setAsleep(true);
  }
  cf.setAsleep(false);
  assert.deepEqual(events, ['stop Web']);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(events, ['stop Web', 'start Web']);
});

test('"Disconnect on Exit/Sleep" off: the systems stay connected while the GUI sleeps', () => {
  const cf = new CFAPI();
  const events: string[] = [];
  cf.controlSystems = { AVR: fakeSystem('AVR', events) };
  cf.disconnectOnSuspend = false;
  cf.suspend();
  cf.resume();
  assert.deepEqual(events, []);
});

test('a system started again (re-enabled, another address, awake) reconnects as its alwayson says', () => {
  const sys = new ControlSystem(new CFAPI(), { type: 'system', attributes: { name: 'Web', protocol: 'http', alwayson: '1' }, children: [] } as any);
  sys.stop();
  assert.equal((sys as any).autoReconnect, false);
  sys.enabled = true;
  sys.start();
  assert.equal((sys as any).autoReconnect, true);
});

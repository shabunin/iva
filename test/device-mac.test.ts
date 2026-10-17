/**
 * CF.MACaddress where the host gives none: Android's placeholder on Android
 * (what iViewer shows there, 02:00:00:00:00:00), the default elsewhere.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFAPI } from '../src/runtime/cf/cf.ts';
import { setHost } from '../src/runtime/stdlib/host.ts';

// the CF object reads window as it is made (as the systems test gives one)
(globalThis as any).window ??= { devicePixelRatio: 1 };

const device = (platform: string, MACaddress: string) => ({
  platform, version: '16', model: 'Titan 2', name: 'phone', uuid: 'u', ipv4address: '192.168.2.9', ipv4netmask: '255.255.255.0',
  ipv6address: '', ipv6netmask: '', MACaddress, networkType: 'WiFi', networkSSID: '',
});

test('no MAC from the host: Android\'s placeholder on Android, the default elsewhere; a MAC given is taken', async () => {
  try {
    for (const [platform, mac, expected] of [['Android', '', '02:00:00:00:00:00'], ['Linux', '', '00:00:00:00:00:00'], ['Android', 'aa:bb:cc:dd:ee:ff', 'aa:bb:cc:dd:ee:ff']]) {
      setHost({ device: async () => device(platform, mac) } as any);
      const cf = new CFAPI();
      await cf.loadDevice();
      assert.equal(cf.MACaddress, expected, `${platform} with "${mac}"`);
      assert.equal(cf.ipv4address, '192.168.2.9');
    }
  } finally {
    setHost(null);
  }
});

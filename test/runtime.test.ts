import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textLayout } from '../src/runtime/cf/components/textStyle.ts';

test('text layout: alignment, padding, weight from the device font name, italics, wrapping', () => {
  const l = textLayout({ 'text-align': 'right', 'vertical-align': 'bottom', padding: '0px 16px 4px 2px', 'font-name': "'HelveticaNeue-Medium'",
    'font-family': "'Helvetica Neue'", 'font-style': 'italics', 'font-size': '20px', color: '#ABCDEF' }, 300, true);
  assert.deepEqual([l.align, l.valign, l.pad], ['right', 'bottom', [0, 16, 4, 2]]);
  assert.equal(l.style.fontWeight, '500');
  assert.equal(l.style.fontStyle, 'italic');
  assert.equal(l.style.fontSize, 20);
  assert.equal(l.style.wordWrapWidth, 300 - 16 - 2);
  assert.deepEqual(l.style.fontFamily, ['Helvetica Neue', 'sans-serif']);
  // no theme: the default alignment, middle, bold from font-weight
  const d = textLayout({ 'font-weight': 'bold' }, 100, false, 'center');
  assert.deepEqual([d.align, d.valign, d.pad, d.style.fontWeight, d.style.wordWrap], ['center', 'middle', [0, 0, 0, 0], 'bold', false]);
  assert.equal(textLayout({ 'font-name': "'Arial-BoldMT'" }, 100, false).style.fontWeight, 'bold');
});

import { crc, crcOf, hash } from '../src/runtime/cf/jsapi/utilities.ts';
import { listRemove, listUpdate } from '../src/runtime/cf/jsapi/lists.ts';
import { getJoin, getJoins } from '../src/runtime/cf/jsapi/gui.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';
import { TimerClock } from '../src/runtime/cf/timerClock.ts';

test('CF.crc: the six CRCs iViewer names (their check values) in its four outputs', () => {
  const check: Record<string, number> = {
    CRC_8: 0xf4, CRC_16: 0xbb3d, CRC_16_CCITT: 0x29b1, CRC_16_MODBUS: 0x4b37, CRC_32: 0xcbf43926, CRC_32C: 0xe3069283,
  };
  for (const [type, value] of Object.entries(check)) assert.equal(crcOf(type, '123456789')?.value, value, type);
  const out: unknown[] = [];
  for (const format of [0, 1, 2, 3]) crc({} as any, 'CRC_16_MODBUS', '123456789', format, (v: unknown) => out.push(v));
  assert.deepEqual(out, [0x4b37, '4B37', '\x4b\x37', '\x37\x4b']);
  // bytes as CF.send's binary strings: a char a byte
  assert.equal(crcOf('CRC_16_MODBUS', '\x01\x03\x00\x00\x00\x0a')?.value, 0xcdc5);
  let none: unknown = 'x';
  crc({} as any, 'CRC_7', 'a', 0, (v: unknown) => { none = v; });
  assert.equal(none, null);
});

test('CF.hash takes the API\'s own constants (CF.Hash_MD5 is "HASH_MD5" ...)', async () => {
  const md5 = await new Promise((r) => hash({} as any, 'HASH_MD5', 'abc', r));
  const sha = await new Promise((r) => hash({} as any, 'HASH_SHA256', 'abc', r));
  assert.equal(md5, '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(sha, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('lists: listRemove(list, index) removes to the end; listUpdate takes CF.LastItem and CF.AllItems', () => {
  const ctx: any = { listsStore: {}, dispatchEvent() {}, LastItem: 'LAST_ITEM', AllItems: 'ALL_ITEMS' };
  const fill = () => { ctx.listsStore.l1 = [0, 1, 2, 3, 4].map((i) => ({ s1: `row ${i}` })); };
  fill();
  listRemove(ctx, 'l1', 2);
  assert.deepEqual(ctx.listsStore.l1.map((r: any) => r.s1), ['row 0', 'row 1']);
  fill();
  listRemove(ctx, 'l1', 1, 2);
  assert.deepEqual(ctx.listsStore.l1.map((r: any) => r.s1), ['row 0', 'row 3', 'row 4']);
  listRemove(ctx, 'l1');
  assert.deepEqual(ctx.listsStore.l1, []);
  fill();
  listUpdate(ctx, 'l1', [{ index: ctx.LastItem, s1: 'last' }, { index: 1, d1: 1 }]);
  assert.deepEqual([ctx.listsStore.l1[4], ctx.listsStore.l1[1]], [{ s1: 'last' }, { s1: 'row 1', d1: 1 }]);
  listUpdate(ctx, 'l1', [{ index: ctx.AllItems, d2: 1 }]);
  assert.ok(ctx.listsStore.l1.every((r: any) => r.d2 === 1 && !('index' in r)));
});

test('CF.getJoin / getJoins: values as strings, as iViewer hands them ("1" / "0" for a digital join)', () => {
  const ctx: any = {
    tokensStore: {},
    parseJoin: (j: string) => ({ type: j[0], id: j.slice(1) }),
  };
  joinStore.set('901', 'd', true);
  joinStore.set('901', 'a', 32768);
  joinStore.set('901', 's', 'hello');
  const got: unknown[] = [];
  for (const j of ['d901', 'a901', 's901', 'd902']) getJoin(ctx, j, (_j, v) => got.push(v));
  assert.deepEqual(got, ['1', '32768', 'hello', '0']);
  getJoins(ctx, ['d901', 'a901'], (all) => assert.deepEqual([all.d901.value, all.a901.value], ['1', '32768']));
});

test('timers: an interval after showing, then every interval while shown, repeatCount times; over again when shown again', () => {
  const runs = (clock: TimerClock, steps: [number, boolean, number][]) => steps.filter(([t, shown, i]) => clock.tick(t, shown, i)).map(([t]) => t);
  // continuous, 1000 ms: shown at 0 -> 1000, 2000; hidden at 2500; shown again at 3000 -> 4000
  assert.deepEqual(runs(new TimerClock(0), [[0, true, 1000], [500, true, 1000], [1000, true, 1000], [1500, true, 1000], [2000, true, 1000],
    [2500, false, 1000], [3000, true, 1000], [3500, true, 1000], [4000, true, 1000]]), [1000, 2000, 4000]);
  // twice only
  assert.deepEqual(runs(new TimerClock(2), [[0, true, 100], [100, true, 100], [200, true, 100], [300, true, 100], [400, true, 100]]), [100, 200]);
  // interval 0: never; once (repeatCount 1): at once - GUI Designer's own demos (a page's setup command)
  assert.deepEqual(runs(new TimerClock(0), [[0, true, 0], [100, true, 0]]), []);
  assert.deepEqual(runs(new TimerClock(1), [[0, true, 0], [100, true, 0], [200, false, 0], [300, true, 0]]), [0, 300]);
  // the join changes the interval: 0 -> 500 starts it
  assert.deepEqual(runs(new TimerClock(0), [[0, true, 0], [100, true, 500], [599, true, 500], [600, true, 500]]), [600]);
});

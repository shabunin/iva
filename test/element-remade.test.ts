/**
 * An element made again in its place (CF.setProperties w / h, theme) leaves
 * its old self nowhere: its join and its tags reach the new one only, and
 * the old one's join listeners go with it - not kept till the page goes. A
 * flip still takes the page's at once, its transition going or not.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <txt j="1" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">Hello</txt>
      <btn j="1" x="200" y="20" w="80" h="40" t="b" flip="None" sim="1" l="0" tags="alarm"><inactive s="6">Off</inactive><active s="7">On</active></btn>
      <subpage name="Card" x="300" y="20" j="30" transition1="" subtype1="" time1="0" ease1="" transition2="" subtype2="" time2="0" ease2="" clickthrough="0" topmost="0" v="1" l="0" />
    </landscape>
  </page>
  <page name="Other" j="11" transition="fade" subtype="" time="0.3" ease="">
    <portrait />
    <landscape><txt j="60" x="0" y="0" w="50" h="20" t="t" wrap="False" l="0">elsewhere</txt></landscape>
  </page>
  <subpage name="Card" w="80" h="60"><txt j="50" x="0" y="0" w="80" h="20" t="t" wrap="False" l="0" /></subpage>`;

const THEMES = `<theme type="button" name=".red[state='0']"><![CDATA[background-color: #AA0000;]]></theme>
  <theme type="button" name=".red[state='1']"><![CDATA[background-color: #FF0000;]]></theme>`;

const listeners = (key: string) => (joinStore as any).listeners.get(key)?.size ?? 0;

test('an element made again leaves its old self nowhere: one object on its join and tag, one listener on each join', async () => {
  const { CF, renderer } = await runGui(GUI, { themes: THEMES });
  for (let i = 0; i < 40; i++) CF.setProperties({ join: 's1', w: 100 + i });
  assert.equal(renderer.nodesMap.s1.length, 1);
  assert.equal(listeners('s1'), 1);
  // a blinking alarm: its theme toggled
  for (let i = 0; i < 40; i++) CF.setProperties({ join: 'd1', theme: i % 2 ? 'b' : 'red' });
  assert.equal(renderer.nodesMap.d1.length, 1);
  assert.equal(renderer.tagsMap.alarm.length, 1);
  assert.deepEqual(['d1', 's6', 's7'].map(listeners), [1, 1, 1]);
  // a subpage made again: what's in it too
  for (let i = 0; i < 40; i++) CF.setProperties({ join: 'd30', w: 80 + i });
  assert.deepEqual([renderer.nodesMap.d30.length, renderer.nodesMap.s50.length], [1, 1]);
  assert.deepEqual(['d30', 's50'].map(listeners), [1, 1]);
  // what the joins reach is the new one
  CF.setJoin('s1', 'changed');
  assert.equal(renderer.nodesMap.s1[0].destroyed, false);
});

test("a flip takes the page's listeners at once, its transition still going - the elements made again too", async () => {
  const { CF, renderer } = await runGui(GUI, { themes: THEMES });
  CF.setProperties({ join: 's1', w: 120 });
  CF.setProperties({ join: 'd1', theme: 'red' });
  assert.deepEqual(['s1', 'd1', 's6', 'd30', 's50'].map(listeners), [1, 1, 1, 1, 1]);
  renderer.navigate('Other');
  assert.deepEqual(['s1', 'd1', 's6', 'd30', 's50'].map(listeners), [0, 0, 0, 0, 0]);
  assert.equal(listeners('s60'), 1);
  renderer.navigate('Main');
  assert.deepEqual(['s1', 'd1', 's6', 'd30', 's50', 's60'].map(listeners), [1, 1, 1, 1, 1, 0]);
});

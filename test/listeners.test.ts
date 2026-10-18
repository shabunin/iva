/**
 * Listeners on joins live with the page (or list row) whose elements they
 * serve: a flip clears them; a GUI loaded anew brings its own JoinChangeEvent
 * bridge in place of the last one's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
import { joinStore, JoinStore } from '../src/runtime/cf/joinStore.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <txt j="1" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0">Hello</txt>
      <subpage name="Card" x="300" y="20" j="30" transition1="" subtype1="" time1="0" ease1="" transition2="" subtype2="" time2="0" ease2="" clickthrough="0" topmost="0" v="1" l="0" />
      <video x="300" y="170" w="90" h="50" j="41" play="36" stop="37" url="" bgcolor="" format="mjpeg" auth_user="" auth_password="" auth_realm="" auth_host="" auth_method="" auth_proxy="" autoplay="0" />
    </landscape>
  </page>
  <page name="Other" j="11" transition="" subtype="" time="0" ease="">
    <portrait />
    <landscape><txt j="60" x="0" y="0" w="50" h="20" t="t" wrap="False" l="0">elsewhere</txt></landscape>
  </page>
  <subpage name="Card" w="80" h="60"><txt j="50" x="0" y="0" w="80" h="20" t="t" wrap="False" l="0" /></subpage>`;

const listeners = (key: string) => (joinStore as any).listeners.get(key)?.size ?? 0;
const bridges = () => (joinStore as any).globalListeners.size;

test("a subpage's and a video's join listeners go with their page, as every other element's do: a flip away leaves none, each flip back makes one", async () => {
  const { renderer } = await runGui(GUI);
  assert.deepEqual(['s1', 'd30', 's41', 's50'].map(listeners), [1, 1, 1, 1]);
  renderer.navigate('Other');
  assert.deepEqual(['s1', 'd30', 's41', 's50'].map(listeners), [0, 0, 0, 0]);
  renderer.navigate('Main');
  renderer.navigate('Other');
  renderer.navigate('Main');
  assert.deepEqual(['s1', 'd30', 's41', 's50'].map(listeners), [1, 1, 1, 1]);
});

test("one JoinChangeEvent bridge however many GUIs were loaded: the CF object made for a GUI replaces the last one's; clear() drops them all", async () => {
  const a = await runGui(GUI);
  const b = await runGui(GUI);
  assert.equal(bridges(), 1);
  const heard: string[] = [];
  a.CF.watch(a.CF.JoinChangeEvent, 's1', () => heard.push('old'));
  b.CF.watch(b.CF.JoinChangeEvent, 's1', () => heard.push('new'));
  b.CF.setJoin('s1', 'x');
  // (JoinChangeEvent reaches a watcher once the script has moved on)
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(heard, ['new']);
  // a store cleared (a GUI loaded anew) has no bridge till the new CF's
  const store = new JoinStore();
  let told = 0;
  store.onAny(() => told++);
  store.set('1', 's', 'a');
  store.clear();
  store.set('1', 's', 'b');
  assert.equal(told, 1);
});

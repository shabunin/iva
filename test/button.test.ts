/**
 * A button's events as CF gives them to a watcher (ObjectPressedEvent /
 * ObjectReleasedEvent: join, value "1" / "0", tokens) - with an <actions>
 * group as without one; a watcher of a join hears that join's only.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui } from './gui-runtime.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <btn j="4" x="0" y="0" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">A</inactive><active s="0">A</active></btn>
      <btn j="5" x="0" y="50" w="80" h="40" t="b" flip="None" sim="1" l="0"><inactive s="0">B</inactive><active s="0">B</active>
        <actions><action><press js="CF.setJoin('s9', 'pressed');" /><release js="CF.setJoin('s9', 'released');" /></action></actions>
      </btn>
    </landscape>
  </page>`;

/** the button's view (what a finger touches), by its join */
const view = (renderer: any, join: string) => renderer.nodesMap[join][0].children[0];
/** a touch as the view hears it (pixi/ui binds mouse events where Pixi sees no mobile device: here) */
const touch = (v: any, type: 'down' | 'up') => v.emit(`mouse${type}`, { type: `mouse${type}` });

test('ObjectPressedEvent / ObjectReleasedEvent: (join, "1" / "0", tokens), for a button with <actions> too; a watcher of a join hears that join only', async () => {
  const { CF, renderer } = await runGui(GUI);
  const heard: unknown[][] = [];
  CF.watch(CF.ObjectPressedEvent, 'd5', (...a: unknown[]) => heard.push(['pressed', ...a]));
  CF.watch(CF.ObjectReleasedEvent, 'd5', (...a: unknown[]) => heard.push(['released', ...a]));
  CF.setToken('d5', 'room', 'Kitchen');
  touch(view(renderer, 'd5'), 'down');
  assert.deepEqual(heard, [['pressed', 'd5', '1', { room: 'Kitchen' }]]);
  assert.equal(joinStore.get('9', 's'), 'pressed', 'its press action ran');
  touch(view(renderer, 'd5'), 'up');
  assert.deepEqual(heard[1], ['released', 'd5', '0', { room: 'Kitchen' }]);
  assert.equal(joinStore.get('9', 's'), 'released', 'its release action ran');
  // another button's press is not d5's; a plain button (no <actions>) tells its events the same way
  const plain: unknown[][] = [];
  CF.watch(CF.ObjectPressedEvent, 'd4', (...a: unknown[]) => plain.push(a));
  touch(view(renderer, 'd4'), 'down');
  touch(view(renderer, 'd4'), 'up');
  assert.equal(heard.length, 2);
  assert.deepEqual(plain, [['d4', '1', {}]]);
  // a watcher with no join hears every button
  const all: string[] = [];
  CF.watch(CF.ObjectReleasedEvent, (join: string) => all.push(join));
  touch(view(renderer, 'd4'), 'down');
  touch(view(renderer, 'd4'), 'up');
  touch(view(renderer, 'd5'), 'down');
  touch(view(renderer, 'd5'), 'up');
  assert.deepEqual(all, ['d4', 'd5']);
});

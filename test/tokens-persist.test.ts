/**
 * A global token is one token under "[name]" and "name" (GUI Designer writes
 * the brackets, a script may not): CF.setToken either way updates the token
 * the .gui declared, and a persisted one is kept under its declared name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui, answer } from './gui-runtime.ts';

const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1"><portrait /><landscape /></page>`;

test('CF.setToken without the brackets a persisted token was declared with: the same token, persisted', async () => {
  const stored = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v), removeItem: (k: string) => void stored.delete(k) };
  try {
    const { CF } = await runGui(GUI, { tokens: '<token name="[kept]" value="" persist="1" /><token name="[plain]" value="p" persist="0" />' });
    CF.setToken(CF.GlobalTokensJoin, 'kept', 'v1');
    let [, , tokens] = await answer<[string, string | null, Record<string, string>]>((cb) => CF.getJoin(CF.GlobalTokensJoin, cb));
    assert.deepEqual(tokens, { '[kept]': 'v1', '[plain]': 'p' }, 'one key, the declared one');
    assert.equal(stored.get('cf-token:T:[kept]'), 'v1', 'persisted under the declared name');
    CF.setToken(CF.GlobalTokensJoin, '[kept]', 'v2');
    CF.setToken(CF.GlobalTokensJoin, 'plain', 'q');
    [, , tokens] = await answer<[string, string | null, Record<string, string>]>((cb) => CF.getJoin(CF.GlobalTokensJoin, cb));
    assert.deepEqual(tokens, { '[kept]': 'v2', '[plain]': 'q' });
    assert.equal(stored.get('cf-token:T:[kept]'), 'v2');
    assert.equal(stored.has('cf-token:T:[plain]'), false, 'not a persisted token');
    // a token no .gui declared: as the script names it
    CF.setToken(CF.GlobalTokensJoin, 'fresh', 'f');
    [, , tokens] = await answer<[string, string | null, Record<string, string>]>((cb) => CF.getJoin(CF.GlobalTokensJoin, cb));
    assert.equal(tokens.fresh, 'f');
  } finally {
    delete (globalThis as any).localStorage;
  }
});

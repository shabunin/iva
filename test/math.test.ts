import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMath } from '../src/runtime/cf/mathExpr.ts';
import { TokenEngine } from '../src/runtime/cf/tokenEngine.ts';

test("iViewer's math: its operators by priority, ^ a power, and / or / xor, comparisons, functions, if()", () => {
  assert.equal(evaluateMath('2 + 3 * 4 ^ 2'), 50);
  assert.equal(evaluateMath('2 ^ 3 ^ 2'), 512);
  assert.equal(evaluateMath('-2 ^ 2'), -4);
  assert.equal(evaluateMath('10 % 4 + 1'), 3);
  assert.equal(evaluateMath('1 < 2 and 3 >= 3'), 1);
  assert.equal(evaluateMath('1 xor 1'), 0);
  assert.equal(evaluateMath('0 or 2 != 2'), 0);
  assert.equal(evaluateMath('if(5 > 3, 10, 20)'), 10);
  assert.equal(evaluateMath('5 > 3 ? 1 : 2'), 1);
  assert.equal(evaluateMath('sum(1, 2, 3) + avg(2, 4)'), 9);
  assert.equal(evaluateMath('rtod(dtor(90))'), 90);
  assert.equal(evaluateMath('value / 65535 * 100', { value: 65535 }), 100);
  assert.throws(() => evaluateMath('alert(1)'));
  assert.throws(() => evaluateMath('2 +'));
});

test('{{ }} in a string: the math in it, an expression it can\'t read is 0', () => {
  const ctx = { tokensStore: {} } as any;
  assert.equal(TokenEngine.replaceTokens('Level {{floor(2.7) + 2^3}}', ctx), 'Level 10');
  assert.equal(TokenEngine.replaceTokens('{{rtod(1) > 57 and 1}}', ctx), '1');
  assert.equal(TokenEngine.replaceTokens('{{nope(1)}}', ctx), '0');
});

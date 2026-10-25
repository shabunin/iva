import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circle, drawnCacheLimit } from '../src/compiler/images.ts';

const colour = (i: number) => `#${((i * 7919) % 0xffffff).toString(16).padStart(6, '0')}`;

test('a rebuild of a big project redraws nothing: the drawing cache keeps thousands', () => {
  const first = circle(10, colour(0));
  // more than the 2000 drawings the cache used to empty itself at
  for (let i = 1; i < 2100; i++) circle(4 + (i % 50), colour(i));
  assert.equal(circle(10, colour(0)), first);
});

test('the drawing cache is bounded by bytes and lets the least recently used go', () => {
  const a = circle(20, colour(1));
  const b = circle(20, colour(2));
  const c = circle(20, colour(3));
  // a used again: b is now the oldest
  circle(20, colour(1));
  drawnCacheLimit(2 * (a.length + 200));
  try {
    assert.equal(circle(20, colour(1)), a);
    assert.equal(circle(20, colour(3)), c);
    assert.notEqual(circle(20, colour(2)), b);
  } finally {
    drawnCacheLimit(64 * 1024 * 1024);
  }
});

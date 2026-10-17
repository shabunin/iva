import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleCss } from '../src/compiler/style.ts';

const image = () => 'x.png';

test('opacity: a text, an input and a button without a background get it too (not only inside the button triple that comes with a background)', () => {
  assert.match(styleCss('text', { opacity: 0.5 }, image), /opacity: 0\.5;/);
  assert.match(styleCss('input', { opacity: 0.25 }, image), /opacity: 0\.25;/);
  assert.match(styleCss('button', { opacity: 0.5 }, image), /filter: Alpha\(Opacity=50\); -moz-opacity:0\.5; opacity: 0\.5;/);
  // with a background: the triple once, as GUI Designer writes it, right before the colour
  const withBg = styleCss('button', { opacity: 0.5, bg: '#112233' }, image);
  assert.equal(withBg.match(/opacity:/g)?.length, 2, 'the -moz-opacity and opacity of one triple');
  assert.match(withBg, /opacity: 0\.5; background-color: #112233;/);
  // none given: nothing about opacity for a text or a button; Designer's triple at 1 for a button with a background
  assert.doesNotMatch(styleCss('text', {}, image), /opacity/);
  assert.doesNotMatch(styleCss('button', {}, image), /opacity/);
  assert.match(styleCss('button', { bg: '#000000' }, image), /Opacity=100/);
  assert.match(styleCss('background', { opacity: 0.3 }, image), /opacity: 0\.3;/);
});

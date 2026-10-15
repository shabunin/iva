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

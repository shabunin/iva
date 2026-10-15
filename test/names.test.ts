import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawnFile, drawnSet, fileName, newNames, dropNames } from '../src/compiler/names.ts';

test('file names from labels: lower case Latin, Russian transliterated, words joined by -', () => {
  assert.equal(fileName('Термостат'), 'termostat');
  assert.equal(fileName('Подсветка картин'), 'podsvetka-kartin');
  assert.equal(fileName('Now 21.2°'), 'now-21-2');
  assert.equal(fileName('#2B3137'), '2b3137');
  assert.equal(fileName('Crème brûlée'), 'creme-brulee');
  assert.equal(fileName('★'), '');
});

test('one name a drawing: the first free of its names, a number when they are taken, the same drawing its name again', () => {
  newNames();
  try {
    assert.equal(drawnFile('a', ['buttons/120x44-r12-222']), 'buttons/120x44-r12-222');
    assert.equal(drawnFile('a', ['buttons/whatever']), 'buttons/120x44-r12-222');
    assert.equal(drawnFile('b', ['icons/lightbulb', 'icons/lightbulb-fff']), 'icons/lightbulb');
    assert.equal(drawnFile('c', ['icons/lightbulb', 'icons/lightbulb-fff']), 'icons/lightbulb-fff');
    assert.equal(drawnFile('d', ['icons/lightbulb', 'icons/lightbulb-fff']), 'icons/lightbulb-2');
    // names are told apart blind to case (iViewer's files, Windows servers): lightbulb and lightbulb-2 are taken
    assert.equal(drawnFile('e', ['Icons/LightBulb']), 'Icons/LightBulb-3');
  } finally {
    dropNames();
  }
});

test("a dial's folder: named after it; drawn the same, shared; in another look the same dial, its name and the look's", () => {
  newNames();
  try {
    // the dark look: two dials, the second labelled the same
    assert.equal(drawnSet('dials', 'big|blue', 'Термостат', 'dial', 'dark', '0'), 'dials/termostat');
    assert.equal(drawnSet('dials', 'small|blue', 'Термостат', 'dial', 'dark', '1'), 'dials/termostat-2');
    assert.equal(drawnSet('dials', 'big|blue', 'Heating', 'dial', 'dark', '2'), 'dials/termostat');
    // the light look, the same dials in the same order: drawn otherwise, the first look's name and -light
    assert.equal(drawnSet('dials', 'big|cyan', 'Термостат', 'dial', 'light', '0'), 'dials/termostat-light');
    assert.equal(drawnSet('dials', 'small|cyan', 'Термостат', 'dial', 'light', '1'), 'dials/termostat-2-light');
    // drawn the same in both looks: one folder
    assert.equal(drawnSet('knobs', 'k|grey', 'Volume', 'knob', 'dark', '0'), 'knobs/volume');
    assert.equal(drawnSet('knobs', 'k|grey', 'Volume', 'knob', 'light', '0'), 'knobs/volume');
    // no label: the fallback
    assert.equal(drawnSet('pickers', 'p', undefined, 'colour'), 'pickers/colour');
  } finally {
    dropNames();
  }
});

/**
 * A macro's steps: each delay counts from the step before (they add up), as
 * the CommandFusion wiki has it - and as the docs and types now say.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runMacroByName, stopMacroByName } from '../src/runtime/cf/systemManager.ts';
import { typesFile } from '../src/types.ts';

test("a macro's step delays add up: steps of 100, 100, 100 ms run at 100, 200, 300 ms", () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const ran: [string, number][] = [];
    let now = 0;
    const steps = ['A', 'B', 'C'].map((c) => ({ type: 'cmd', attributes: { command: c, delay: '100' }, children: [] }));
    const cf: any = {
      renderer: { project: { macros: [{ type: 'macro', attributes: { name: 'Night' }, children: steps }] } },
      runCommand: (_system: string, command: string) => ran.push([command, now]),
    };
    runMacroByName(cf, 'Night');
    for (const t of [100, 200, 300]) {
      now = t;
      mock.timers.tick(100);
    }
    assert.deepEqual(ran, [['A', 100], ['B', 200], ['C', 300]]);
    stopMacroByName('Night');
  } finally {
    mock.timers.reset();
  }
});

test('the docs and the types say so: a <Step delay> is ms after the previous step, not from the start', () => {
  assert.match(typesFile('0'), /delay\?: number;[\s\S]{0,400}/);
  const step = typesFile('0').match(/interface StepProps[\s\S]*?\n\s*\}/)?.[0] ?? '';
  assert.match(step, /after the previous step/);
  assert.doesNotMatch(step, /from the macro start/);
  const doc = fs.readFileSync(new URL('../docs/components.md', import.meta.url), 'utf8');
  assert.match(doc, /`delay` \(ms after the previous step/);
  assert.doesNotMatch(doc, /`delay` \(ms from the start\)/);
});

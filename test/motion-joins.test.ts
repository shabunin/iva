/**
 * The joins iva gives elements with motion={...}: the same element made again (laid out the same turned, a
 * subpage placed on several pages) the same join, so iva-start.js sets up the element the .gui has - each way
 * the panel is turned.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile, type CompileResult } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';

async function build(jsx: string, size?: string) {
  const dir = tmpDir('iva-motion-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  return compile(path.join(dir, 'app.jsx'), size ? { size } : {});
}

/** iva-start.js run on a panel turned `first`, then turned the other way: the joins IvaMotion.add is given at the start, and once turned */
function motions(r: CompileResult, first: 'landscape' | 'portrait') {
  const code = (name: string) => r.scripts.find((s) => s.name === name)?.code ?? '';
  const Joins = new Function(`${code('iva-joins.js')}\nreturn Joins;`)();
  const added: string[] = [];
  const watchers: ((page: string, o: string) => void)[] = [];
  const CF: any = {
    modules: [], LandscapeOrientation: 'L', PortraitOrientation: 'P', OrientationChangeEvent: 'turn',
    currentOrientation: first === 'portrait' ? 'P' : 'L', log: (t: string) => assert.fail(t),
    watch: (_e: string, f: (page: string, o: string) => void) => watchers.push(f),
  };
  new Function('CF', 'setTimeout', 'IvaMotion', 'Joins', code('iva-start.js'))(CF, (f: () => void) => f(), { add: (it: any) => added.push(it.join) }, Joins);
  CF.modules[0].setup();
  const start = added.splice(0);
  watchers.forEach((w) => w('Main', first === 'portrait' ? 'L' : 'P'));
  return { start, turned: added };
}

/** a page's block that way */
const block = (r: CompileResult, page: string, way: string) =>
  new RegExp(`<${way}(?: [^>/]*)?>([\\s\\S]*?)</${way}>`).exec(new RegExp(`<page name="${page}"[\\s\\S]*?</page>`).exec(r.xml)![0])?.[1] ?? '';

const text = (j: string) => new RegExp(`<txt j="${j.slice(1)}"`);

test('orientation="both", a page laid out the same either way (a square screen): one block, its element\'s motion set up either way', async () => {
  const r = await build(`export default (
  <Project name="T" width={800} height={800} orientation="both">
    <Page name="Main"><Text w={200} h={30} text="Hi" motion={{ enter: { from: { opacity: 0 } } }} /></Page>
  </Project>
);`, '800x800');
  assert.equal(block(r, 'Main', 'portrait'), '', 'shown either way: one block');
  assert.deepEqual(Object.keys(r.joins.serial), ['iva_motion0']);
  const m = motions(r, 'landscape');
  assert.deepEqual(m, { start: [`s${r.joins.serial.iva_motion0}`], turned: [] }, 'set up once: the same element either way');
  assert.match(block(r, 'Main', 'landscape'), text(m.start[0]));
});

test('orientation="both", an element laid out elsewhere turned: a join of its own there (iva-motion.js reads where it is once)', async () => {
  const r = await build(`const { width } = screen();
export default (
  <Project name="T" width={1024} height={768} orientation="both">
    <Page name="Main"><Text x={width - 200} w={200} h={30} text="Hi" motion={{ enter: { from: { opacity: 0 } } }} /></Page>
  </Project>
);`);
  for (const first of ['landscape', 'portrait'] as const) {
    const m = motions(r, first);
    assert.equal(m.start.length, 1);
    assert.equal(m.turned.length, 1);
    assert.match(block(r, 'Main', first), text(m.start[0]));
    assert.match(block(r, 'Main', first === 'landscape' ? 'portrait' : 'landscape'), text(m.turned[0]));
    assert.notEqual(m.turned[0], m.start[0]);
  }
});

test('a subpage with motion inside placed on two pages (a component): the subpage once, the motion on the join its element has', async () => {
  const r = await build(`const Card = () => (
  <Subpage name="card" w={200} h={100}><Text w={200} h={30} text="Hi" motion={{ enter: { from: { opacity: 0 } } }} /></Subpage>
);
export default (
  <Project name="T" width={1024} height={768}>
    <Page name="A"><Card /></Page>
    <Page name="B"><Card /></Page>
  </Project>
);`);
  assert.equal((r.xml.match(/<subpage name="card" w=/g) ?? []).length, 1);
  assert.deepEqual(Object.keys(r.joins.serial), ['iva_motion0']);
  const start = r.scripts.find((s) => s.name === 'iva-start.js')!.code!;
  assert.deepEqual([...start.matchAll(/IvaMotion\.add\(\{ join: Joins\.s\["(\w+)"\], page: "(\w+)"/g)].map((m) => [m[1], m[2]]), [['iva_motion0', 'A'], ['iva_motion0', 'B']]);
});

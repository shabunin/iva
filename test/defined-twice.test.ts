/**
 * A subpage, a system, a page's block made twice (a component placed on several pages, a project laid out
 * turned): once if it's the same, else an error or one of its own - named joins told apart as numbers are,
 * before they're numbered.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { compile, IvaError } from '../src/compiler/index.ts';
import { tmpDir } from './tmp.ts';

async function build(jsx: string, size?: string) {
  const dir = tmpDir('iva-twice-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  return compile(path.join(dir, 'app.jsx'), size ? { size } : {});
}

async function fails(jsx: string, pattern: RegExp) {
  await assert.rejects(build(jsx), (e: any) => {
    assert.ok(e instanceof IvaError, `not an IvaError: ${e}`);
    assert.match(e.message, pattern);
    return true;
  });
}

const rows = (a: string, b: string) => `const Row = ({ join }) => (
  <Subpage name="row" w={200} h={50}><Button w={100} h={40} join={join} /></Subpage>
);
export default (
  <Project name="T" width={1024} height={768}>
    <Page name="A"><Row join={${a}} /></Page>
    <Page name="B"><Row join={${b}} /></Page>
  </Project>
);`;

test('a subpage placed on two pages with other named joins: defined twice, differently (as with numbers) - the same joins: once', async () => {
  await fails(rows('d(5)', 'd(6)'), /"row" is defined twice, differently/);
  await fails(rows("d('kitchen')", "d('hall')"), /"row" is defined twice, differently/);
  const r = await build(rows("d('kitchen')", "d('kitchen')"));
  assert.equal((r.xml.match(/<subpage name="row" w=/g) ?? []).length, 1);
  assert.match(r.xml, new RegExp(`<subpage name="row" w="200" h="50"[^>]*>\\s*<btn j="${r.joins.digital.kitchen}"`));
});

test('two systems of one name with other named joins (connectJoin, a command\'s target): two different systems - the same: one', async () => {
  const systems = (a: string, b: string) => `export default (
  <Project name="T" width={1024} height={768}>
    ${[a, b].map((j) => `<System name="X" host="10.0.0.1" port={23} connectJoin="${j}"><Command name="on" target={d('${j}Cmd')} value="1" /></System>`).join('\n    ')}
    <Page name="A" />
  </Project>
);`;
  await fails(systems('online', 'up'), /two different systems named "X"/);
  await fails(systems('online', 'online').replace("d('onlineCmd')", "d('other')"), /two different systems named "X"/);
  const r = await build(systems('online', 'online'));
  assert.equal((r.xml.match(/<system name="X"/g) ?? []).length, 1);
  assert.match(r.xml, new RegExp(`connectionStatus="${r.joins.digital.online}"`));
  assert.match(r.xml, new RegExp(`<cmd name="on" target="d${r.joins.digital.onlineCmd}" value="1"`));
});

test('orientation="both" on a square screen: a page / subpage laid out turned with other named joins is its own, its joins on its elements', async () => {
  const r = await build(`const { orientation } = screen();
const way = (a, b) => (orientation === 'portrait' ? b : a);
export default (
  <Project name="T" width={800} height={800} orientation="both">
    <Subpage name="row" w={200} h={50}><Button w={100} h={40} join={way('rowWide', 'rowTall')} /></Subpage>
    <Page name="A">
      <SubpageRef name="row" />
      <Button y={100} w={100} h={40} join={way('wide', 'tall')} />
    </Page>
  </Project>
);`, '800x800');
  const page = /<page name="A"[\s\S]*?<\/page>/.exec(r.xml)![0];
  const block = (way: string) => new RegExp(`<${way}(?: [^>/]*)?>([\\s\\S]*?)</${way}>`).exec(page)?.[1] ?? '';
  const { wide, tall, rowWide, rowTall } = r.joins.digital;
  assert.match(block('landscape'), new RegExp(`<btn j="${wide}"`));
  assert.match(block('portrait'), new RegExp(`<btn j="${tall}"`), 'the turned block kept: its button on its own join');
  assert.match(block('portrait'), /<subpage name="row__portrait"/);
  assert.match(r.xml, new RegExp(`<subpage name="row" w="200" h="50"[^>]*>\\s*<btn j="${rowWide}"`));
  assert.match(r.xml, new RegExp(`<subpage name="row__portrait" w="200" h="50"[^>]*>\\s*<btn j="${rowTall}"`));
});

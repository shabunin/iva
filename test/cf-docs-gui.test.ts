/**
 * CommandFusion's JavaScript API docs, the GUI page ("Application and GUI
 * API": joins, tokens, tags, properties, the GUI's description), held up to
 * iva's runtime: each rule and example the docs give, as they give it. A
 * GUI run as the panel runs it (test/gui-runtime.ts). Where the docs say
 * nothing, a test says what iva does and that it's iva's choice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGui, answer } from './gui-runtime.ts';

const tick = () => new Promise((r) => setTimeout(r, 0));

/** a page of each kind of element, another page, a subpage, a list's row */
const GUI = `
  <page name="Main" j="10" transition="" subtype="" time="0" ease="" start="1">
    <portrait />
    <landscape>
      <txt j="1" x="10" y="20" w="100" h="30" t="t" wrap="False" l="0" tags="label">Hello</txt>
      <txt j="2" x="10" y="50" w="100" h="30" t="t" wrap="False" l="0" />
      <txt j="3" x="10" y="80" w="100" h="30" t="t" wrap="False" l="0" />
      <txt j="5" x="10" y="110" w="100" h="30" t="t" wrap="False" l="0" />
      <btn j="1" x="200" y="20" w="80" h="40" t="b" flip="None" sim="2" l="0" s="1"><inactive s="6">Off</inactive><active s="7">On</active></btn>
      <btn j="4" x="200" y="70" w="80" h="40" t="b" flip="None" sim="2" l="0" s="1"><inactive s="0">A</inactive><active s="0">A</active></btn>
      <btn j="5" x="200" y="120" w="80" h="40" t="b" flip="None" sim="2" l="0" s="1"><inactive s="0">B</inactive><active s="0">B</active></btn>
      <slider j="1" d="20" x="10" y="150" w="180" h="16" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0" />
      <slider j="2" d="0" x="10" y="170" w="180" h="16" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0" />
      <slider j="3" d="0" x="10" y="190" w="180" h="16" min="0" max="65535" decimals="0" unit="decimal" t="" sim="1" l="0" />
      <gauge j="12" x="200" y="170" w="80" h="16" t="" l="0" tags="" />
      <subpage name="Card" x="300" y="20" j="30" transition1="" subtype1="" time1="0" ease1="" transition2="" subtype2="" time2="0" ease2="" clickthrough="0" topmost="0" v="1" l="0" />
      <input j="31" s="40" x="10" y="210" w="150" h="24" pass="0" autoFocus="0" f="0" t="t" l="0" />
      <web x="300" y="100" w="90" h="60" j="41" title="42" back="32" forward="33" refresh="34" stop="35" url="" />
      <video x="300" y="170" w="90" h="50" j="0" play="36" stop="37" url="" bgcolor="" format="mjpeg" auth_user="" auth_password="" auth_realm="" auth_host="" auth_method="" auth_proxy="" autoplay="0" />
      <list j="1" x="10" y="240" w="180" h="50" t="" headerSub="" titleSub="" contentSub="Row" footerSub="" orientation="v" l="0" swipedelete="0" />
    </landscape>
  </page>
  <page name="Other" j="11" transition="" subtype="" time="0" ease="">
    <portrait />
    <landscape>
      <txt j="60" x="0" y="0" w="50" h="20" t="t" wrap="False" l="0">elsewhere</txt>
    </landscape>
  </page>
  <subpage name="Card" w="80" h="60">
    <txt j="50" x="0" y="0" w="80" h="20" t="t" wrap="False" l="0" />
  </subpage>
  <subpage name="Row" w="180" h="25">
    <txt j="1" x="0" y="0" w="180" h="25" t="t" wrap="False" l="0" />
  </subpage>`;
const TOKENS = '<token name="[currentartist]" value="Adele" persist="0" /><token name="SERVER_URL" value="http://music.local" persist="0" />';

const gui = () => runGui(GUI, { tokens: TOKENS });
const getJoin = (CF: any, join: string) => answer<[string, string | null, Record<string, string> | null, string[]]>((cb) => CF.getJoin(join, cb));
const value = async (CF: any, join: string) => (await getJoin(CF, join))[1];
const props = async (CF: any, join: string | string[]) => (await answer<[any]>((cb) => CF.getProperties(join, cb)))[0];

// ── CF.JoinChangeEvent ───────────────────────────────────────────

test('JoinChangeEvent: (join, value as a string, tokens, tags), for a join or an array of them; unwatch with the same ones stops it', async () => {
  const { CF } = await gui();
  const got: unknown[] = [];
  const onJoinChanged = (...a: unknown[]) => got.push(a);
  CF.watch(CF.JoinChangeEvent, 'a1', onJoinChanged);
  CF.watch(CF.JoinChangeEvent, ['s1', 'd4', 'd5', 'a12'], onJoinChanged);
  CF.setToken('s1', '[zone]', 'Kitchen');
  CF.setJoin('a1', 12);
  CF.setJoin('d4', 1);
  CF.setJoin('s1', 'x');
  CF.setJoin('s2', 'not watched');
  await tick();
  assert.deepEqual(got, [['a1', '12', {}, []], ['d4', '1', {}, []], ['s1', 'x', { '[zone]': 'Kitchen' }, ['label']]]);
  got.length = 0;
  CF.unwatch(CF.JoinChangeEvent, 'a1');
  CF.unwatch(CF.JoinChangeEvent, ['s1', 'd4', 'd5', 'a12']);
  CF.setJoin('a1', 13);
  CF.setJoin('s1', 'y');
  await tick();
  assert.deepEqual(got, []);
});

test("JoinChangeEvent for a list item's join: the join as a script names it (l1:0:s1)", async () => {
  const { CF } = await gui();
  CF.listAdd('l1', [{ s1: 'a' }]);
  const got: unknown[] = [];
  CF.watch(CF.JoinChangeEvent, 'l1:0:s1', (j: string, v: string) => got.push([j, v]));
  CF.setJoin('l1:0:s1', 'b');
  await tick();
  assert.deepEqual(got, [['l1:0:s1', 'b']]);
});

// ── CF.getJoin / CF.getJoins ─────────────────────────────────────

test('getJoin: always a string, whatever the join type; a join the GUI has but nobody set: its empty value (iva: "" or "0"); one it hasn\'t: a null value and null tokens', async () => {
  const { CF } = await gui();
  CF.setJoin('a1', 226.12);
  const [join, v, tokens, tags] = await getJoin(CF, 'a1');
  assert.deepEqual([join, v, tokens, tags], ['a1', '226.12', {}, []]);
  CF.setJoin('d1', 1);
  assert.equal(await value(CF, 'd1'), '1');
  // in the GUI, never set (the docs don't say what it is: iva gives the empty value of its type)
  assert.equal(await value(CF, 's2'), '');
  assert.equal(await value(CF, 'd4'), '0');
  assert.equal(await value(CF, 'a2'), '0');
  // on a page not shown, in a subpage: in the GUI all the same
  assert.equal(await value(CF, 's60'), '');
  assert.equal(await value(CF, 's50'), '');
  // the docs' "Test whether the GUI is configured with join s1000"
  let hasS1000 = false;
  CF.getJoin('s1000', (j: string, val: string | null) => {
    if (val != null) hasS1000 = true;
  });
  assert.equal(hasS1000, false);
  assert.deepEqual((await getJoin(CF, 's1000')).slice(1, 3), [null, null]);
});

test("getJoin: a join's tags - the GUI's (tags=\"label\") and the ones a script added", async () => {
  const { CF } = await gui();
  assert.deepEqual((await getJoin(CF, 's1'))[3], ['label']);
  CF.addTag('s1', 'extra');
  assert.deepEqual((await getJoin(CF, 's1'))[3], ['label', 'extra']);
});

test('getJoin(CF.GlobalTokensJoin): the value is always an empty string, the tokens are the global ones', async () => {
  const { CF } = await gui();
  const [, v, tokens] = await getJoin(CF, CF.GlobalTokensJoin);
  assert.equal(v, '');
  assert.equal(tokens!['[currentartist]'], 'Adele');
  assert.equal(tokens!['SERVER_URL'], 'http://music.local');
});

test("getJoin: a list item's join (l1:2:s1, the third item); an item the list hasn't: null", async () => {
  const { CF } = await gui();
  CF.listAdd('l1', [{ s1: 'a' }, { s1: 'b' }, { s1: 'c' }]);
  assert.equal(await value(CF, 'l1:2:s1'), 'c');
  assert.equal(await value(CF, 'l1:5:s1'), null);
});

test('getJoins: each join a property { value, tokens, tags }; missing joins a null value and null tokens; list items too', async () => {
  const { CF } = await gui();
  CF.setJoin('s1', 'Hello');
  CF.setJoin('s2', ', world');
  CF.listAdd('l1', [{ s1: 'item' }]);
  const index = 0;
  const join2 = 'l1:' + index + ':s1';
  const [joins] = await answer<[Record<string, any>]>((cb) => CF.getJoins(['s1', 's2', 'a3', 'a99', join2], cb));
  // the docs' "set s3 to be s1+s2 strings"
  CF.setJoin('s3', joins['s1'].value + joins['s2'].value);
  assert.equal(await value(CF, 's3'), 'Hello, world');
  assert.equal(joins.s1.value, 'Hello');
  assert.deepEqual(joins.s1.tags, ['label']);
  assert.equal(joins['a3'].value, '0');
  assert.deepEqual([joins.a99.value, joins.a99.tokens], [null, null]);
  assert.equal(joins[join2].value, 'item');
});

// ── CF.setJoin ───────────────────────────────────────────────────

test("setJoin: the docs' examples - strings, numbers, digital clipping, join references and math", async () => {
  const { CF } = await gui();
  CF.setJoin('s1', 'Hello, world!');
  assert.equal(await value(CF, 's1'), 'Hello, world!');
  CF.setJoin('a1', 226.12);
  assert.equal(await value(CF, 'a1'), '226.12');
  CF.setJoin('a1', '226.12');
  assert.equal(await value(CF, 'a1'), '226.12');
  CF.setJoin('s2', '175');
  assert.equal(await value(CF, 's2'), '175');
  CF.setJoin('s2', 175);
  assert.equal(await value(CF, 's2'), '175');
  const digital: unknown[] = [];
  for (const v of [1, 10, '1', 'test']) {
    CF.setJoin('d1', v);
    digital.push(await value(CF, 'd1'));
  }
  assert.deepEqual(digital, ['1', '1', '1', '0']);
  CF.setJoin('s1', 'Living Room');
  CF.setJoin('s2', 'In [@s1] zone');
  assert.equal(await value(CF, 's2'), 'In Living Room zone');
  CF.setJoin('s3', 'Current level: {{floor([@a1] / 10)}}');
  assert.equal(await value(CF, 's3'), 'Current level: 22');
  // a digital join referred to: its value as a script gets it
  CF.setJoin('d1', 1);
  CF.setJoin('s2', 'state [@d1]');
  assert.equal(await value(CF, 's2'), 'state 1');
});

test('setJoin(join, value, false): no JoinChangeEvent', async () => {
  const { CF } = await gui();
  let fired = 0;
  CF.watch(CF.JoinChangeEvent, 's1', () => fired++);
  CF.setJoin('s1', 'Living Room', false);
  await tick();
  assert.equal(fired, 0);
  assert.equal(await value(CF, 's1'), 'Living Room');
  CF.setJoin('s1', 'Kitchen');
  await tick();
  assert.equal(fired, 1);
});

// ── CF.setJoins ──────────────────────────────────────────────────

test("setJoins: the docs' example - in order (a3 is a1 + a2 just set: 28), tokens, a token only, global tokens", async () => {
  const { CF } = await gui();
  const count = 5;
  CF.setJoins([
    { join: 's1', value: 'Hello, world!' },
    { join: 'a1', value: 18 },
    { join: 'a2', value: 10, tokens: { '[count]': count, max: 18 } },
    { join: 'a3', value: '{{[@a1] + [@a2]}}' },
    { join: 's5', tokens: { albumID: '43ABF998D' } },
    { join: CF.GlobalTokensJoin, tokens: { '[current-zone]': 'Living Room' } },
  ]);
  assert.equal(await value(CF, 's1'), 'Hello, world!');
  assert.equal(await value(CF, 'a1'), '18');
  const [, a2, a2tokens] = await getJoin(CF, 'a2');
  assert.equal(a2, '10');
  assert.deepEqual(a2tokens, { '[count]': '5', max: '18' });
  assert.equal(await value(CF, 'a3'), '28');
  const [, s5, s5tokens] = await getJoin(CF, 's5');
  assert.deepEqual([s5, s5tokens], ['', { albumID: '43ABF998D' }]);
  assert.equal((await getJoin(CF, CF.GlobalTokensJoin))[2]!['[current-zone]'], 'Living Room');
});

test('setJoins: a value of null is no value (the join is left as it is), tokens of null none; false: no JoinChangeEvent', async () => {
  const { CF } = await gui();
  CF.setJoin('s2', 'kept');
  let fired = 0;
  CF.watch(CF.JoinChangeEvent, ['s2', 's3'], () => fired++);
  CF.setJoins([{ join: 's2', value: null, tokens: { x: 1 } }, { join: 's3', value: 'v', tokens: null }], false);
  await tick();
  assert.equal(fired, 0);
  const [, s2, s2tokens] = await getJoin(CF, 's2');
  assert.deepEqual([s2, s2tokens], ['kept', { x: '1' }]);
  assert.equal(await value(CF, 's3'), 'v');
});

test("setJoins: an item's `properties` (4.0.6) set its join's objects' properties, as setProperties does", async () => {
  const { CF, renderer } = await gui();
  CF.setJoins([{ join: 's1', value: 'moved', properties: { x: 50, opacity: 0.5 } }, { join: 'd1', properties: { scale: 2 } }]);
  assert.equal(await value(CF, 's1'), 'moved');
  const p = await props(CF, 's1');
  assert.deepEqual([p.x, p.opacity], [50, 0.5]);
  assert.equal((await props(CF, 'd1')).scale, 2);
  const el = renderer.nodesMap['s1'][0];
  assert.deepEqual([el.x - el.pivot.x, el.alpha], [50, 0.5], 'the element on screen moved and faded');
});

// ── CF.listAdd / CF.listUpdate with properties ───────────────────

test("listAdd: an item's `properties` (4.0.6) - per join of its subpage, what setProperties takes - set its elements; not a join of the item (listContents); listUpdate too; kept with the item as others come and go", async () => {
  const { CF, renderer } = await runGui(GUI, { tokens: TOKENS, themes: `<theme type="text" name=".t2"><![CDATA[color: #FF0000; font-size: 14px; font-family: 'Arial';]]></theme>` });
  CF.listAdd('l1', [{ s1: 'a', properties: { s1: { x: 20, opacity: 0.5 } } }, { s1: 'b' }]);
  const first = await props(CF, 'l1:0:s1');
  assert.deepEqual([first.x, first.opacity, first.theme], [20, 0.5, 't']);
  assert.deepEqual([(await props(CF, 'l1:1:s1')).x, (await props(CF, 'l1:1:s1')).opacity], [0, 1]);
  const el = renderer.nodesMap['l1:0:s1'][0];
  assert.deepEqual([el.x - el.pivot.x, el.alpha], [20, 0.5], 'the row on screen moved and faded');
  const [items] = await answer<[any[]]>((cb) => CF.listContents('l1', 0, 0, cb));
  assert.deepEqual(items, [{ s1: { value: 'a', tokens: {} } }, { s1: { value: 'b', tokens: {} } }]);
  // setProperties' own change objects do too; a theme per join
  CF.listUpdate('l1', [{ index: 1, properties: [{ join: 's1', theme: 't2', zrotation: 90 }] }]);
  const second = await props(CF, 'l1:1:s1');
  assert.deepEqual([second.theme, second.zrotation], ['t2', 90]);
  assert.equal((renderer.nodesMap['l1:1:s1'].filter((c: any) => !c.destroyed).at(-1) as any).cfNode.t, 't2', 'the row made again in that theme');
  // an item added at the top: the properties stay with their items
  CF.listAdd('l1', [{ s1: 'top' }], CF.TopPosition);
  assert.equal((await props(CF, 'l1:0:s1')).x, 0);
  assert.equal((await props(CF, 'l1:1:s1')).x, 20);
  assert.equal((await props(CF, 'l1:2:s1')).theme, 't2');
  CF.listRemove('l1', 0, 1);
  assert.equal((await props(CF, 'l1:0:s1')).x, 20);
  assert.equal((await props(CF, 'l1:1:s1')).theme, 't2');
});

// ── CF.setToken ──────────────────────────────────────────────────

test("setToken: the docs' examples - values become strings; global; a list item's join", async () => {
  const { CF } = await gui();
  CF.setToken('s1', 'count', 1);
  assert.deepEqual((await getJoin(CF, 's1'))[2], { count: '1' });
  CF.setToken(CF.GlobalTokensJoin, '[current-zone]', 'Living Room');
  assert.equal((await getJoin(CF, CF.GlobalTokensJoin))[2]!['[current-zone]'], 'Living Room');
  CF.listAdd('l1', [{ s1: 'a' }, { s1: 'b' }, { s1: 'c' }]);
  CF.setToken('l1:2:s1', 'display', 'TV');
  assert.deepEqual((await getJoin(CF, 'l1:2:s1'))[2], { display: 'TV' });
});

test('setToken: a token goes through what a value does - join references and math', async () => {
  const { CF } = await gui();
  CF.setJoin('a1', 20);
  CF.setJoin('s1', 'Hall');
  CF.setToken('s2', 'half', '{{[@a1] / 2}}');
  CF.setToken('s2', 'where', 'in [@s1]');
  assert.deepEqual((await getJoin(CF, 's2'))[2], { half: '10', where: 'in Hall' });
});

// ── CF.addTag / CF.removeTag ─────────────────────────────────────

test("addTag / removeTag: the docs' examples - a tag once however often added, objects grouped by it, setProperties by tag; removed from one, some, all", async () => {
  const { CF } = await gui();
  CF.addTag('a1', 'vol_level');
  CF.addTag('a1', 'vol_level');
  assert.deepEqual((await getJoin(CF, 'a1'))[3], ['vol_level']);
  CF.addTag(['d1', 's2', 'a2'], 'group1');
  CF.setProperties({ join: 'group1', opacity: 0 });
  const after = await props(CF, ['d1', 's2', 'a2', 's3']);
  assert.deepEqual(after.map((p: any) => p.opacity), [0, 0, 0, 1]);
  CF.removeTag('d1', 'group1');
  assert.deepEqual((await getJoin(CF, 'd1'))[3], []);
  CF.removeTag(['s2'], 'group1');
  assert.deepEqual((await getJoin(CF, 's2'))[3], []);
  assert.deepEqual((await getJoin(CF, 'a2'))[3], ['group1']);
  CF.removeTag('group1');
  assert.deepEqual((await getJoin(CF, 'a2'))[3], []);
  // gone: setting by it changes nothing
  CF.setProperties({ join: 'group1', opacity: 0.5 });
  assert.equal((await props(CF, 'a2')).opacity, 0);
});

// ── CF.getProperties / CF.setProperties ──────────────────────────

test("getProperties: an element's join, x, y, w, h, rotations, scale, opacity and theme; none there (or join 0): null; an array: an array", async () => {
  const { CF } = await gui();
  const p = await props(CF, 's1');
  const { join, x, y, w, h, xrotation, yrotation, zrotation, scale, opacity, theme } = p;
  assert.deepEqual({ join, x, y, w, h, xrotation, yrotation, zrotation, scale, opacity, theme },
    { join: 's1', x: 10, y: 20, w: 100, h: 30, xrotation: 0, yrotation: 0, zrotation: 0, scale: 1, opacity: 1, theme: 't' });
  assert.equal(await props(CF, 's999'), null);
  assert.equal(await props(CF, 'd0'), null);
  const many = await props(CF, ['d1', 'd4', 's1']);
  assert.deepEqual(many.map((o: any) => o.join), ['d1', 'd4', 's1']);
});

test("getProperties: a list item's element (l1:0:s1)", async () => {
  const { CF } = await gui();
  CF.listAdd('l1', [{ s1: 'a' }, { s1: 'b' }]);
  const p = await props(CF, 'l1:1:s1');
  assert.deepEqual([p.join, p.w, p.h], ['l1:1:s1', 180, 25]);
});

test("setProperties: what getProperties gave, changed and given back; an array at once; the callback gets the parameters after it", async () => {
  const { CF } = await gui();
  const p = await props(CF, 's1');
  p.x = 50;
  CF.setProperties(p);
  assert.equal((await props(CF, 's1')).x, 50);
  CF.setProperties([{ join: 's1', opacity: 0.5 }, { join: 'd1', scale: 2 }]);
  assert.equal((await props(CF, 's1')).opacity, 0.5);
  assert.equal((await props(CF, 'd1')).scale, 2);
  const got = await answer((cb) => CF.setProperties({ join: 's1', y: 5 }, 0, 0, CF.AnimationCurveLinear, cb, 's1', 2));
  assert.deepEqual(got, ['s1', 2]);
});

// ── CF.getGuiDescription ─────────────────────────────────────────

test("getGuiDescription: the GUI's name, URL, sizes, every join, its pages' and subpages' objects as the docs describe them", async () => {
  const { CF } = await gui();
  const [d] = await answer<[any]>((cb) => CF.getGuiDescription(cb));
  assert.equal(d.name, 'T');
  assert.equal(d.url, CF.guiURL);
  assert.deepEqual([d.portraitSize, d.landscapeSize], [{ w: 400, h: 300 }, { w: 400, h: 300 }]);
  for (const j of ['s1', 'd1', 's6', 's7', 'a1', 'd20', 'a12', 'd30', 's40', 'd31', 's41', 's42', 'd32', 'd35', 'd36', 'd37', 'l1', 's50', 's60', 'd10', 'd11']) {
    assert.ok(d.allJoins.includes(j), `allJoins: ${j}`);
  }
  assert.equal(new Set(d.allJoins).size, d.allJoins.length, 'each once');
  assert.deepEqual(d.pages.map((p: any) => [p.name, p.join, p.type, p.portraitObjects.length]), [['Main', 'd10', 'Page', 0], ['Other', 'd11', 'Page', 0]]);
  const objs = d.pages[0].landscapeObjects;
  const of = (join: string, type: string) => objs.find((o: any) => o.join === join && o.type === type);
  assert.deepEqual(of('s1', 'Label'), { join: 's1', type: 'Label', digitalJoin: '' });
  assert.deepEqual(of('d1', 'Button'), { join: 'd1', type: 'Button', digitalJoin: '', activeTextJoin: 's7', inactiveTextJoin: 's6' });
  assert.deepEqual(of('d4', 'Button'), { join: 'd4', type: 'Button', digitalJoin: '', activeTextJoin: '', inactiveTextJoin: '' });
  assert.deepEqual(of('a1', 'Slider'), { join: 'a1', type: 'Slider', digitalJoin: '', pressedJoin: 'd20' });
  assert.deepEqual(of('a2', 'Slider'), { join: 'a2', type: 'Slider', digitalJoin: '', pressedJoin: '' });
  assert.deepEqual(of('a12', 'Gauge'), { join: 'a12', type: 'Gauge', digitalJoin: '' });
  assert.deepEqual(of('d30', 'SubpageRef'), { join: 'd30', type: 'SubpageRef', digitalJoin: '', subpage: 'Card' });
  assert.deepEqual(of('s40', 'Input'), { join: 's40', type: 'Input', digitalJoin: 'd31' });
  assert.deepEqual(of('s41', 'Webview'), {
    join: 's41', type: 'Webview', digitalJoin: '', backTriggerJoin: 'd32', forwardTriggerJoin: 'd33', refreshTriggerJoin: 'd34', stopTriggerJoin: 'd35',
  });
  assert.deepEqual(of('', 'Video'), { join: '', type: 'Video', digitalJoin: '', playTriggerJoin: 'd36', stopTriggerJoin: 'd37' });
  assert.deepEqual(of('l1', 'List'), { join: 'l1', type: 'List', digitalJoin: '' });
  assert.deepEqual(d.subpages.map((s: any) => [s.name, s.type, s.objects.map((o: any) => o.join)]), [['Card', 'Subpage', ['s50']], ['Row', 'Subpage', ['s1']]]);
});

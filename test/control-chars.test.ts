/**
 * Control characters in what a project gives (a command's data built in JS, a text): a .gui that reads back
 * as given - a command's in iViewer's \xNN notation, a CR in other text as &#13; (XML reads a raw one as LF),
 * and one XML can't hold at all an error, not a .gui that doesn't load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { compile, IvaError } from '../src/compiler/index.ts';
import { el, serialize } from '../src/compiler/xml.ts';
import { tmpDir } from './tmp.ts';

async function build(jsx: string) {
  const dir = tmpDir('iva-ctl-');
  fs.writeFileSync(path.join(dir, 'app.jsx'), jsx);
  return compile(path.join(dir, 'app.jsx'));
}

const wrap = (body: string, systems = '') => `export default (
  <Project name="T" width={1024} height={768}>${systems}
    <Page name="Main">${body}</Page>
  </Project>
);`;

/** characters XML 1.0 has no way to write */
const NOT_XML = /[\x00-\x08\x0B\x0C\x0E-\x1F]/;

test("a command's data with control characters (send={'\\x02PWR\\r'}, a template literal's \\r): iViewer's \\xNN notation", async () => {
  const r = await build(wrap('', `
    <System name="AV" host="10.0.0.5" port={23}>
      <Command name="Power" send={'\\x02PWR\\r'} />
      <Command name="Vol" send={\`MV50\\r\\n\`} />
      <Command name="Tab">{'a\\tb'}</Command>
    </System>`));
  assert.doesNotMatch(r.xml, NOT_XML);
  const doc = new DOMParser().parseFromString(r.xml, 'text/xml');
  const cmd = (name: string) => Array.from(doc.getElementsByTagName('cmd')).find((c) => c.getAttribute('name') === name)!.textContent;
  assert.equal(cmd('Power'), '\\x02PWR\\x0D');
  assert.equal(cmd('Vol'), 'MV50\\x0D\\x0A');
  assert.equal(cmd('Tab'), 'a\\x09b');
});

test('a CR in a text: &#13;, read back as a CR (not the LF XML makes of a raw one)', async () => {
  const r = await build(wrap(`<Text w={100} h={30} text={'a\\rb'} /><Button y={40} w={100} h={40} text={'on\\r\\noff'} />`));
  assert.match(r.xml, />a&#13;b<\/txt>/);
  const doc = new DOMParser().parseFromString(r.xml, 'text/xml');
  assert.equal(doc.getElementsByTagName('txt')[0].textContent, 'a\rb');
  assert.equal(doc.getElementsByTagName('inactive')[0].textContent, 'on\r\noff');
  assert.equal(serialize(el('x', {}, [], '1\r2')).split('\r\n')[1], '<x>1&#13;2</x>');
});

test('a control character XML can\'t hold in a text or an attribute: an error at the element, no .gui', async () => {
  const rejects = (jsx: string, pattern: RegExp) => assert.rejects(build(jsx), (e: any) => {
    assert.ok(e instanceof IvaError, `not an IvaError: ${e}`);
    assert.match(e.message, pattern);
    assert.match(e.file ?? '', /app\.jsx$/);
    return true;
  });
  await rejects(wrap(`<Button w={100} h={40} text={'\\x01'} />`), /<Button>: text: .*control character \\x01/);
  await rejects(wrap(`<Text w={100} h={30} text={'ok\\x1b[0m'} />`), /<Text>: text: .*control character \\x1B/);
  await rejects(wrap(`<Button w={100} h={40} js={'CF.send("AV", "\\x03")'} />`), /<Button>: js: .*control character \\x03/);
  await rejects(wrap('', `<System name="AV" host="10.0.0.5" port={23} eom={'\\x03'} />`), /<System>: eom: .*control character \\x03/);
  await rejects(wrap('', `<System name="AV" host="10.0.0.5" port={23}><Feedback name="f" regex="(.)"><Capture join="d1" onVal={'\\x01'} /></Feedback></System>`),
    /<Capture>: onVal: .*control character \\x01/);
  await rejects(wrap(`<Button w={100} h={40} xml={{ cmd: 'a\\x07' }} />`), /<Button>: cmd: .*control character \\x07/);
});

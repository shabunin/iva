import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatLocation, History, isGuiUrl, parseLocation } from '../src/runtime/location.ts';

test('parseLocation: a GUI and its page from the forms the address bar and GUI links take', () => {
  // ?page=: the form the address bar shows; the rest of the query stays the GUI's
  assert.deepEqual(parseLocation('http://192.168.1.10:8019/panel.gui?page=Home'), { gui: 'http://192.168.1.10:8019/panel.gui', page: 'Home' });
  assert.deepEqual(parseLocation('http://host/x.gui?page=Lights Page'), { gui: 'http://host/x.gui', page: 'Lights Page' });
  assert.deepEqual(parseLocation('http://host/x.gui?page=Lights+Page&v=2'), { gui: 'http://host/x.gui?v=2', page: 'Lights Page' });
  assert.deepEqual(parseLocation('http://10.0.0.7:8019/?page=Settings'), { gui: 'http://10.0.0.7:8019/', page: 'Settings' });
  // the page after the file, or a fragment: read too
  assert.deepEqual(parseLocation('cf://192.168.1.10:8019/panel.gui/Home'), { gui: 'http://192.168.1.10:8019/panel.gui', page: 'Home' });
  assert.deepEqual(parseLocation('http://host/a/x.gui.zip/Lights%20Page'), { gui: 'http://host/a/x.gui.zip', page: 'Lights Page' });
  assert.deepEqual(parseLocation('http://10.0.0.7:8019/#Settings'), { gui: 'http://10.0.0.7:8019/', page: 'Settings' });
  assert.deepEqual(parseLocation('http://host/x.gui#Main'), { gui: 'http://host/x.gui', page: 'Main' });
  // several given: ?page= over the path over the fragment
  assert.deepEqual(parseLocation('http://host/x.gui/Pool?v=2#Main'), { gui: 'http://host/x.gui?v=2', page: 'Pool' });
  assert.deepEqual(parseLocation('http://host/x.gui/Pool?page=Spa#Main'), { gui: 'http://host/x.gui', page: 'Spa' });
  // a bare address
  assert.deepEqual(parseLocation('192.168.1.10:8019'), { gui: 'http://192.168.1.10:8019/', page: undefined });
  assert.deepEqual(parseLocation('  panel.local/x.gui  '), { gui: 'http://panel.local/x.gui', page: undefined });
  // nothing
  assert.equal(parseLocation('   '), null);
  assert.equal(parseLocation('http://[bad'), null);
});

test('parseLocation: links relative to the GUI they are in (CF.loadGUI, href="cf://...")', () => {
  const from = 'http://10.0.0.7:8019/guis/a.gui';
  assert.deepEqual(parseLocation('other.gui', from), { gui: 'http://10.0.0.7:8019/guis/other.gui', page: undefined });
  assert.deepEqual(parseLocation('other.gui?page=Home', from), { gui: 'http://10.0.0.7:8019/guis/other.gui', page: 'Home' });
  assert.deepEqual(parseLocation('../b.gui.zip/Home', from), { gui: 'http://10.0.0.7:8019/b.gui.zip', page: 'Home' });
  assert.deepEqual(parseLocation('/root.gui', from), { gui: 'http://10.0.0.7:8019/root.gui', page: undefined });
  assert.deepEqual(parseLocation('pages/c.gui', from), { gui: 'http://10.0.0.7:8019/guis/pages/c.gui', page: undefined });
  // an address with a port or a dot is a host, even from a GUI
  assert.deepEqual(parseLocation('192.168.1.20:8019', from), { gui: 'http://192.168.1.20:8019/', page: undefined });
  assert.deepEqual(parseLocation('cf://192.168.0.10:8019/gui-B.gui', from), { gui: 'http://192.168.0.10:8019/gui-B.gui', page: undefined });
});

test('formatLocation: the GUI with ?page=; parseLocation reads it back', () => {
  for (const loc of [
    { gui: 'http://host/x.gui', page: 'Lights Page' },
    { gui: 'http://host/x.gui.zip', page: 'Home' },
    { gui: 'http://10.0.0.7:8019/', page: 'Settings' },
    { gui: 'http://host/x.gui?v=2', page: 'Pool' },
    { gui: 'http://host/x.gui' },
  ]) {
    const text = formatLocation(loc);
    assert.deepEqual(parseLocation(text), { gui: loc.gui, page: loc.page }, text);
  }
  assert.equal(formatLocation({ gui: 'http://host/x.gui', page: 'Lights Page' }), 'http://host/x.gui?page=Lights+Page');
  assert.equal(formatLocation({ gui: 'http://10.0.0.7:8019/', page: 'Settings' }), 'http://10.0.0.7:8019/?page=Settings');
  assert.equal(formatLocation({ gui: 'http://host/x.gui?v=2', page: 'Pool' }), 'http://host/x.gui?v=2&page=Pool');
});

test('isGuiUrl: GUI links and files are GUIs, web pages are not', () => {
  for (const u of ['cf://h/x.gui', 'http://h/x.gui', 'https://h/a/b.gui.zip?page=Home', 'http://h/x.zip', 'http://10.0.0.7:8019/', 'http://10.0.0.7:8019']) assert.ok(isGuiUrl(u), u);
  for (const u of ['http://example.com/', 'https://h/page.html', 'tel:+123', 'mailto:a@b.c', 'http://10.0.0.7:8080/']) assert.ok(!isGuiUrl(u), u);
});

test('History: arrive, back, forward, the page of the entry it is at; kept in a store', () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const h = new History(store);
  assert.equal(h.current(), null);
  assert.equal(h.back(), null);
  h.arrive({ gui: 'http://a/a.gui' });
  h.arrive({ gui: 'http://b/b.gui', page: 'Home' });
  h.page('Pool');
  assert.deepEqual(h.current(), { gui: 'http://b/b.gui', page: 'Pool' });
  assert.ok(h.canBack() && !h.canForward());
  assert.deepEqual(h.back(), { gui: 'http://a/a.gui' });
  // the same GUI arrived at again (the reload that follows a back): the entry stays, its page updated
  h.arrive({ gui: 'http://a/a.gui', page: 'Main' });
  assert.ok(h.canForward());
  assert.deepEqual(h.forward(), { gui: 'http://b/b.gui', page: 'Pool' });
  assert.equal(h.forward(), null);
  // a new GUI from the middle: what was ahead goes
  h.back();
  h.arrive({ gui: 'http://c/c.gui' });
  assert.ok(!h.canForward());
  assert.deepEqual(h.entries().map((e) => e.gui), ['http://a/a.gui', 'http://c/c.gui']);
  assert.deepEqual(new History(store).current(), { gui: 'http://c/c.gui' });
  assert.deepEqual(new History(store).back(), { gui: 'http://a/a.gui', page: 'Main' });
});

test('isGuiUrl: a link relative to the GUI it is in', () => {
  const from = 'http://10.0.0.7:8019/guis/a.gui';
  assert.ok(isGuiUrl('other.gui', from));
  assert.ok(isGuiUrl('../lights/Lights.gui?page=Kitchen', from));
  assert.ok(!isGuiUrl('page.html', from));
  assert.ok(!isGuiUrl('https://www.commandfusion.com/', from));
});

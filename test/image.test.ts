import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Sprite, Texture, TextureSource, Graphics } from 'pixi.js';
import { renderImage, imageCache, type ImageIo } from '../src/runtime/cf/components/Image.ts';
import { joinStore } from '../src/runtime/cf/joinStore.ts';

/** a page shown, an image's container on it, and what it downloads */
function stage(attributes: Record<string, string>, j = '0', content?: string) {
  const app = { stage: new Container(), ticker: { add() {}, remove() {} } };
  const page = app.stage.addChild(new Container());
  const renderer = { app, currentContainer: page, cfApi: { suspended: false }, currentScope: null, texture: () => undefined } as any;
  const container = page.addChild(new Container());
  const downloads: [string, boolean][] = [];
  const made: Texture[] = [];
  const gate: { hold?: Promise<void> } = {};
  const io: ImageIo = {
    async download(url, fresh) {
      downloads.push([url, fresh]);
      await gate.hold;
      return new Blob([url]);
    },
    async decode() {
      const t = new Texture({ source: new TextureSource({ width: 40 + made.length * 10, height: 30 }) });
      made.push(t);
      return t;
    },
  };
  const node = { type: 'img', x: 0, y: 0, w: 160, h: 120, j, content, attributes, children: [] } as any;
  renderImage(node, container, renderer, io);
  const sprite = () => container.children.find((c) => c instanceof Sprite) as Sprite | undefined;
  const spinner = () => container.children.find((c) => c instanceof Graphics);
  return { renderer, page, container, downloads, made, gate, sprite, spinner };
}

/** what's under way done (downloads, decodes) */
const settle = () => new Promise((r) => setImmediate(r));

test('a URL image: downloaded, at its size; another URL replaces it once in, the picture before dropped', async () => {
  imageCache.clear();
  const s = stage({ refresh: '0', noCache: '0', downloadIndicator: '0', clearOnURLChange: '0' }, '41');
  joinStore.set('41', 's', 'http://cam/a.jpg');
  await settle();
  assert.deepEqual(s.downloads, [['http://cam/a.jpg', false]]);
  assert.equal(s.sprite()!.texture, s.made[0]);
  assert.equal(Math.round(s.sprite()!.width), 160);
  // the next one: the old picture stays till it's in
  let open!: () => void;
  s.gate.hold = new Promise((r) => (open = r));
  joinStore.set('41', 's', 'http://cam/b.jpg');
  await settle();
  assert.equal(s.sprite()!.texture, s.made[0]);
  assert.equal(s.sprite()!.visible, true);
  open();
  await settle();
  assert.equal(s.sprite()!.texture, s.made[1]);
  // its size whatever the picture's
  assert.equal(Math.round(s.sprite()!.width), 160);
  assert.equal(s.made[0].destroyed, true);
  // empty: no picture
  joinStore.set('41', 's', '');
  assert.equal(s.sprite()!.visible, false);
  s.container.destroy({ children: true });
  assert.equal(s.made[1].destroyed, true);
});

test('Clear Image On URL Change: the picture goes at once; the indicator shows till the new one is in', async () => {
  imageCache.clear();
  const s = stage({ refresh: '0', noCache: '0', downloadIndicator: '1', clearOnURLChange: '1' }, '42');
  joinStore.set('42', 's', 'http://cam/c.jpg');
  assert.ok(s.spinner(), 'spinning while it comes');
  await settle();
  assert.equal(s.spinner(), undefined);
  let open!: () => void;
  s.gate.hold = new Promise((r) => (open = r));
  joinStore.set('42', 's', 'http://cam/d.jpg');
  assert.equal(s.sprite()!.visible, false);
  assert.ok(s.spinner());
  open();
  await settle();
  assert.equal(s.sprite()!.visible, true);
  assert.equal(s.spinner(), undefined);
  s.container.destroy({ children: true });
});

test('refresh: loaded again past the cache while it shows - not while hidden or asleep; no indicator for those', async () => {
  imageCache.clear();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = stage({ refresh: '500', noCache: '0', downloadIndicator: '1', clearOnURLChange: '0' }, '0', 'http://cam/snap.jpg');
    await settle();
    assert.deepEqual(s.downloads, [['http://cam/snap.jpg', false]]);
    mock.timers.tick(500);
    assert.equal(s.spinner(), undefined, 'the picture there: no indicator');
    await settle();
    assert.deepEqual(s.downloads.at(-1), ['http://cam/snap.jpg', true]);
    assert.equal(s.sprite()!.texture, s.made[1]);
    assert.equal(s.made[0].destroyed, true);
    // asleep: none
    s.renderer.cfApi.suspended = true;
    mock.timers.tick(500);
    await settle();
    mock.timers.tick(500);
    await settle();
    assert.equal(s.downloads.length, 2);
    s.renderer.cfApi.suspended = false;
    // another page shown: none
    s.renderer.currentContainer = new Container();
    mock.timers.tick(500);
    await settle();
    assert.equal(s.downloads.length, 2);
    s.renderer.currentContainer = s.page;
    mock.timers.tick(500);
    await settle();
    assert.equal(s.downloads.length, 3);
    // gone: no more
    s.container.destroy({ children: true });
    mock.timers.tick(5000);
    await settle();
    assert.equal(s.downloads.length, 3);
  } finally {
    mock.timers.reset();
  }
});

test('Allow Caching: a URL shown before is not downloaded again; with it off (noCache) it is, past caches', async () => {
  imageCache.clear();
  const a = stage({ refresh: '0', noCache: '0', downloadIndicator: '0', clearOnURLChange: '0' }, '0', 'http://nas/art.jpg');
  await settle();
  const b = stage({ refresh: '0', noCache: '0', downloadIndicator: '0', clearOnURLChange: '0' }, '0', 'http://nas/art.jpg');
  await settle();
  assert.equal(a.downloads.length, 1);
  assert.equal(b.downloads.length, 0);
  assert.ok(b.sprite());
  const c = stage({ refresh: '0', noCache: '1', downloadIndicator: '0', clearOnURLChange: '0' }, '0', 'http://nas/art.jpg');
  await settle();
  assert.deepEqual(c.downloads, [['http://nas/art.jpg', true]]);
});

/**
 * A refreshing image (a camera's snapshots) whose download never ends - the
 * camera stalled, a request left hanging: given up after a while (4 refreshes,
 * 10 s at least), and the next snapshot tried; the time it may take told to
 * the download (the host's connection timeout, the fetch's).
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Container, Texture, TextureSource } from 'pixi.js';
import { renderImage, imageCache, type ImageIo } from '../src/runtime/cf/components/Image.ts';

/** what's under way done (downloads, decodes) */
const settle = () => new Promise((r) => setImmediate(r));

test("a refreshing image's download that never ends: given up, the next snapshot tried", async () => {
  imageCache.clear();
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const app = { stage: new Container(), ticker: { add() {}, remove() {} } };
    const page = app.stage.addChild(new Container());
    const renderer = { app, currentContainer: page, cfApi: { suspended: false }, currentScope: null, texture: () => undefined } as any;
    const container = page.addChild(new Container());
    const downloads: [string, boolean, number | undefined][] = [];
    let hang = false;
    const io: ImageIo = {
      download(url, fresh, timeout) {
        downloads.push([url, fresh, timeout]);
        return hang ? new Promise<Blob>(() => {}) : Promise.resolve(new Blob([url]));
      },
      async decode() {
        return new Texture({ source: new TextureSource({ width: 40, height: 30 }) });
      },
    };
    const node = { type: 'img', x: 0, y: 0, w: 160, h: 120, j: '0', content: 'http://cam/snap.jpg', attributes: { refresh: '500', noCache: '0', downloadIndicator: '1', clearOnURLChange: '0' }, children: [] } as any;
    renderImage(node, container, renderer, io);
    await settle();
    assert.deepEqual(downloads, [['http://cam/snap.jpg', false, 10000]]);
    // the camera stalls: this one never comes
    hang = true;
    mock.timers.tick(500);
    await settle();
    assert.equal(downloads.length, 2);
    mock.timers.tick(9999);
    await settle();
    assert.equal(downloads.length, 2, 'waited for it');
    // given up: the next one tried, a refresh later
    hang = false;
    mock.timers.tick(1);
    await settle();
    assert.equal(downloads.length, 2);
    mock.timers.tick(500);
    await settle();
    assert.equal(downloads.length, 3);
    container.destroy({ children: true });
  } finally {
    mock.timers.reset();
  }
});

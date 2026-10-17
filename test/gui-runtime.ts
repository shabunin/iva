/**
 * A GUI (.gui XML) run by iva's runtime in Node, as the panel runs it - its
 * pages built by the renderer, its CF object global - for tests of what a
 * script sees. No drawing: text is measured by a stand-in canvas (a width
 * per character), nothing is rendered.
 */
import { DOMParser, parseHTML } from 'linkedom';
import { Container } from 'pixi.js';

const { document } = parseHTML('<!doctype html><html><head></head><body></body></html>');
const ctx2d = {
  font: '',
  letterSpacing: '0px',
  textLetterSpacing: '0px',
  measureText: (t: string) => ({ width: String(t).length * 7, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }),
  fillText() {},
  strokeText() {},
  clearRect() {},
  fillRect() {},
  save() {},
  restore() {},
  scale() {},
  setTransform() {},
  resetTransform() {},
  drawImage() {},
  getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
};
const createElement = document.createElement.bind(document);
(document as any).createElement = (tag: string) =>
  tag === 'canvas' ? { width: 1, height: 1, style: {}, getContext: () => ctx2d, addEventListener() {}, removeEventListener() {} } : createElement(tag);
const g = globalThis as any;
g.document ??= document;
g.window ??= globalThis;
g.DOMParser ??= DOMParser;
g.devicePixelRatio ??= 1;
// what Pixi asks of the canvas's 2D context (letter spacing support: none here)
g.CanvasRenderingContext2D ??= class {};
// frames: as timers (nothing is drawn) that don't keep the test running
g.requestAnimationFrame ??= (fn: (t: number) => void) => setTimeout(() => fn(performance.now()), 16).unref() as unknown as number;
g.cancelAnimationFrame ??= (id: number) => clearTimeout(id);

/** The GUI's pages in a 400 x 300 landscape (its tokens, themes and systems as given - the systems not started): its CF, its renderer, on its start page. */
export async function runGui(body: string, { tokens = '', themes = '', systems = '' } = {}) {
  const { parseGUI } = await import('../src/runtime/cf/parser.ts');
  const { CFRenderer } = await import('../src/runtime/cf/renderer.ts');
  const { CFAPI } = await import('../src/runtime/cf/cf.ts');
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<gui>
  <properties><project>T</project><designer>iva</designer>
    <size autoposition="scale"><portrait width="400" height="300" /><landscape width="400" height="300" /></size>
    <imagefolder></imagefolder><debug loaderrors="0" connectionerrors="0" /></properties>
  <systems>${systems}</systems>
  <themes>
    <theme type="text" name=".t"><![CDATA[color: #FFFFFF; font-size: 14px; font-family: 'Arial';]]></theme>
    <theme type="button" name=".b[state='0']"><![CDATA[background-color: #333333;]]></theme>
    <theme type="button" name=".b[state='1']"><![CDATA[background-color: #00AA00;]]></theme>
    ${themes}
  </themes>
  <tokens>${tokens}</tokens>
  <scripts />
  ${body}
</gui>`;
  const project = await parseGUI(xml);
  const app: any = {
    stage: new Container(), screen: { width: 400, height: 300 }, canvas: document.createElement('div'),
    renderer: { resize() {}, render() {}, background: { alpha: 1 } }, ticker: { add() {}, remove() {}, FPS: 60 },
  };
  const renderer = new CFRenderer(app, project, {});
  CFAPI.makeGlobal(renderer);
  const CF = g.CF as InstanceType<typeof CFAPI>;
  renderer.cfApi = CF;
  await renderer.start();
  return { CF, renderer, app, project };
}

/** a callback API's answer, as a promise */
export const answer = <T extends unknown[]>(call: (cb: (...a: T) => void) => void) => new Promise<T>((resolve) => call((...a) => resolve(a)));

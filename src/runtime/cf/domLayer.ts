import { Container, Graphics, Point, Rectangle, UPDATE_PRIORITY } from 'pixi.js';
import type { CFRenderer } from './renderer';

/**
 * Real DOM elements (web views as <iframe>, the input field being edited as
 * <input>) laid over the Pixi canvas, each following its node's container:
 * position, scale, rotation, opacity, visibility, list clipping.
 *
 * Two places to be:
 * - under the canvas (web views): the node erases a hole in the canvas where
 *   it is, so whatever the GUI draws later (an image over a web view, a popup)
 *   still covers the element, as on a device. The canvas lets the pointer
 *   through while it is over the element's uncovered part. This needs a
 *   canvas that can be transparent (backgroundAlpha < 1); with an opaque one
 *   these elements go on top too.
 * - on top of the canvas (`over`): no hole, nothing covers it (an input
 *   field while it is being edited: what's under it stays visible).
 */

export interface DomItem {
  el: HTMLElement;
  /** the node's container: its box is (0, 0, w, h) in local coordinates */
  container: Container;
  w: number;
  h: number;
  /** on top of the canvas rather than under it */
  over?: boolean;
  /** shown at all (default true): an item can stay registered while off */
  enabled?: boolean;
  /** called once the container is gone and the element removed */
  dispose?: () => void;
}

const layers = new WeakMap<object, DomLayer>();

/** Node types that take touches in front of a web view. */
const BLOCKING = new Set(['btn', 'slider', 'list', 'subpage', 'input', 'web', 'video']);

export class DomLayer {
  /** under the canvas, seen through holes (null: the canvas can't be transparent) */
  private readonly underRoot: HTMLDivElement | null;
  private readonly overRoot: HTMLDivElement;
  private items = new Map<Container, DomItem>();
  private renderer: CFRenderer;
  private fit = { sx: 1, sy: 1, ox: 0, oy: 0 };
  private routed = false;

  /** The layer of this renderer's app (one per app; a new renderer takes it over). */
  static for(renderer: CFRenderer): DomLayer {
    let layer = layers.get(renderer.app);
    if (!layer) layers.set(renderer.app, (layer = new DomLayer(renderer)));
    else if (layer.renderer !== renderer) {
      layer.clear();
      layer.renderer = renderer;
    }
    return layer;
  }

  /** The layer, if this renderer has one. */
  static of(renderer: CFRenderer): DomLayer | undefined {
    const layer = layers.get(renderer.app);
    return layer?.renderer === renderer ? layer : undefined;
  }

  private constructor(renderer: CFRenderer) {
    this.renderer = renderer;
    const app = renderer.app;
    const canvas = app.canvas;
    const root = (z: string, background: string) => {
      const el = document.createElement('div');
      el.className = 'cf-dom-layer';
      Object.assign(el.style, {
        position: 'absolute', left: '0', top: '0', width: '0', height: '0', overflow: 'hidden',
        pointerEvents: 'none', zIndex: z, colorScheme: 'normal', background,
      } satisfies Partial<CSSStyleDeclaration>);
      return el;
    };
    // under the canvas, the layer is what transparent canvas areas show: keep them black
    this.underRoot = app.renderer.background.alpha < 1 ? root('0', '#000') : null;
    this.overRoot = root('2', 'transparent');
    const parent = canvas.parentElement;
    if (parent) {
      if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      if (this.underRoot) parent.insertBefore(this.underRoot, canvas);
      canvas.after(this.overRoot);
    }
    if (this.underRoot) {
      if (getComputedStyle(canvas).position === 'static') canvas.style.position = 'relative';
      canvas.style.zIndex = '1';
      window.addEventListener('pointermove', this.route, true);
    }
    // after Pixi has rendered the frame: world transforms are current then
    app.ticker.add(this.sync, undefined, UPDATE_PRIORITY.UTILITY);
  }

  /**
   * Lay `item.el` over `item.container`. Under the canvas, this adds the hole
   * to the container now: where it is drawn decides what covers the element.
   */
  add(item: DomItem) {
    const under = !item.over && this.underRoot;
    if (under) {
      const hole = new Graphics().rect(0, 0, item.w, item.h).fill({ color: 0xffffff });
      hole.blendMode = 'erase';
      item.container.addChild(hole);
    }
    Object.assign(item.el.style, {
      position: 'absolute', left: '0', top: '0', width: `${item.w}px`, height: `${item.h}px`,
      transformOrigin: '0 0', pointerEvents: 'auto', display: 'none', boxSizing: 'border-box', margin: '0',
    } satisfies Partial<CSSStyleDeclaration>);
    (under ? this.underRoot! : this.overRoot).appendChild(item.el);
    this.items.set(item.container, item);
  }

  /** Place the elements now (say, before focusing one just enabled). */
  update() {
    this.sync();
  }

  /** Remove every element (a new project replaces the renderer). */
  clear() {
    for (const it of this.items.values()) this.drop(it);
    this.items.clear();
    this.unroute();
  }

  destroy() {
    this.clear();
    this.renderer.app.ticker?.remove(this.sync);
    window.removeEventListener('pointermove', this.route, true);
    this.underRoot?.remove();
    this.overRoot.remove();
    layers.delete(this.renderer.app);
  }

  private drop(it: DomItem) {
    it.el.remove();
    try {
      it.dispose?.();
    } catch (e) {
      console.error('[cf dom] dispose failed:', e);
    }
  }

  /** How stage coordinates map onto the canvas box (object-fit: contain letterboxes). */
  private measure() {
    const app = this.renderer.app;
    const canvas = app.canvas;
    const W = app.screen.width || 1;
    const H = app.screen.height || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    let sx = cw / W;
    let sy = ch / H;
    let ox = 0;
    let oy = 0;
    if (getComputedStyle(canvas).objectFit === 'contain') {
      sx = sy = Math.min(sx, sy);
      ox = (cw - W * sx) / 2;
      oy = (ch - H * sy) / 2;
    }
    this.fit = { sx, sy, ox, oy };
    const box = {
      left: `${canvas.offsetLeft + canvas.clientLeft + ox}px`,
      top: `${canvas.offsetTop + canvas.clientTop + oy}px`,
      width: `${W * sx}px`,
      height: `${H * sy}px`,
    };
    if (this.underRoot) Object.assign(this.underRoot.style, box);
    Object.assign(this.overRoot.style, box);
  }

  /** Visible on the stage, and how opaque (alpha down the parents). */
  private shown(c: Container): number {
    const stage = this.renderer.app.stage;
    let alpha = 1;
    for (let p: Container | null = c; p; p = p.parent) {
      if (!p.visible || !p.renderable) return 0;
      alpha *= p.alpha;
      if (p === stage) return alpha;
    }
    return 0; // not on the stage
  }

  private sync = () => {
    const roots = [this.underRoot, this.overRoot];
    if (!this.items.size) {
      for (const r of roots) if (r) r.style.display = 'none';
      return;
    }
    for (const r of roots) if (r) r.style.display = '';
    this.measure();
    const { sx, sy } = this.fit;
    for (const it of [...this.items.values()]) {
      const c = it.container;
      if (c.destroyed) {
        this.items.delete(c);
        this.drop(it);
        continue;
      }
      const alpha = it.enabled === false ? 0 : this.shown(c);
      const st = it.el.style;
      if (alpha < 0.01) {
        if (st.display !== 'none') {
          st.display = 'none';
          if (document.activeElement === it.el) it.el.blur();
        }
        continue;
      }
      st.display = '';
      const m = c.worldTransform;
      st.transform = `matrix(${m.a * sx}, ${m.b * sy}, ${m.c * sx}, ${m.d * sy}, ${m.tx * sx}, ${m.ty * sy})`;
      st.opacity = alpha < 0.999 ? String(alpha) : '';
      st.clipPath = this.clipOf(c, it);
    }
  };

  /** Clipping by masked parents (a list's viewport), as an inset of the element's own box. */
  private clipOf(c: Container, it: DomItem): string {
    let clip: Rectangle | null = null;
    for (let p: Container | null = c.parent; p; p = p.parent) {
      const mask = p.mask;
      if (mask && mask instanceof Container) {
        const b = mask.getBounds().rectangle;
        clip = clip ? clip.fit(b) : b.clone();
      }
    }
    if (!clip) return '';
    const m = c.worldTransform;
    // axis-aligned only (rotated web views inside lists: not clipped)
    if (m.b !== 0 || m.c !== 0 || !m.a || !m.d) return '';
    const left = (clip.x - m.tx) / m.a;
    const top = (clip.y - m.ty) / m.d;
    const right = it.w - (clip.x + clip.width - m.tx) / m.a;
    const bottom = it.h - (clip.y + clip.height - m.ty) / m.d;
    if (left <= 0 && top <= 0 && right <= 0 && bottom <= 0) return '';
    return `inset(${Math.max(0, top)}px ${Math.max(0, right)}px ${Math.max(0, bottom)}px ${Math.max(0, left)}px)`;
  }

  // ── the pointer, with elements under the canvas ──────────────────

  /** Let the pointer through the canvas while it is over an element nothing covers. */
  private route = (e: PointerEvent) => {
    if (!this.items.size || e.buttons) return; // never in the middle of a drag
    const canvas = this.renderer.app.canvas;
    const r = canvas.getBoundingClientRect();
    const { sx, sy, ox, oy } = this.fit;
    const x = (e.clientX - r.left - canvas.clientLeft - ox) / sx;
    const y = (e.clientY - r.top - canvas.clientTop - oy) / sy;
    const over = this.itemAt(x, y);
    if (over && !this.routed) {
      canvas.style.pointerEvents = 'none';
      this.routed = true;
    } else if (!over && this.routed) this.unroute();
  };

  private unroute() {
    if (!this.routed) return;
    this.renderer.app.canvas.style.pointerEvents = '';
    this.routed = false;
  }

  private inside(c: Container, x: number, y: number, w: number, h: number): boolean {
    const p = c.worldTransform.applyInverse(new Point(x, y));
    return p.x >= 0 && p.y >= 0 && p.x < w && p.y < h;
  }

  private isUnder(it: DomItem | undefined): it is DomItem {
    return !!it && !it.over && it.enabled !== false && !it.container.destroyed;
  }

  /** The element under the canvas at a stage point, unless something drawn later takes the touch there. */
  private itemAt(x: number, y: number): DomItem | null {
    // cheap test first: over such an element at all?
    let any = false;
    for (const it of this.items.values()) {
      if (this.isUnder(it) && this.shown(it.container) >= 0.01 && this.inside(it.container, x, y, it.w, it.h)) {
        any = true;
        break;
      }
    }
    if (!any) return null;
    // the last thing (in drawing order) there that takes touches
    let last: Container | null = null;
    const walk = (c: Container) => {
      if (!c.visible || c.destroyed) return;
      const node = (c as any).cfNode as { type: string; attributes?: Record<string, string> } | undefined;
      if (node && c.hitArea instanceof Rectangle) {
        const blocks = this.items.has(c) || BLOCKING.has(node.type) ||
          (node.type === 'img' && node.attributes?.clickthrough !== '1');
        if (blocks && this.inside(c, x, y, c.hitArea.width, c.hitArea.height)) last = c;
      }
      for (const child of c.children) walk(child as Container);
    };
    walk(this.renderer.app.stage);
    const it = last ? this.items.get(last) : undefined;
    return this.isUnder(it) ? it : null;
  }
}

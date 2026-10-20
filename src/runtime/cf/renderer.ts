import { Application, Container, Sprite, Text, Graphics, Assets, TextStyle, Color, NineSliceSprite, Rectangle, TilingSprite, Texture, TextureSource, UPDATE_PRIORITY } from 'pixi.js';
import { ownJoin } from './guiIndex';
import { Slider, FancyButton, ScrollBox } from '@pixi/ui';
import { animate, type AnimationPlaybackControlsWithThen } from 'motion';
import { CFProject, CFNode, CFTheme, CFSubpage } from './parser';
import { joinStore, normalizeJoinString } from './joinStore';

import { renderButton } from './components/Button';
import { renderList } from './components/List';
import { renderSubpage } from './components/Subpage';
import { renderGauge } from './components/Gauge';
import { renderSlider } from './components/Slider';
import { renderImage } from './components/Image';
import { renderText } from './components/Text';
import { renderVideo } from './components/Video';
import { renderWeb } from './components/Web';
import { renderTimer } from './components/Timer';
import { renderInput } from './components/Input';
import { DomLayer } from './domLayer';
import { bindGestures } from './components/Gestures';

// Pixi containers/points aren't DOM, so there's no WAAPI/getAnimations() to lean
// on for "stop whatever is currently animating this" or "stop everything on
// teardown" — track it ourselves, same as GSAP did internally.
const activeAnimations = new Set<AnimationPlaybackControlsWithThen>();
const animsByTarget = new WeakMap<object, Set<AnimationPlaybackControlsWithThen>>();

/** CF's animation curve (CF.AnimationCurveEaseIn is "ANIMATION_CURVE_EASE_IN"; "easeIn" too) as an ease. */
export function easeOf(curve: unknown): 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' {
  const c = String(curve ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return c.endsWith('easeinout') ? 'easeInOut' : c.endsWith('easein') ? 'easeIn' : c.endsWith('easeout') ? 'easeOut' : 'linear';
}

/** a page's or subpage's transition, as the .gui gives it (GUI Designer's: fade, moveIn, push, reveal) */
export interface Transition {
  type?: string;
  /** fromLeft, fromRight, fromTop, fromBottom: where what moves comes from */
  subtype?: string;
  /** seconds */
  time?: number;
  /** easeIn, easeOut, easeInEaseOut (Ease Both), none: linear */
  ease?: string;
}

/** a transition's easing: Ease In, Ease Out, Ease Both (easeInEaseOut), else linear */
export function transitionEase(ease?: string): 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' {
  const s = (ease ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (s.includes('both') || (s.includes('easein') && s.includes('out'))) return 'easeInOut';
  if (s.includes('easein')) return 'easeIn';
  if (s.includes('out')) return 'easeOut';
  return 'linear';
}

/** where a transition's motion comes from, as a unit step (fromLeft: from the left, moving right) */
export function transitionSide(subtype?: string): { x: number; y: number } {
  const s = (subtype ?? '').toLowerCase();
  return s === 'fromright' ? { x: 1, y: 0 } : s === 'fromtop' ? { x: 0, y: -1 } : s === 'frombottom' ? { x: 0, y: 1 } : { x: -1, y: 0 };
}

/** a transition that animates (a type, a time); None, '' or 0 s: at once */
export const animates = (t?: Transition): t is Transition =>
  !!t && !!t.type && !/^none$/i.test(t.type) && (t.time ?? 0) > 0;

/**
 * The scale an element is drawn at: its own (scale / xscale / yscale) and its
 * turn about the X and Y axes (xrotation / yrotation: iViewer's 3D rotations,
 * here as seen from afar - narrowing to an edge at 90°, its back past it).
 */
export function drawnScale(scale: { x: number; y: number }, rotation: { x: number; y: number }): { x: number; y: number } {
  const rad = Math.PI / 180;
  const f = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  return { x: f(scale.x * Math.cos(rotation.y * rad)), y: f(scale.y * Math.cos(rotation.x * rad)) };
}

/** each element's guarded stand-in (animTarget): one each, so motion still sees one element - a new animation of a value replaces the running one */
const guarded = new WeakMap<object, object>();

/**
 * An element (or its .scale) as an animation's target: what the animation
 * writes once the element is destroyed is dropped. An animation still
 * running when its page went (a flip, a tab of ui.Screens) wrote into the
 * destroyed element and threw inside motion's frame loop - which then stopped
 * every animation: transitions stuck at their first step, flips never done,
 * the GUI hung.
 */
export function animTarget<T extends object>(target: T, owner: { destroyed?: boolean } = target as { destroyed?: boolean }): T {
  let stand = guarded.get(target);
  if (!stand) {
    stand = new Proxy(target, {
      set(obj, prop, value) {
        if (!owner.destroyed) Reflect.set(obj, prop, value);
        return true;
      },
    });
    guarded.set(target, stand);
  }
  return stand as T;
}

/**
 * An element's values animated by motion, from what they are now: motion
 * keeps its own idea of a value it has animated, which a direct write - an
 * instant CF.setProperties, a transition putting an element where it starts,
 * a dragged side menu - leaves stale: its next animation of that value would
 * start from there, or not move at all.
 */
export function animateFrom<T extends object>(target: T, to: Record<string, number>, options: Record<string, unknown>, owner?: { destroyed?: boolean }) {
  const keyframes: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(to)) keyframes[k] = [Number((target as Record<string, unknown>)[k]), v];
  return animate(animTarget(target, owner) as any, keyframes as any, options as any) as AnimationPlaybackControlsWithThen;
}

export function trackAnimation<T extends object>(target: T, a: AnimationPlaybackControlsWithThen) {
  activeAnimations.add(a);
  let set = animsByTarget.get(target);
  if (!set) animsByTarget.set(target, (set = new Set()));
  set.add(a);
  const untrack = () => {
    activeAnimations.delete(a);
    set!.delete(a);
  };
  a.finished.then(untrack, untrack);
  return a;
}

/** Stop whatever is currently animating this target (container, or its .scale point). */
export function killTweensOf(target: object) {
  animsByTarget.get(target)?.forEach((a) => a.stop());
  animsByTarget.delete(target);
}

/** Stop everything — call before tearing down/reloading a project. */
export function stopAllAnimations() {
  activeAnimations.forEach((a) => a.stop());
  activeAnimations.clear();
}

/**
 * A texture's pixels changed in place - a video's next frame, a canvas drawn
 * on (TextureSource.update) - which no container's change says: drawn too.
 */
let sourcesUpdated = false;
{
  const proto = TextureSource.prototype as TextureSource & { __ivaWatched?: boolean };
  if (!proto.__ivaWatched) {
    const update = proto.update;
    proto.update = function (this: TextureSource) {
      sourcesUpdated = true;
      return update.call(this);
    };
    proto.__ivaWatched = true;
  }
}

/** a frame drawn: what changed in place, taken in */
function drewSources() {
  sourcesUpdated = false;
}
/** a test's: a frame drawn */
export const drewSourcesForTest = drewSources;

/**
 * Whether anything on the stage changed since it was drawn, by Pixi's own
 * bookkeeping (each render group's: its children added or gone, the ones
 * whose transform or view changed) - cleared as a frame is drawn. A stage not
 * drawn yet (no render group): changed.
 */
export function stageChanged(stage: Container): boolean {
  if (sourcesUpdated) return true;
  type Group = {
    structureDidChange?: boolean;
    childrenRenderablesToUpdate?: { index: number };
    childrenToUpdate?: Record<string, { index: number }>;
    renderGroupChildren?: Group[];
  };
  const changed = (g: Group | undefined): boolean => {
    if (!g) return true;
    if (g.structureDidChange || (g.childrenRenderablesToUpdate?.index ?? 0) > 0) return true;
    for (const k in g.childrenToUpdate ?? {}) if (g.childrenToUpdate![k].index > 0) return true;
    return (g.renderGroupChildren ?? []).some(changed);
  };
  return changed((stage as unknown as { renderGroup?: Group }).renderGroup);
}

/**
 * A GUI's images packed in sheets (iva build's iva-atlas/): each sheet's
 * URL, and each image's frame by its name in the .gui - [sheet, x, y, w, h].
 */
export interface ImageAtlas {
  sheets: string[];
  frames: Record<string, [number, number, number, number, number]>;
}

export class CFRenderer {
  app: Application;
  project: CFProject;
  imageMap: Record<string, string>;
  targetOrientation?: 'landscape' | 'portrait';
  onOrientationChange?: (o: 'landscape' | 'portrait') => void;

  currentContainer?: Container;
  debugMode: boolean = false;
  currentPageName: string | null = null;
  /** Scope token used to register joinStore listeners; cleared on navigation. */
  currentScope: string | null = null;
  nodesMap: Record<string, Container[]> = {};
  /** objects by tag (the .gui's tags="", space / comma separated): every join API takes a tag too */
  tagsMap: Record<string, Container[]> = {};
  /** themes set at runtime (CF.setProperties({ join, theme })), by join or tag: objects made later get them too */
  themeOf: Record<string, string> = {};
  pageHistory: string[] = [];
  cfApi?: any; // Reference to the CF API instance for components to use without accessing window.CF
  /**
   * A project file's URL (a web view's `url="page.html"`, url() in an input
   * theme). Default: the image map's URL for that name, else the name as is.
   */
  fileUrl?: (name: string) => string | undefined;
  /** the host's way to a web view's URL (see LoadProjectOptions.webUrl) */
  webUrl?: (url: string) => string | undefined;
  /** the host loads another GUI (CF.loadGUI; see LoadProjectOptions.loadGui): a URL, '' this one again, null its default */
  loadGui?: (url: string | null, settings: Record<string, unknown>) => void;
  /** the host opens a URL that isn't a GUI link (CF.openURL; see LoadProjectOptions.openUrl) */
  openUrl?: (url: string) => void;
  /** the page to show first instead of the GUI's start page */
  startPage?: string;
  /** the frame rate shown (setShowFps) */
  showFps = false;
  fpsContainer?: Container;
  fpsText?: Text;
  fpsBg?: Graphics;
  fpsTicker?: () => void;

  tooltipContainer?: Container;
  tooltipText?: Text;
  tooltipBg?: Graphics;

  constructor(app: Application, project: CFProject, imageMap: Record<string, string>) {
    this.app = app;
    this.project = project;
    this.imageMap = imageMap;
  }

  initStore() {
    // the GUI's joins afresh; the CF object's JoinChangeEvent bridge (set up before) stays
    joinStore.reset();
    const allNodes: CFNode[] = [];
    Object.values(this.project.pages).forEach(page => {
      if (page.landscape) allNodes.push(...page.landscape);
      if (page.portrait) allNodes.push(...page.portrait);
    });
    Object.values(this.project.subpages).forEach(subpage => {
      if (subpage.nodes) allNodes.push(...subpage.nodes);
    });
    // Removed old prepopulation of joins as per user request
  }

  /** The frame rate in the top-right corner (the toolbar's FPS box): on its own, not part of the outline mode. */
  setShowFps(on: boolean) {
    this.showFps = on;
    if (on && !this.fpsContainer) {
      this.fpsContainer = new Container();
      this.fpsContainer.zIndex = 9999;

      this.fpsBg = new Graphics();
      this.fpsContainer.addChild(this.fpsBg);

      this.fpsText = new Text({
        text: 'FPS: 00',
        style: new TextStyle({ fill: '#B200FF', fontSize: 18, fontWeight: 'bold' })
      });
      this.fpsContainer.addChild(this.fpsText);

      this.app.stage.addChild(this.fpsContainer);
      this.app.stage.sortableChildren = true;

      // the frames drawn a second (drawing on demand: the ones drawn, not the ticks), redrawn only when it
      // changes - a counter redrawn every tick would have every frame drawn
      let shown = '';
      this.fpsTicker = () => {
        if (this.fpsText && this.fpsBg && this.fpsContainer) {
          const text = `FPS: ${(this.app as any).__ivaDraw ? this.drawnRate : Math.round(this.app.ticker.FPS)}`;
          if (text === shown) return;
          shown = text;
          this.fpsText.text = text;

          // Re-draw background
          this.fpsBg.clear();
          this.fpsBg.rect(0, 0, this.fpsText.width + 10, this.fpsText.height + 6);
          this.fpsBg.fill({ color: 0x000000, alpha: 0.7 });

          this.fpsText.x = 5;
          this.fpsText.y = 3;

          // Position at top-right
          this.fpsContainer.x = this.app.screen.width - this.fpsContainer.width - 10;
          this.fpsContainer.y = 10;
        }
      };
      this.app.ticker.add(this.fpsTicker);
    }
    if (this.fpsContainer) this.fpsContainer.visible = on;
  }

  // ── drawing only when something changed ──

  /** frames drawn in the second before (the FPS counter's, drawing on demand) */
  private drawnRate = 0;
  /** a frame to draw on the next tick, changed or not */
  private drawSoon = false;

  /**
   * Draw a frame only when the stage changed - as Pixi's own bookkeeping
   * says: a child added or gone, a transform, a texture, a text, a drawing -
   * or the canvas' size did, and once a second besides; else the tick goes by
   * without drawing. The ticker runs on (tweens, lists' scrolling, the DOM
   * layer): an idle GUI costs next to nothing, and a slow phone's time goes to
   * what changes. Off: a frame drawn every tick, as Pixi does.
   */
  setRenderOnDemand(on: boolean) {
    const app = this.app as Application & { __ivaDraw?: () => void };
    // one per app (a GUI loaded again keeps it): the one before goes
    if (app.__ivaDraw) app.ticker.remove(app.__ivaDraw);
    app.ticker.remove(app.render, app);
    let last = 0;
    let w = -1;
    let h = -1;
    let second = performance.now();
    let count = 0;
    const draw = () => {
      const now = performance.now();
      const r = app.renderer;
      if (!r) return;
      if (!on || this.drawSoon || now - last >= 1000 || r.width !== w || r.height !== h || stageChanged(app.stage)) {
        this.drawSoon = false;
        last = now;
        w = r.width;
        h = r.height;
        drewSources();
        app.render();
        count++;
      }
      if (now - second >= 1000) {
        this.drawnRate = Math.round((count * 1000) / (now - second));
        count = 0;
        second = now;
      }
    };
    app.__ivaDraw = on ? draw : undefined;
    app.ticker.add(on ? draw : app.render, on ? undefined : app, UPDATE_PRIORITY.LOW);
  }

  /** a frame drawn on the next tick, changed or not (what Pixi doesn't see change) */
  requestRender() {
    this.drawSoon = true;
  }

  setDebugMode(val: boolean) {
    this.debugMode = val;

    if (val) {

      // the tooltip follows the pointer (zoom and the hand are the toolbar's)
      window.addEventListener('pointermove', this.onPointerMove);

    } else {
      window.removeEventListener('pointermove', this.onPointerMove);
      
      if (this.tooltipContainer) {
        this.tooltipContainer.visible = false;
      }
    }

    if (this.currentPageName) {
      this.navigate(this.currentPageName, this.targetOrientation);
    }
  }

  // the tooltip follows the pointer
  private onPointerMove = (e: PointerEvent) => {
    if (this.tooltipContainer && this.tooltipContainer.visible) {
      // screen pixels to the panel's (the canvas fitted, maybe zoomed)
      const rect = this.app.canvas.getBoundingClientRect();
      const k = rect.width ? this.app.screen.width / rect.width : 1;
      let posX = (e.clientX - rect.left) * k + 15;
      let posY = (e.clientY - rect.top) * k + 15;
      
      // Keep tooltip on screen
      if (posX + this.tooltipContainer.width > this.app.screen.width) {
        posX = this.app.screen.width - this.tooltipContainer.width - 5;
      }
      if (posY + this.tooltipContainer.height > this.app.screen.height) {
        posY = this.app.screen.height - this.tooltipContainer.height - 5;
      }
      
      this.tooltipContainer.x = posX;
      this.tooltipContainer.y = posY;
    }
  };

  // Tooltip Logic
  private showTooltip(node: CFNode) {
    if (!this.debugMode) return;
    
    if (!this.tooltipContainer) {
      this.tooltipContainer = new Container();
      this.tooltipContainer.zIndex = 10000;
      this.tooltipBg = new Graphics();
      this.tooltipText = new Text({
        text: '',
        style: new TextStyle({ fill: '#ffffff', fontSize: 12, fontFamily: 'monospace', wordWrap: true, wordWrapWidth: 350 })
      });
      this.tooltipContainer.addChild(this.tooltipBg);
      this.tooltipContainer.addChild(this.tooltipText);
      this.app.stage.addChild(this.tooltipContainer);
    }
    
    let content = `[${node.type.toUpperCase()}] ${node.w}x${node.h} at (${node.x}, ${node.y})\n\n`;
    for (const [key, value] of Object.entries(node.attributes)) {
      content += `${key}: ${value}\n`;
    }
    
    if (this.tooltipText && this.tooltipBg) {
      this.tooltipText.text = content;
      this.tooltipText.x = 8;
      this.tooltipText.y = 8;
      
      this.tooltipBg.clear();
      this.tooltipBg.rect(0, 0, this.tooltipText.width + 16, this.tooltipText.height + 16);
      this.tooltipBg.fill({ color: 0x222222, alpha: 0.95 });
      this.tooltipBg.stroke({ color: 0x555555, width: 1 });
    }
    
    this.tooltipContainer.visible = true;
  }

  private hideTooltip() {
    if (this.tooltipContainer) {
      this.tooltipContainer.visible = false;
    }
  }

  destroy() {
    DomLayer.of(this)?.destroy();
    if (this.fpsTicker) {
      this.app.ticker.remove(this.fpsTicker);
    }
    window.removeEventListener('pointermove', this.onPointerMove);
    if (this.app) {
      try {
        this.app.destroy({ removeView: false }, { children: true });
      } catch (e) {
        console.error("Failed to destroy app:", e);
      }
    }
  }

  // ── images: loaded as something is about to show them, let go when nothing does ──
  //
  // A GUI's images all decoded at once can be more than a phone has (a big GUI's: a GB), so each is loaded
  // when a page, a subpage or a theme that shows it is about to be made, and let go once nothing on the
  // stage shows it any more - but for the ones last used, up to textureBudget bytes (the page before: back
  // at once). Components take textures as they're made (Assets.get): what they'll ask for is in by then.

  /** images on their way in, by alias */
  private loading = new Map<string, Promise<void>>();
  /** the images loaded, by alias: when each was last seen in use (performance.now()) */
  private lastUsed = new Map<string, number>();
  /**
   * Decoded bytes kept of images nothing shows (the page before, the look
   * switched off) - counted once each, though a loaded image is twice that in
   * memory (its bitmap and the GPU's copy): half as much on a phone with 2 GB.
   */
  textureBudget = ((globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory ?? 4) <= 2 ? 128e6 : 256e6;
  /** a page waiting for its images: the latest navigate's number */
  private navToken = 0;
  /** the page a navigate waits for: since when, how many files, when they were in */
  private navTiming?: { page: string; at: number; images: number; files: number; loaded: number };
  /** the images a navigate has waited for (the page it's for): not waited for again */
  private navTried?: { page: string; images: Set<string> };
  private collectTimer?: ReturnType<typeof setTimeout>;
  private prefetchTimer?: ReturnType<typeof setTimeout>;
  private prefetching = false;
  private lowerKeys?: Map<string, string>;
  /** each name an image is known by: the one it's loaded under (a file named by path and by bare name: one texture) */
  private canon?: Map<string, string>;

  /**
   * The GUI's images packed in sheets (iva build's): an image in one comes
   * with its sheet - the sheet loaded, its every image is in, each a frame of
   * it under the image's own name - and goes with it. A slow phone spends
   * ~30 ms a file whatever its size: a page's few sheets, not its hundreds
   * of images. The images not in a sheet load one by one, as ever.
   */
  atlas?: ImageAtlas;
  private sheets?: { frameOf: Map<string, [number, number, number, number, number]>; names: [string, number[]][][]; key: Map<string, number> };

  /** The sheets' index: each image's frame by its name (lower case), each sheet's images, each sheet's key. */
  private sheetIndex() {
    if (this.sheets || !this.atlas) return this.sheets;
    const frameOf = new Map<string, [number, number, number, number, number]>();
    const names: [string, number[]][][] = this.atlas.sheets.map(() => []);
    for (const [name, f] of Object.entries(this.atlas.frames)) {
      if (!Array.isArray(f) || f.length < 5 || !names[f[0]]) continue;
      frameOf.set(name.replace(/\\/g, '/').toLowerCase(), f);
      names[f[0]].push([name, f]);
    }
    const key = new Map(this.atlas.sheets.map((url, i) => [`iva-atlas:${url}`, i]));
    return (this.sheets = { frameOf, names, key });
  }

  /** The sheet an image (alias) comes with - its key - if it's in one. */
  private sheetOf(alias: string): string | undefined {
    const f = this.sheetIndex()?.frameOf.get(alias.toLowerCase());
    return f && this.atlas ? `iva-atlas:${this.atlas.sheets[f[0]]}` : undefined;
  }

  /** The images a sheet (its key) holds, by the names they're loaded under. */
  private imagesIn(sheet: string): string[] {
    const s = this.sheetIndex();
    const i = s?.key.get(sheet);
    if (i === undefined) return [];
    return s!.names[i].flatMap(([name]) => this.aliasOf(name) ?? []);
  }

  /** How many files these images are: the sheets they come with, and the ones on their own. */
  filesFor(aliases: Iterable<string>): number {
    return new Set([...aliases].map((a) => this.sheetOf(a) ?? a)).size;
  }

  /** the images (aliases) made known to Assets by this renderer: an image as it's first loaded */
  private added = new Set<string>();

  /**
   * Every sheet known by its URL - none loaded yet (ensureLoaded does that).
   * An image is made known as it's first loaded (loadOne): of a GUI's
   * thousands most come with their sheets, and a slow phone takes 0.4 s to
   * add them all.
   */
  async loadAssets() {
    for (const url of this.atlas?.sheets ?? []) this.addAsset(`iva-atlas:${url}`, url);
  }

  /** An image (alias) known to Assets by its URL - once by this renderer (a GUI before's of that name: replaced). */
  private addAsset(alias: string, src: string) {
    if (this.added.has(alias)) return;
    this.added.add(alias);
    Assets.add({ alias, src, parser: 'loadTextures' });
  }

  /**
   * The key an image the .gui names is known by, loaded or not: as named, else
   * by file name, in any case - and of a file known by several names (its path
   * in the image folder and its bare name) always the first, so it's loaded
   * once and let go whole: Pixi unloads a file's texture under every name but
   * forgets only the names last loaded by.
   */
  aliasOf(ref: string): string | undefined {
    if (!ref) return undefined;
    if (!this.lowerKeys || !this.canon) {
      this.lowerKeys = new Map();
      this.canon = new Map();
      const byUrl = new Map<string, string>();
      for (const k of Object.keys(this.imageMap)) {
        if (!this.lowerKeys.has(k.toLowerCase())) this.lowerKeys.set(k.toLowerCase(), k);
        const url = this.imageMap[k];
        if (!byUrl.has(url)) byUrl.set(url, k);
        this.canon.set(k, byUrl.get(url)!);
      }
    }
    const name = ref.replace(/\\/g, '/');
    const leaf = name.split('/').pop() || name;
    const key = [name, leaf].map((k) => (this.imageMap[k] ? k : this.lowerKeys!.get(k.toLowerCase()))).find(Boolean);
    return key ? this.canon.get(key) : undefined;
  }

  /** a theme by name - as the .gui names it, or with the dot its CSS selector had */
  private themeNamed(name: string) {
    return this.project.themes[name] ?? this.project.themes['.' + name];
  }

  /**
   * These images (aliases) loaded - an image in a sheet with its sheet, the
   * others on their own; a few tries each (a link that drops a file now and
   * then: ZeroTier does). A sheet that doesn't come: its images on their own.
   */
  ensureLoaded(aliases: Iterable<string>, onLoaded?: (done: number, total: number) => void): Promise<void> {
    const waits: Promise<void>[] = [];
    const once = (key: string, load: () => Promise<void>) => {
      let p = this.loading.get(key);
      if (!p) {
        p = load().finally(() => this.loading.delete(key));
        this.loading.set(key, p);
      }
      return p;
    };
    const alone = (alias: string) => (Assets.cache.has(alias) ? Promise.resolve() : once(alias, () => this.loadOne(alias)));
    for (const alias of aliases) {
      const sheet = this.sheetOf(alias);
      if (Assets.cache.has(alias)) {
        this.lastUsed.set(sheet && Assets.cache.has(sheet) ? sheet : alias, performance.now());
        continue;
      }
      waits.push(sheet ? once(sheet, () => this.loadSheet(sheet)).then(() => alone(alias)) : alone(alias));
    }
    if (onLoaded) {
      let done = 0;
      onLoaded(0, waits.length);
      waits.forEach((w) => void w.then(() => onLoaded(++done, waits.length)));
    }
    return Promise.all(waits).then(() => undefined);
  }

  /** A sheet loaded, and its every image in - a frame of it, under the image's own name. */
  private async loadSheet(sheet: string) {
    await this.loadOne(sheet);
    const t = Assets.cache.has(sheet) ? (Assets.get(sheet) as Texture) : undefined;
    const s = this.sheetIndex();
    const i = s?.key.get(sheet);
    if (!t?.source || i === undefined) return;
    for (const [name, [, x, y, w, h]] of s!.names[i]) {
      const alias = this.aliasOf(name);
      if (!alias || Assets.cache.has(alias)) continue;
      Assets.cache.set(alias, new Texture({ source: t.source, frame: new Rectangle(x, y, w, h), label: alias }));
    }
  }

  /**
   * While start() waits for the first page's images: each on the GPU as it
   * comes (the page idle meanwhile, Pixi's workers decoding the rest) - not
   * all in the first frame (a slow phone: half a second of uploads).
   */
  private uploadOnLoad = false;

  private async loadOne(alias: string) {
    if (!alias.startsWith('iva-atlas:') && this.imageMap[alias]) this.addAsset(alias, this.imageMap[alias]);
    const again = [300, 800];
    for (let attempt = 0; ; attempt++) {
      try {
        await Assets.load(alias);
        this.lastUsed.set(alias, performance.now());
        if (this.uploadOnLoad) {
          const source = (Assets.get(alias) as Texture | undefined)?.source;
          try {
            if (source) (this.app.renderer as unknown as { texture?: { initSource?: (s: unknown) => void } }).texture?.initSource?.(source);
          } catch {
            /* uploaded by the frame that shows it, as ever */
          }
        }
        return;
      } catch (e) {
        if (attempt >= again.length) {
          console.error("Failed to load asset:", alias, e);
          return;
        }
        await new Promise((r) => setTimeout(r, again[attempt]));
      }
    }
  }

  /**
   * `make` once the images `images()` names are in - asked for again just
   * before it's made: a look switched meanwhile (a script at start sets the
   * one kept) names others, which must be in too, or what's made comes out
   * without them and no retheme reaches it (it wasn't there to retheme). An
   * image that hasn't come after its tries isn't waited for again. Whether it
   * was made at once.
   */
  private whenLoaded(images: () => Iterable<string>, make: () => void, alive: () => boolean, tried = new Set<string>()): boolean {
    const need = this.missing(images()).filter((a) => !tried.has(a));
    if (!need.length) {
      make();
      return true;
    }
    need.forEach((a) => tried.add(a));
    void this.ensureLoaded(need).then(() => {
      if (alive()) this.whenLoaded(images, make, alive, tried);
    });
    return false;
  }

  /** Of these images, the ones not loaded yet. */
  private missing(aliases: Iterable<string>): string[] {
    return [...aliases].filter((a) => !Assets.cache.has(a));
  }

  /**
   * The images nodes can show (aliases): named in their text and attributes
   * (and their children's: a button's <inactive><img>), and in every state of
   * the themes they use - `overrides`: the themes set at runtime too. A
   * subpage's own aren't followed: it loads them as it's made.
   */
  imagesOf(nodes: CFNode[], themes: (string | undefined)[] = [], overrides = false): Set<string> {
    const found = new Set<string>();
    const themeNames = new Set(themes.filter((t): t is string => !!t));
    if (overrides) for (const t of Object.values(this.themeOf)) themeNames.add(t);
    const image = (ref?: string) => {
      const r = ref?.trim();
      if (!r || !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(r)) return;
      const alias = this.aliasOf(r);
      if (alias) found.add(alias);
    };
    const walk = (n: CFNode) => {
      image(n.text);
      if (n.t) themeNames.add(n.t);
      for (const v of Object.values(n.attributes ?? {})) {
        image(v);
        if (this.themeNamed(v)) themeNames.add(v);
      }
      for (const c of n.children ?? []) walk(c);
    };
    nodes.forEach(walk);
    for (const name of themeNames) {
      for (const css of Object.values(this.themeNamed(name)?.states ?? {})) {
        for (const v of Object.values(css ?? {})) for (const m of String(v).matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)) image(m[1]);
      }
    }
    return found;
  }

  /** A page's images, either orientation's (the device may turn), its background's, the themes set at runtime. */
  private pageImages(pageName: string): Set<string> {
    const p = this.project.pages[pageName];
    if (!p) return new Set();
    return this.imagesOf([...(p.landscape ?? []), ...(p.portrait ?? [])], [p.landscapeTheme, p.portraitTheme], true);
  }

  /** A page's images with those of the subpages placed on it: what showing it loads (a prefetch). */
  private pageImagesDeep(pageName: string): Set<string> {
    const found = this.pageImages(pageName);
    const p = this.project.pages[pageName];
    if (!p) return found;
    const seen = new Set<string>();
    const walk = (n: CFNode) => {
      if (n.type === 'subpage' && n.name && !seen.has(n.name)) {
        seen.add(n.name);
        const def = this.project.subpages[n.name];
        if (def) {
          for (const a of this.imagesOf(def.nodes, [def.theme], true)) found.add(a);
          def.nodes.forEach(walk);
        }
      }
      for (const c of n.children ?? []) walk(c);
    };
    [...(p.landscape ?? []), ...(p.portrait ?? [])].forEach(walk);
    return found;
  }

  /** decoded bytes of the images loaded (counted once each) */
  private loadedBytes(): number {
    let sum = 0;
    for (const alias of this.lastUsed.keys()) {
      const t = Assets.cache.has(alias) ? (Assets.get(alias) as Texture) : undefined;
      if (t?.source) sum += (t.source.pixelWidth || 1) * (t.source.pixelHeight || 1) * 4;
    }
    return sum;
  }

  /** In a moment (a page up, its flip over): the other pages' images decoded while nothing happens. */
  schedulePrefetch() {
    clearTimeout(this.prefetchTimer);
    this.prefetchTimer = setTimeout(() => void this.prefetch(), 3000);
  }

  /**
   * The other pages' images decoded ahead - the pages after the one shown, in
   * the GUI's order, one page at a time, until the images loaded reach the
   * budget: a page visited then comes up without the wait. A flip meanwhile
   * stops it (that page's own images first); the flip over, it goes on.
   */
  async prefetch() {
    if (this.prefetching) return;
    this.prefetching = true;
    try {
      const names = Object.keys(this.project.pages);
      const at = Math.max(0, names.indexOf(this.currentPageName ?? ''));
      const token = this.navToken;
      for (const name of [...names.slice(at + 1), ...names.slice(0, at)]) {
        if (this.navToken !== token || this.loadedBytes() >= this.textureBudget) return;
        const need = this.missing(this.pageImagesDeep(name));
        if (need.length) await this.ensureLoaded(need);
      }
    } finally {
      this.prefetching = false;
    }
  }

  /**
   * In a moment (a flip's transition over, a look switched, an image join set
   * to another file, a list's rows scrolled off): the images nothing shows any
   * more let go.
   */
  scheduleCollect() {
    clearTimeout(this.collectTimer);
    this.collectTimer = setTimeout(() => this.collect(), 1500);
  }

  /**
   * The loaded images nothing on the stage shows: kept, the latest used first,
   * up to textureBudget bytes (any used in the last few seconds besides); the
   * rest unloaded - the GPU's copy given back at once, and the decoded bitmap
   * closed (Pixi only lets go of it, for the garbage collector to find later).
   */
  collect() {
    const stage = this.app.stage;
    if (!stage || stage.destroyed) return;
    const inUse = new Set<unknown>();
    const walk = (c: Container) => {
      const t = (c as any).texture as Texture | undefined;
      if (t?.source) inUse.add(t.source);
      for (const k of c.children) walk(k as Container);
    };
    walk(stage);
    const now = performance.now();
    const idle: { alias: string; bytes: number; at: number }[] = [];
    for (const [alias, at] of this.lastUsed) {
      const t = Assets.cache.has(alias) ? (Assets.get(alias) as Texture) : undefined;
      if (!t?.source) {
        this.lastUsed.delete(alias);
        continue;
      }
      if (inUse.has(t.source)) {
        this.lastUsed.set(alias, now);
        continue;
      }
      idle.push({ alias, bytes: (t.source.pixelWidth || 1) * (t.source.pixelHeight || 1) * 4, at });
    }
    idle.sort((x, y) => y.at - x.at);
    let kept = 0;
    const drop: string[] = [];
    for (const it of idle) {
      // used a moment ago (loaded for what's being made): kept, and not out of the budget
      if (now - it.at < 5000) continue;
      if (kept + it.bytes <= this.textureBudget) kept += it.bytes;
      else drop.push(it.alias);
    }
    if (!drop.length) return;
    for (const a of drop) this.lastUsed.delete(a);
    const bitmaps = drop.map((a) => (Assets.get(a) as Texture | undefined)?.source?.resource as { close?: () => void } | undefined);
    // a sheet's images go with it: frames of it, forgotten (the sheet itself is what's unloaded)
    for (const sheet of drop) {
      for (const alias of this.imagesIn(sheet)) {
        if (!Assets.cache.has(alias)) continue;
        const frame = Assets.get(alias) as Texture;
        Assets.cache.remove(alias);
        frame.destroy(false);
      }
    }
    Assets.unload(drop)
      .then(() => {
        for (const b of bitmaps) if (typeof b?.close === 'function') b.close();
      })
      .catch((e) => console.warn('[cf images] unload', e));
  }

  applyProperties(changesArray: any[], delay: number = 0, duration: number = 0, curve: string = "linear") {
    changesArray.forEach(change => {
      const join = change.join;
      if (!join) return;
      if (typeof change.theme === 'string') {
        // a theme: at the end of the delay, no animation (as iViewer does)
        this.themeOf[join] = change.theme;
        const retheme = () => [...(this.nodesMap[join] ?? []), ...(this.tagsMap[join] ?? [])]
          .filter((c) => !c.destroyed)
          .forEach((c) => this.retheme(c, change.theme));
        if (delay > 0) setTimeout(retheme, delay * 1000);
        else retheme();
      }
      const containers = [...(this.nodesMap[join] ?? []), ...(this.tagsMap[join] ?? [])];
      if (!containers.length) return;

      const activeContainers = containers.filter(c => !c.destroyed);
      if (activeContainers.length === 0) {
        delete this.nodesMap[join];
        delete this.tagsMap[join];
        return;
      }

      // CF.AnimationCurveEaseIn ... (it was always linear: the constants are ANIMATION_CURVE_...)
      const ease = easeOf(curve);

      activeContainers.forEach(c => {
        const targetProps: any = {};
        if (change.zrotation !== undefined) targetProps.angle = change.zrotation;
        if (change.opacity !== undefined) targetProps.alpha = Math.max(0, Math.min(1, change.opacity));

        // X and Y are offset by pivot!
        if (change.x !== undefined) targetProps.x = change.x + c.pivot.x;
        if (change.y !== undefined) targetProps.y = change.y + c.pivot.y;

        // w / h: the element made again at the new size (resize) - not scaled to it: its scale stays what scale / xscale / yscale say
        const size = change.w !== undefined || change.h !== undefined
          ? { w: change.w !== undefined ? Number(change.w) : undefined, h: change.h !== undefined ? Number(change.h) : undefined }
          : null;

        const xScaleTarget = change.xscale !== undefined ? change.xscale : (change.scale !== undefined ? change.scale : undefined);
        const yScaleTarget = change.yscale !== undefined ? change.yscale : (change.scale !== undefined ? change.scale : undefined);
        // its scale and its turn about X and Y (3D rotations), drawn as one scale
        const look = ((c as any).cfLook ??= { scale: { x: c.scale.x, y: c.scale.y }, rotation: { x: 0, y: 0 } });
        if (xScaleTarget !== undefined) look.scale.x = xScaleTarget;
        if (yScaleTarget !== undefined) look.scale.y = yScaleTarget;
        if (change.xrotation !== undefined) look.rotation.x = Number(change.xrotation) || 0;
        if (change.yrotation !== undefined) look.rotation.y = Number(change.yrotation) || 0;
        const scaled = xScaleTarget !== undefined || yScaleTarget !== undefined || change.xrotation !== undefined || change.yrotation !== undefined;
        const to = drawnScale(look.scale, look.rotation);

        if (duration > 0 || delay > 0) {
          if (Object.keys(targetProps).length > 0) {
            trackAnimation(c, animateFrom(c, targetProps, { duration, delay, ease }));
          }
          if (size) {
            // till it's there: drawn growing (shrinking) to the new size - its scale standing in; then made at that size, its scale its own again
            const now = this.sizeOf(c);
            const grown = {
              x: look.scale.x * (size.w !== undefined && now.w ? size.w / now.w : 1),
              y: look.scale.y * (size.h !== undefined && now.h ? size.h / now.h : 1),
            };
            const standIn = drawnScale(grown, look.rotation);
            trackAnimation(c.scale, animateFrom(c.scale, { x: standIn.x, y: standIn.y }, { duration, delay, ease }, c)).finished
              .then(() => { if (!c.destroyed) this.resize(c, size.w, size.h); }, () => {});
          } else if (scaled) {
            trackAnimation(c.scale, animateFrom(c.scale, { x: to.x, y: to.y }, { duration, delay, ease }, c));
          }
        } else {
          if (targetProps.angle !== undefined) c.angle = targetProps.angle;
          if (targetProps.alpha !== undefined) c.alpha = targetProps.alpha;
          if (targetProps.x !== undefined) c.x = targetProps.x;
          if (targetProps.y !== undefined) c.y = targetProps.y;
          if (scaled) c.scale.set(to.x, to.y);
          if (size) this.resize(c, size.w, size.h);
        }
      });
    });
  }

  /**
   * A background theme's colour, then its image: stretched over the w x h
   * (GUI Designer's Tiled off), or at its own size from the top left again
   * and again (background-repeat: repeat).
   */
  themeBackground(container: Container, css: Record<string, string> | undefined, w: number, h: number) {
    const color = css?.["background-color"];
    if (color && color.toLowerCase() !== 'transparent') {
      container.addChild(new Graphics().rect(0, 0, w, h).fill({ color }));
    }
    const bgImg = this.getBgImage(css?.["background-image"]);
    const texture = bgImg ? Assets.get(bgImg) : undefined;
    if (!texture) return;
    const sprite = /^repeat\b/i.test(css?.["background-repeat"] ?? '')
      ? new TilingSprite({ texture, width: w, height: h })
      : Object.assign(new Sprite(texture), { width: w, height: h });
    container.addChild(sprite);
  }

  /** An object in another theme: made again from its node, in the same place. */
  retheme(c: Container, theme: string, tried = new Set<string>()) {
    const made = (c as any).cfMade as { node: CFNode; listPrefix?: string; listIndex?: number } | undefined;
    const parent = c.parent;
    if (!made || !parent || (c as any).cfNode?.t === theme) return;
    // the theme's images first (a look switched: its drawings aren't in yet), then made again in it - one that
    // didn't come after its tries isn't waited for again
    const need = this.missing(this.imagesOf([], [theme])).filter((a) => !tried.has(a));
    if (need.length) {
      need.forEach((a) => tried.add(a));
      void this.ensureLoaded(need).then(() => {
        if (!c.destroyed) this.retheme(c, theme, tried);
      });
      return;
    }
    const at = parent.getChildIndex(c);
    const fresh = this.createNode({ ...made.node, t: theme }, made.listPrefix, made.listIndex);
    parent.addChildAt(fresh, at);
    parent.removeChild(c);
    c.destroy({ children: true });
    this.scheduleCollect();
  }

  /** An element's size as made: its node's w / h (a subpage placement's: its definition's where it gives none). */
  sizeOf(c: Container): { w: number; h: number } {
    const node = (c as any).cfNode as CFNode | undefined;
    let w = node?.w || 0;
    let h = node?.h || 0;
    if (node?.type === 'subpage' && node.name && this.project.subpages[node.name]) {
      const def = this.project.subpages[node.name];
      w = w || def.w;
      h = h || def.h;
    }
    return { w, h };
  }

  /**
   * An element at another size (CF.setProperties w / h): made again from its
   * node at that size, in the same place, its look (scale, rotations) kept -
   * not scaled to fit, which would stretch its text and its children.
   */
  resize(c: Container, w?: number, h?: number) {
    const made = (c as any).cfMade as { node: CFNode; listPrefix?: string; listIndex?: number } | undefined;
    const parent = c.parent;
    if (!made || !parent) return;
    const node = { ...made.node };
    if (w !== undefined) node.w = w;
    if (h !== undefined) node.h = h;
    const at = parent.getChildIndex(c);
    const fresh = this.createNode(node, made.listPrefix, made.listIndex);
    const look = (c as any).cfLook as { scale: { x: number; y: number }; rotation: { x: number; y: number } } | undefined;
    if (look) {
      (fresh as any).cfLook = look;
      const to = drawnScale(look.scale, look.rotation);
      fresh.scale.set(to.x, to.y);
    }
    parent.addChildAt(fresh, at);
    parent.removeChild(c);
    c.destroy({ children: true });
  }

  /** A loaded image by the name the .gui gives it: a path in its image folder (icons/x.png), else its file name. */
  texture(ref: string): Texture | undefined {
    const key = this.assetKey(ref);
    return key ? Assets.get(key) : undefined;
  }

  /**
   * The key an image the .gui names is loaded under: as named (a path in its
   * image folder, GUI Designer's backslashes or not), else by file name, in
   * any case. Undefined if it isn't loaded.
   */
  assetKey(ref: string): string | undefined {
    if (!ref) return undefined;
    const key = this.aliasOf(ref);
    if (key) return Assets.cache.has(key) ? key : undefined;
    // not a file of the GUI's: loaded under the name itself, if at all
    const name = ref.replace(/\\/g, '/');
    const leaf = name.split('/').pop() || name;
    return [name, leaf].find((k) => Assets.cache.has(k));
  }

  /** What a web view loads for a URL: the host's way to it, else the URL (a project file by name). */
  webSrc(url: string): string {
    return this.webUrl?.(url) ?? this.resolveUrl(url);
  }

  resolveUrl(url: string): string {
    if (!url || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')) return url;
    const name = url.replace(/\\/g, '/');
    const fromHost = this.fileUrl?.(name);
    if (fromHost) return fromHost;
    const leaf = name.split('/').pop() || name;
    const key = Object.keys(this.imageMap).find((k) => k.toLowerCase() === name.toLowerCase() || k.toLowerCase() === leaf.toLowerCase());
    return key ? this.imageMap[key] : url;
  }

  /** Gets image URL from a background-image CSS prop like url(file.png) */
  getBgImage(cssProp?: string): string | null {
    if (!cssProp) return null;
    const match = cssProp.match(/url\((.*?)\)/);
    if (!match) return null;
    let url = match[1].trim();
    if (url.startsWith("'") || url.startsWith('"')) url = url.substring(1);
    if (url.endsWith("'") || url.endsWith('"')) url = url.substring(0, url.length - 1);
    url = url.replace(/\\/g, '/');
    // the key it's loaded under (as the .gui names it - a path in its image folder: icons/x.png - or by file
    // name), else the file name
    return this.aliasOf(url) ?? (url.split('/').pop() || url);
  }

  /** an object's tags now: the .gui's as scripts left them, and those they gave its join */
  private objectTags(join: string, node: CFNode): string[] {
    const guiTags = (node.attributes?.tags ?? '').split(/[\s,]+/).filter(Boolean);
    return this.cfApi?.tagsOfObject ? this.cfApi.tagsOfObject(join || null, guiTags) : guiTags;
  }

  /** The tags of a join's objects on screen changed (CF.addTag / CF.removeTag): what a tag reaches, again. */
  retag(join: string) {
    for (const c of this.nodesMap[join] ?? []) {
      if (c.destroyed) continue;
      const made = (c as any).cfMade as { node: CFNode } | undefined;
      const now = new Set(this.objectTags(join, made?.node ?? (c as any).cfNode));
      for (const [tag, list] of Object.entries(this.tagsMap)) {
        if (!now.has(tag) && list.includes(c)) this.tagsMap[tag] = list.filter((x) => x !== c);
      }
      for (const tag of now) if (!(this.tagsMap[tag] ??= []).includes(c)) this.tagsMap[tag].push(c);
    }
  }

  /** A tag taken from every object (CF.removeTag(tag)). */
  untag(tag: string) {
    delete this.tagsMap[tag];
  }

  createNode(node: CFNode, listPrefix?: string, listIndex?: number): Container {
    const madeFrom = node;
    node = { ...node }; // clone to avoid mutating original
    // tags: the .gui's, less those scripts took, and those they gave its join (CF.addTag); a theme
    // set at runtime on one of them (or on the join) wins over the .gui's
    const own = ownJoin(node);
    const key = own && listPrefix ? `${listPrefix}:${listIndex}:${own}` : own;
    const tags = this.objectTags(key, node);
    for (const tag of tags) if (this.themeOf[tag]) node.t = this.themeOf[tag];
    // a size CF.setProperties gave it (w / h): made at that size - its text laid out, its images stretched, its bounds there
    const cf = this.cfApi ?? (typeof window !== 'undefined' ? (window as any).CF : undefined);
    const sized = key ? cf?.propertiesStore?.[key]?._overrides : undefined;
    if (sized?.w !== undefined) node.w = Number(sized.w) || 0;
    if (sized?.h !== undefined) node.h = Number(sized.h) || 0;
    let registeredJoin: string | null = null;

    const resolveJoin = (j: string | undefined): string | undefined => {
      if (!j || j === "0") return j;
      if (listPrefix) return `${listPrefix}:${listIndex}:${j}`;
      return j;
    };
    node.j = resolveJoin(node.j);
    // a button's text (<inactive s="1">): in a list, the item's s1 too, not the page's
    node.inactive_s = resolveJoin(node.inactive_s);
    node.active_s = resolveJoin(node.active_s);
    // a slider's press join (d): in a list, the item's too
    node.d = resolveJoin(node.d);

    const container = new Container();
    (container as any).cfNode = node;
    (container as any).cfMade = { node: madeFrom, listPrefix, listIndex };
    for (const tag of tags) (this.tagsMap[tag] ??= []).push(container);
    let effW = node.w || 0;
    let effH = node.h || 0;
    if (node.type === "subpage" && node.name && this.project.subpages[node.name]) {
      const def = this.project.subpages[node.name];
      effW = effW || def.w;
      effH = effH || def.h;
    }

    // Set pivot to center so rotation (zrotation) works naturally
    container.pivot.set(effW / 2, effH / 2);
    container.x = node.x + effW / 2;
    container.y = node.y + effH / 2;

    if (effW > 0 && effH > 0) {
      container.hitArea = new Rectangle(0, 0, effW, effH);
    }

    const getNormJoin = (type: string, j: string | undefined): string | null => {
      if (!j || j === "0") return null;
      return normalizeJoinString(type, j);
    };

    const addJoinMap = (jstr: string) => {
      // jstr is something like "a1" or "a(l1:0:1)"
      // but renderer previously passed "sl1:0:1", which we now handle properly
      // Actually, wait, addJoinMap receives "s" + node.j
      // meaning if node.j is "l1:0:1", addJoinMap receives "sl1:0:1"
      // We must extract type and id:
      const type = jstr.charAt(0);
      const id = jstr.substring(1);
      const normJstr = normalizeJoinString(type, id);
      registeredJoin = normJstr;

      if (!this.nodesMap[normJstr]) this.nodesMap[normJstr] = [];
      this.nodesMap[normJstr].push(container);

      // Populate initial properties for CF API
      if (typeof window !== 'undefined' && (window as any).CF) {
        const cftx = (window as any).CF;
        if (!cftx.propertiesStore[normJstr]) {
          const props = {
            join: normJstr,
            x: node.x,
            y: node.y,
            w: effW,
            h: effH,
            xrotation: 0,
            yrotation: 0,
            zrotation: 0,
            opacity: 1,
            scale: 1.0,
            xscale: 1.0,
            yscale: 1.0
          };
          Object.defineProperty(props, '_overrides', {
            value: {},
            enumerable: false,
            writable: true,
            configurable: true
          });
          cftx.propertiesStore[normJstr] = props;
        } else {
          // If properties already exist in store, update non-overridden defaults to the new node's defaults
          const storeVal = cftx.propertiesStore[normJstr];
          if (!storeVal._overrides) {
            Object.defineProperty(storeVal, '_overrides', {
              value: {},
              enumerable: false,
              writable: true,
              configurable: true
            });
          }
          
          const defaults = {
            x: node.x,
            y: node.y,
            w: effW,
            h: effH,
            xrotation: 0,
            yrotation: 0,
            zrotation: 0,
            opacity: 1,
            scale: 1.0,
            xscale: 1.0,
            yscale: 1.0
          };

          for (const key of Object.keys(defaults)) {
            if (storeVal._overrides[key] !== undefined) {
              storeVal[key] = storeVal._overrides[key];
            } else {
              storeVal[key] = (defaults as any)[key];
            }
          }
        }
      }
    };

    if (node.type === "input") {
      const s = resolveJoin(node.attributes?.s);
      if (s && s !== "0") addJoinMap("s" + s);
    } else if (node.j && node.j !== "0") {
      if (node.type === "slider" || node.type === "gauge" || node.type === "knob") {
        addJoinMap("a" + node.j);
      } else if (
        node.type === "txt" ||
        node.type === "img" ||
        node.type === "video" ||
        node.type === "web"
      ) {
        addJoinMap("s" + node.j);
      } else if (node.type === "list") {
        addJoinMap("l" + node.j);
      } else if (node.type === "btn") {
        addJoinMap("d" + node.j);
      } else {
        addJoinMap("d" + node.j);
      }
    }


    // Don't set w/h on container yet, as it scales children.

    if (registeredJoin && this.themeOf[registeredJoin]) node.t = this.themeOf[registeredJoin];
    const theme = node.t ? this.project.themes[node.t] : null;
    const cssState0 = theme ? theme.states["0"] : null;
    const cssState1 = theme ? theme.states["1"] : null;

    if (node.type === "btn") {
      renderButton(node, container, this, getNormJoin, cssState0, cssState1, listPrefix, listIndex);
    } else if (node.type === "img") {
      renderImage(node, container, this);
    } else if (node.type === "txt") {
      renderText(node, container, this, getNormJoin, cssState0);
    } else if (node.type === "list") {
      renderList(node, container, this);
    } else if (node.type === "subpage") {
      renderSubpage(node, container, this);
    } else if (node.type === "gauge") {
      renderGauge(node, container, this, getNormJoin);
    } else if (node.type === "slider") {
      renderSlider(node, container, this, getNormJoin);
    } else if (node.type === "video") {
      renderVideo(node, container, this);
    } else if (node.type === "web") {
      renderWeb(node, container, this);
    } else if (node.type === "input") {
      renderInput(node, container, this, cssState0, listPrefix, listIndex);
    } else if (node.type === "timer") {
      renderTimer(node, container, this);
    }

    // Apply actual dimensions unconditionally
    let dw = node.w || 0;
    let dh = node.h || 0;
    if (node.type === "subpage" && node.name && this.project.subpages[node.name]) {
      const def = this.project.subpages[node.name];
      dw = dw || def.w || 0;
      dh = dh || def.h || 0;
    }

    // Fallback bounds
    if (!dw) dw = 50;
    if (!dh) dh = 50;

    const boundsGfx = new Graphics().rect(0, 0, dw, dh).fill({ color: 0x000000, alpha: 0.0001 });
    // only there for bounds: never a hit target (inside a list everything is hit tested)
    boundsGfx.eventMode = 'none';
    container.addChild(boundsGfx);

    if (this.debugMode) {
      const debugGfx = new Graphics();
      let isUnrecognized = false;
      if (!["btn", "img", "txt", "list", "subpage", "gauge", "slider", "video", "web", "input"].includes(node.type)) {
        isUnrecognized = true;
      }
      debugGfx.rect(0, 0, dw, dh);
      if (isUnrecognized) {
        debugGfx.fill({ color: 0xff0000, alpha: 0.5 });
      }
      debugGfx.stroke({ color: 0x00ff00, width: 2, alpha: 0.8, alignment: 1 });
      container.addChild(debugGfx);

      const joinTexts: string[] = [];
      if (node.j && node.j !== "0") {
        if (node.type === "slider" || node.type === "gauge") {
          const norm = getNormJoin("a", node.j);
          if (norm) joinTexts.push(norm);
        } else if (node.type === "txt") {
          const norm = getNormJoin("s", node.j);
          if (norm) joinTexts.push(norm);
        } else if (node.type === "list") {
          const norm = getNormJoin("l", node.j);
          if (norm) joinTexts.push(norm);
        } else {
          const norm = getNormJoin("d", node.j);
          if (norm) joinTexts.push(norm);
        }
      }
      if (node.type === "btn") {
        if (node.inactive_s && node.inactive_s !== "0") {
          const norm = getNormJoin("s", node.inactive_s);
          if (norm && !joinTexts.includes(norm)) joinTexts.push(norm);
        }
        if (node.active_s && node.active_s !== "0") {
          const norm = getNormJoin("s", node.active_s);
          if (norm && !joinTexts.includes(norm)) joinTexts.push(norm);
        }
      }

      if (isUnrecognized) {
        joinTexts.push(node.type || "unknown");
      }

      if (joinTexts.length > 0) {
        const debugContainer = new Container();
        (debugContainer as any).isDebugLabel = true;
        (debugContainer as any).cfNode = node;
        debugContainer.x = 2;
        debugContainer.y = 2;
        let currentX = 0;

        for (const jText of joinTexts) {
          const bgGfx = new Graphics();
          let bgColor = 0x000000; // Black for serial 's' or unknown

          // Try to determine the join type from the text (it might look like 'd1', 's2', or 'l1:0:s1')
          const parts = jText.split(':');
          const lastPart = parts[parts.length - 1]; // e.g. 's1' or 'd100'
          if (lastPart.startsWith('d')) bgColor = 0x0000ff; // Blue
          else if (lastPart.startsWith('a')) bgColor = 0x008000; // Green

          const debugTxt = new Text({
            text: jText,
            style: new TextStyle({ fill: '#ffffff', fontSize: 12 })
          });

          bgGfx.rect(0, 0, debugTxt.width + 4, debugTxt.height + 2);
          bgGfx.fill({ color: bgColor, alpha: 0.85 });

          bgGfx.x = currentX;
          debugTxt.x = currentX + 2;
          debugTxt.y = 1;

          debugContainer.addChild(bgGfx);
          debugContainer.addChild(debugTxt);

          currentX += debugTxt.width + 6; // spacing
        }
        container.addChild(debugContainer);
      }
    }

    if (node.children) {
      const gestures = node.children.filter(c => c.type === "gesture");
      if (gestures.length > 0) {
        // the object's join as scripts see it (an image's serial one), in its list item
        const kind = node.type === 'img' || node.type === 'txt' ? 's' : 'd';
        const own = madeFrom.j && madeFrom.j !== '0' ? `${kind}${madeFrom.j}` : null;
        const inList = !!listPrefix && listIndex !== undefined && listIndex !== -1;
        bindGestures(container, gestures, this, {
          join: own && inList ? `${listPrefix}:${listIndex}:${own}` : own,
          list: inList ? listPrefix : null,
          listIndex: inList ? listIndex : null,
        });
      }
    }

    if (registeredJoin && typeof window !== 'undefined' && (window as any).CF) {
      const cftx = (window as any).CF;
      const storeVal = cftx.propertiesStore[registeredJoin];
      if (storeVal) {
        // Apply current active properties to the newly created PIXI container
        if (storeVal.zrotation !== undefined) container.angle = storeVal.zrotation;
        if (storeVal.opacity !== undefined) container.alpha = Math.max(0, Math.min(1, storeVal.opacity));
        if (storeVal.x !== undefined) container.x = storeVal.x + container.pivot.x;
        if (storeVal.y !== undefined) container.y = storeVal.y + container.pivot.y;
        // (w / h: the node was made at them, above - not set on the container, which would scale its children)

        // its scale as scripts set it (an xscale / yscale over a scale) - the store's defaults of 1 stand for none set
        const over = storeVal._overrides ?? {};
        const xScaleTarget = over.xscale !== undefined ? over.xscale : over.scale;
        const yScaleTarget = over.yscale !== undefined ? over.yscale : over.scale;
        if (xScaleTarget !== undefined) container.scale.x = xScaleTarget;
        if (yScaleTarget !== undefined) container.scale.y = yScaleTarget;
      }
    }

    return container;
  }

  /** A subpage's content; `join`: its placement's ('d5'), for its gestures' scripts. */
  createSubpage(def: CFSubpage, listPrefix?: string, listIndex?: number, join?: string): Container {
    const container = new Container();

    // Set hitArea so gestures are caught everywhere in the subpage bounds
    if (def.w > 0 && def.h > 0) {
      container.hitArea = new Rectangle(0, 0, def.w, def.h);
      const boundsGfx = new Graphics().rect(0, 0, def.w, def.h).fill({ color: 0x000000, alpha: 0.0001 });
      boundsGfx.eventMode = 'none';
      container.addChild(boundsGfx);
    }

    // Nodes
    const gestureNodes = def.nodes.filter(n => n.type === 'gesture');
    if (gestureNodes.length > 0) {
      const inList = !!listPrefix && listIndex !== undefined && listIndex !== -1;
      bindGestures(container, gestureNodes, this, { join: join ?? null, list: inList ? listPrefix : null, listIndex: inList ? listIndex : null, capture: true });
    }

    // its background and its objects - once their images are in (a subpage loads its own as it's made:
    // a page's, a list's rows'); its box and gestures are there from the start
    const fill = () => {
      if (def.theme) {
        const theme = this.project.themes[def.theme];
        if (theme) this.themeBackground(container, theme.states["0"], def.w, def.h);
      }
      def.nodes.forEach(n => {
        if (n.type !== 'gesture') {
          container.addChild(this.createNode(n, listPrefix, listIndex));
        }
      });
    };
    let now = true;
    this.whenLoaded(
      () => this.imagesOf(def.nodes, [def.theme], true),
      () => {
        fill();
        if (!now) this.layoutDebugLabels(container);
      },
      () => !container.destroyed,
    );
    now = false;

    return container;
  }

  layoutDebugLabels(root: Container) {
    if (!this.debugMode) return;

    const debugLabels: { container: Container, rect: Rectangle }[] = [];

    const walk = (node: Container) => {
      if ((node as any).isDebugLabel) {
        const bounds = node.getBounds();
        debugLabels.push({
          container: node,
          rect: new Rectangle(bounds.x, bounds.y, bounds.width, bounds.height)
        });
        
        if (!node.listenerCount('pointerover')) {
           node.eventMode = 'static';
           node.cursor = 'help';
           node.on('pointerover', () => this.showTooltip((node as any).cfNode));
           node.on('pointerout', () => this.hideTooltip());
        }
        return;
      }
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          if ((node.children[i] as any).getBounds) {
            walk(node.children[i] as Container);
          }
        }
      }
    };
    walk(root);

    for (let i = 0; i < debugLabels.length; i++) {
      let rectA = debugLabels[i].rect;
      let overlap = true;
      let attempts = 0;
      while (overlap && attempts < 50) {
        overlap = false;
        for (let j = 0; j < i; j++) {
          let rectB = debugLabels[j].rect;
          // Simple AABB collision
          if (rectA.x < rectB.x + rectB.width &&
            rectA.x + rectA.width > rectB.x &&
            rectA.y < rectB.y + rectB.height &&
            rectA.y + rectA.height > rectB.y) {
            rectA.y = rectB.y + rectB.height + 2;
            overlap = true;
            break;
          }
        }
        attempts++;
      }

      const pos = debugLabels[i].container.getGlobalPosition();
      const deltaY = rectA.y - pos.y;
      debugLabels[i].container.y += deltaY;
    }
  }

  /**
   * Show a page: in the transition given (a gesture action's), else in the
   * page's own (its transition / subtype / time / ease); None: at once.
   */
  navigate(pageName: string, forceOrientation?: 'landscape' | 'portrait', isBack: boolean = false, transition?: Transition) {
    if (pageName.toLowerCase() === "return") {
      const prevPage = this.pageHistory.pop();
      if (prevPage) {
        this.navigate(prevPage, forceOrientation, true, transition);
      } else {
        console.warn("Page history is empty, cannot return.");
      }
      return;
    }

    if (!this.project.pages[pageName]) {
      console.warn("Page not found:", pageName);
      return;
    }

    // its images first: the page is made once they're in (a later navigate goes instead, if one comes meanwhile)
    const token = ++this.navToken;
    // asked again once they're in (a look switched meanwhile names others); one that didn't come after its tries
    // isn't waited for again
    const tried = this.navTried?.page === pageName ? this.navTried.images : new Set<string>();
    const need = this.missing(this.pageImages(pageName)).filter((a) => !tried.has(a));
    this.navTried = need.length ? { page: pageName, images: tried } : undefined;
    need.forEach((a) => tried.add(a));
    if (need.length) {
      const since = this.navTiming?.page === pageName ? this.navTiming.at : performance.now();
      this.navTiming = { page: pageName, at: since, images: need.length, files: this.filesFor(need), loaded: 0 };
      void this.ensureLoaded(need).then(() => {
        if (token !== this.navToken) return;
        if (this.navTiming?.page === pageName) this.navTiming.loaded = performance.now();
        this.navigate(pageName, forceOrientation, isBack, transition);
      });
      return;
    }
    const making = performance.now();
    const waited = this.navTiming?.page === pageName ? this.navTiming : undefined;
    this.navTiming = undefined;

    // Push the current page to history if we are not navigating back and it's a new page
    if (this.currentPageName && this.currentPageName !== pageName && !isBack) {
      this.pageHistory.push(this.currentPageName);
    }

    // Tear down all joinStore listeners from the previous page to prevent accumulation
    if (this.currentPageName) {
      joinStore.clearScope(this.currentPageName);
    }
    // the same page again (the device turned): no flip to animate
    const again = this.currentPageName === pageName;
    this.currentPageName = pageName;
    this.currentScope = pageName;
    this.nodesMap = {};
    this.tagsMap = {};

    if (forceOrientation) {
      this.targetOrientation = forceOrientation;
    }

    const newContainer = new Container();
    const pageObj = this.project.pages[pageName];

    let isLandscape = this.targetOrientation
      ? this.targetOrientation === 'landscape'
      : this.app.screen.width > this.app.screen.height;

    const landscapeEmpty = !pageObj.landscape || pageObj.landscape.length === 0;
    const portraitEmpty = !pageObj.portrait || pageObj.portrait.length === 0;

    if (isLandscape && landscapeEmpty && !portraitEmpty) {
      isLandscape = false;
      this.targetOrientation = 'portrait';
      if (this.onOrientationChange) {
        this.onOrientationChange('portrait');
      }
    } else if (!isLandscape && portraitEmpty && !landscapeEmpty) {
      isLandscape = true;
      this.targetOrientation = 'landscape';
      if (this.onOrientationChange) {
        this.onOrientationChange('landscape');
      }
    }

    // Set hitArea so gestures are caught everywhere
    const pageWidth = isLandscape
      ? (this.project.properties.landscape?.width || Math.max(this.app.screen.width, 1024))
      : (this.project.properties.portrait?.width || Math.max(this.app.screen.width, 768));
    const pageHeight = isLandscape
      ? (this.project.properties.landscape?.height || Math.max(this.app.screen.height, 768))
      : (this.project.properties.portrait?.height || Math.max(this.app.screen.height, 1024));
    newContainer.hitArea = new Rectangle(0, 0, pageWidth, pageHeight);

    // Sync global CF orientation state and currentPage
    if (this.cfApi) {
      const turned = this.cfApi.currentOrientation;
      this.cfApi.currentOrientation = isLandscape
        ? this.cfApi.LandscapeOrientation
        : this.cfApi.PortraitOrientation;
      // as iViewer: (the page left - none at first -, the page shown, the orientation); the same page
      // shown again in the other orientation (the device turned): OrientationChangeEvent (the page, the orientation)
      const from = this.cfApi.currentPage === 'CURRENT_PAGE' ? null : this.cfApi.currentPage;
      this.cfApi.currentPage = pageName;
      if (from !== pageName) this.cfApi.dispatchEvent(this.cfApi.PageFlipEvent, from, pageName, this.cfApi.currentOrientation);
      else if (turned !== this.cfApi.currentOrientation) this.cfApi.dispatchEvent(this.cfApi.OrientationChangeEvent, pageName, this.cfApi.currentOrientation);
    }

    const nodes = (isLandscape && pageObj.landscape) ? pageObj.landscape : (pageObj.portrait || pageObj.landscape || []);
    const themeName = (isLandscape && pageObj.landscapeTheme) ? pageObj.landscapeTheme : pageObj.portraitTheme;

    if (themeName) {
      const theme = this.project.themes[themeName];
      if (theme) {
        const css = theme.states["0"];
        const width = isLandscape
          ? (this.project.properties.landscape?.width || 1024)
          : (this.project.properties.portrait?.width || 768);
        const height = isLandscape
          ? (this.project.properties.landscape?.height || 768)
          : (this.project.properties.portrait?.height || 1024);

        this.themeBackground(newContainer, css, width, height);
      }
    }

    const gestureNodes = nodes.filter(n => n.type === 'gesture');
    if (gestureNodes.length > 0) {
      const j = pageObj.attributes?.j;
      bindGestures(newContainer, gestureNodes, this, { join: j && j !== '0' ? `d${j}` : null, capture: true });
    }

    nodes.forEach(n => {
      if (n.type !== 'gesture') {
        newContainer.addChild(this.createNode(n));
      }
    });

    const a = pageObj.attributes ?? {};
    const own: Transition = { type: a.transition, subtype: a.subtype, time: parseFloat(a.time || '0') || 0, ease: a.ease };
    this.flip(this.currentContainer, newContainer, again ? {} : transition ?? own, pageWidth, pageHeight);
    this.layoutDebugLabels(newContainer);
    this.currentContainer = newContainer;
    // the page before gone (its transition over): what nothing shows any more let go; then the pages after
    this.scheduleCollect();
    this.schedulePrefetch();
    // how long the flip took: the wait for its images, making the page, and its first frame drawn (the
    // textures uploaded) - a slow device's trouble told apart
    const made = performance.now();
    const report = (shown: number) =>
      console.info(`[cf navigate] ${pageName}: images ${waited ? Math.round(waited.loaded - waited.at) : 0} ms (${waited?.images ?? 0} in ${waited?.files ?? 0} files), made ${Math.round(made - making)} ms, shown ${Math.round(shown - making)} ms`);
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => report(performance.now()));
    else report(made);
  }

  /** a gesture action's transition: for the subpages it shows or hides as it runs */
  transitionOverride?: Transition;

  /** pages on their way out (a transition): gone at once when the next flip comes */
  private leaving = new Set<Container>();

  /**
   * One page to the next, as iViewer's transitions go: fade - the new one
   * fades in over the old; moveIn - it slides in over it from the subtype's
   * side; push - it slides in pushing the old one out the other side;
   * reveal - the old one slides away, showing the new one under it.
   */
  private flip(old: Container | null | undefined, page: Container, t: Transition, W: number, H: number) {
    const stage = this.app.stage;
    for (const gone of this.leaving) {
      killTweensOf(gone);
      if (!gone.destroyed) gone.destroy({ children: true });
    }
    this.leaving.clear();
    if (old) {
      killTweensOf(old);
      old.alpha = 1;
      old.x = 0;
      old.y = 0;
    }
    const type = (t.type ?? '').toLowerCase();
    if (!old || !animates(t)) {
      stage.addChild(page);
      if (old && !old.destroyed) old.destroy({ children: true });
      return;
    }
    // the page going: no touches on it meanwhile
    old.eventMode = 'none';
    old.interactiveChildren = false;
    this.leaving.add(old);
    const done = () => {
      this.leaving.delete(old);
      if (!old.destroyed) old.destroy({ children: true });
    };
    const opts = { duration: t.time!, ease: transitionEase(t.ease) };
    const side = transitionSide(t.subtype);
    const from = { x: side.x * W, y: side.y * H };
    if (type === 'reveal') {
      stage.addChildAt(page, stage.getChildIndex(old));
      trackAnimation(old, animateFrom(old, { x: -from.x, y: -from.y }, opts)).finished.then(done, done);
      return;
    }
    stage.addChild(page);
    if (type === 'movein' || type === 'push') {
      page.x = from.x;
      page.y = from.y;
      trackAnimation(page, animateFrom(page, { x: 0, y: 0 }, opts));
      if (type === 'push') trackAnimation(old, animateFrom(old, { x: -from.x, y: -from.y }, opts)).finished.then(done, done);
      else setTimeout(done, t.time! * 1000);
      return;
    }
    // fade (and what else a .gui may name)
    page.alpha = 0;
    trackAnimation(page, animateFrom(page, { alpha: 1 }, opts)).finished.then(done, done);
  }

  /** `onImages`: the first page's images in, so many of so many (a loading screen's progress) */
  /** how start() went: ms for the images known (Assets), the first page's in, and made */
  startTimes: { assets: number; images: number; made: number } = { assets: 0, images: 0, made: 0 };

  /** The page start() shows: CF.loadGUI(url, { startPage })'s, if the GUI has it, else the GUI's own. */
  private firstPage(): string | undefined {
    return this.startPage && this.project.pages[this.startPage]
      ? this.startPage
      : this.project.startPage || Object.keys(this.project.pages)[0];
  }

  /**
   * The first page's images on their way in (decoded by Pixi's workers) while
   * the GUI's scripts run - start() waits for them, and for any a look the
   * scripts switch to names.
   */
  prefetchFirst() {
    const first = this.firstPage();
    if (!first) return;
    this.uploadOnLoad = true;
    void this.loadAssets();
    void this.ensureLoaded(this.pageImages(first));
  }

  async start(onImages?: (done: number, total: number) => void) {
    this.pageHistory = [];
    this.initStore();
    let at = performance.now();
    const lap = () => {
      const now = performance.now();
      const ms = Math.round(now - at);
      at = now;
      return ms;
    };
    await this.loadAssets();
    this.startTimes.assets = lap();
    const first = this.firstPage();
    if (!first) return;
    // the first page's images in before start() is done: the page is there when the scripts run
    this.uploadOnLoad = true;
    await this.ensureLoaded(this.pageImages(first), onImages);
    this.uploadOnLoad = false;
    this.startTimes.images = lap();
    this.navigate(first);
    this.startTimes.made = lap();
  }
}

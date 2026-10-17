import { Application, Container, Sprite, Text, Graphics, Assets, TextStyle, Color, NineSliceSprite, Rectangle, TilingSprite, type Texture } from 'pixi.js';
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
  /** the host loads another GUI (CF.loadGUI; see LoadProjectOptions.loadGui) */
  loadGui?: (url: string, settings: Record<string, unknown>) => void;
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

      this.fpsTicker = () => {
        if (this.fpsText && this.fpsBg && this.fpsContainer) {
          this.fpsText.text = `FPS: ${Math.round(this.app.ticker.FPS)}`;

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

  async loadAssets() {
    const promises = Object.entries(this.imageMap).map(async ([filename, url]) => {
      try {
        Assets.add({ alias: filename, src: url, parser: 'loadTextures' });
        await Assets.load(filename);
      } catch (e) {
        console.error("Failed to load asset:", filename, e);
      }
    });
    await Promise.all(promises);
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

        if (change.w !== undefined) targetProps.width = change.w;
        if (change.h !== undefined) targetProps.height = change.h;

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
          if (scaled) trackAnimation(c.scale, animateFrom(c.scale, { x: to.x, y: to.y }, { duration, delay, ease }, c));
        } else {
          if (targetProps.angle !== undefined) c.angle = targetProps.angle;
          if (targetProps.alpha !== undefined) c.alpha = targetProps.alpha;
          if (targetProps.x !== undefined) c.x = targetProps.x;
          if (targetProps.y !== undefined) c.y = targetProps.y;
          if (targetProps.width !== undefined) c.width = targetProps.width;
          if (targetProps.height !== undefined) c.height = targetProps.height;
          if (scaled) c.scale.set(to.x, to.y);
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
  retheme(c: Container, theme: string) {
    const made = (c as any).cfMade as { node: CFNode; listPrefix?: string; listIndex?: number } | undefined;
    const parent = c.parent;
    if (!made || !parent || (c as any).cfNode?.t === theme) return;
    const at = parent.getChildIndex(c);
    const fresh = this.createNode({ ...made.node, t: theme }, made.listPrefix, made.listIndex);
    parent.addChildAt(fresh, at);
    parent.removeChild(c);
    c.destroy({ children: true });
  }

  /** A URL as the GUI gives it, made loadable here: project files by name, anything with a scheme as is. */
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
    const name = ref.replace(/\\/g, '/');
    const leaf = name.split('/').pop() || name;
    const keys = Object.keys(this.imageMap);
    const tries = [name, keys.find((k) => k.toLowerCase() === name.toLowerCase()), leaf, keys.find((k) => k.toLowerCase() === leaf.toLowerCase())];
    return tries.find((k): k is string => !!k && Assets.cache.has(k));
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
    const possibleKeys = Object.keys(this.imageMap);
    // as the .gui names it (a path in its image folder: icons/x.png), then by file name
    if (Assets.get(url)) return url;
    const fullKey = possibleKeys.find(k => k.toLowerCase() === url.toLowerCase());
    if (fullKey) return fullKey;
    const fileName = url.split('/').pop() || url;

    if (Assets.get(fileName)) return fileName;
    const foundKey = possibleKeys.find(k => k.toLowerCase() === fileName.toLowerCase());
    return foundKey || fileName;
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
    const tags = this.objectTags(own && listPrefix ? `${listPrefix}:${listIndex}:${own}` : own, node);
    for (const tag of tags) if (this.themeOf[tag]) node.t = this.themeOf[tag];
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
        if (storeVal.w !== undefined) container.width = storeVal.w;
        if (storeVal.h !== undefined) container.height = storeVal.h;

        let xScaleTarget = storeVal.xscale !== undefined ? storeVal.xscale : (storeVal.scale !== undefined ? storeVal.scale : undefined);
        let yScaleTarget = storeVal.yscale !== undefined ? storeVal.yscale : (storeVal.scale !== undefined ? storeVal.scale : undefined);
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

    // Theme
    if (def.theme) {
      const theme = this.project.themes[def.theme];
      if (theme) this.themeBackground(container, theme.states["0"], def.w, def.h);
    }

    // Nodes
    const gestureNodes = def.nodes.filter(n => n.type === 'gesture');
    if (gestureNodes.length > 0) {
      const inList = !!listPrefix && listIndex !== undefined && listIndex !== -1;
      bindGestures(container, gestureNodes, this, { join: join ?? null, list: inList ? listPrefix : null, listIndex: inList ? listIndex : null, capture: true });
    }

    def.nodes.forEach(n => {
      if (n.type !== 'gesture') {
        container.addChild(this.createNode(n, listPrefix, listIndex));
      }
    });

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

  async start() {
    this.pageHistory = [];
    this.initStore();
    await this.loadAssets();
    // CF.loadGUI(url, { startPage }): that page, if the GUI has it
    if (this.startPage && this.project.pages[this.startPage]) {
      this.navigate(this.startPage);
    } else if (this.project.startPage) {
      this.navigate(this.project.startPage);
    } else {
      const firstPage = Object.keys(this.project.pages)[0];
      if (firstPage) this.navigate(firstPage);
    }
  }
}

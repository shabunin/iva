import { Application, Container, Sprite, Text, Graphics, Assets, TextStyle, Color, NineSliceSprite, Rectangle } from 'pixi.js';
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
import { renderInput } from './components/Input';
import { DomLayer } from './domLayer';
import { bindGestures } from './components/Gestures';

// Pixi containers/points aren't DOM, so there's no WAAPI/getAnimations() to lean
// on for "stop whatever is currently animating this" or "stop everything on
// teardown" — track it ourselves, same as GSAP did internally.
const activeAnimations = new Set<AnimationPlaybackControlsWithThen>();
const animsByTarget = new WeakMap<object, Set<AnimationPlaybackControlsWithThen>>();

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
  pageHistory: string[] = [];
  cfApi?: any; // Reference to the CF API instance for components to use without accessing window.CF
  /**
   * A project file's URL (a web view's `url="page.html"`, url() in an input
   * theme). Default: the image map's URL for that name, else the name as is.
   */
  fileUrl?: (name: string) => string | undefined;
  fpsContainer?: Container;
  fpsText?: Text;
  fpsBg?: Graphics;
  fpsTicker?: () => void;

  tooltipContainer?: Container;
  tooltipText?: Text;
  tooltipBg?: Graphics;

  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  constructor(app: Application, project: CFProject, imageMap: Record<string, string>) {
    this.app = app;
    this.project = project;
    this.imageMap = imageMap;
  }

  initStore() {
    joinStore.clear();
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

  setDebugMode(val: boolean) {
    this.debugMode = val;
    
    if (val) {
      if (!this.fpsContainer) {
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
      this.fpsContainer.visible = true;

      // Add DOM event listeners for Pan & Zoom
      if (this.app.canvas) {
        this.app.canvas.addEventListener('wheel', this.onWheel);
        this.app.canvas.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
      }

    } else {
      if (this.fpsContainer) {
        this.fpsContainer.visible = false;
      }
      // Remove DOM event listeners
      if (this.app.canvas) {
        this.app.canvas.removeEventListener('wheel', this.onWheel);
        this.app.canvas.removeEventListener('pointerdown', this.onPointerDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
      }
      
      if (this.tooltipContainer) {
        this.tooltipContainer.visible = false;
      }
    }

    if (this.currentPageName) {
      this.navigate(this.currentPageName, this.targetOrientation);
    }
  }

  // Camera Handlers
  private onWheel = (e: WheelEvent) => {
    if (!this.debugMode || !this.currentContainer) return;
    if (e.ctrlKey) {
      e.preventDefault(); // Stop browser zoom
      const zoomFactor = 1.1;
      const direction = e.deltaY > 0 ? (1 / zoomFactor) : zoomFactor;
      
      const rect = this.app.canvas.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;
      
      const localX = (pointerX - this.currentContainer.x) / this.currentContainer.scale.x;
      const localY = (pointerY - this.currentContainer.y) / this.currentContainer.scale.y;

      this.currentContainer.scale.x *= direction;
      this.currentContainer.scale.y *= direction;

      this.currentContainer.x = pointerX - localX * this.currentContainer.scale.x;
      this.currentContainer.y = pointerY - localY * this.currentContainer.scale.y;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.debugMode || !this.currentContainer) return;
    if (e.button === 1) { // Middle mouse
      e.preventDefault();
      this.isPanning = true;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
      this.app.canvas.style.cursor = 'grabbing';
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.isPanning && this.currentContainer) {
      const dx = e.clientX - this.lastPanX;
      const dy = e.clientY - this.lastPanY;
      this.currentContainer.x += dx;
      this.currentContainer.y += dy;
      this.lastPanX = e.clientX;
      this.lastPanY = e.clientY;
    }
    
    // Update tooltip position if visible
    if (this.tooltipContainer && this.tooltipContainer.visible) {
      const rect = this.app.canvas.getBoundingClientRect();
      let posX = e.clientX - rect.left + 15;
      let posY = e.clientY - rect.top + 15;
      
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

  private onPointerUp = (e: PointerEvent) => {
    if (e.button === 1 && this.isPanning) {
      this.isPanning = false;
      this.app.canvas.style.cursor = 'auto';
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
    if (this.app && this.app.canvas) {
      this.app.canvas.removeEventListener('wheel', this.onWheel);
      this.app.canvas.removeEventListener('pointerdown', this.onPointerDown);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
    }
    if (this.app) {
      try {
        this.app.destroy({ removeView: false }, { children: true });
      } catch (e) {
        console.error("Failed to destroy app:", e);
      }
    }
  }

  async loadAssets() {
    console.log("Starting loadAssets:", Object.keys(this.imageMap).length, "files");
    const promises = Object.entries(this.imageMap).map(async ([filename, url]) => {
      try {
        console.log("Loading asset:", filename, "with URL:", url);

        // DEBUG: Test raw DOM Image loading for asset://
        // if (url.startsWith('asset:')) {
        //     console.log("Testing raw DOM Image for:", url);
        //     await new Promise((resolve, reject) => {
        //         const img = new Image();
        //         img.onload = () => {
        //             console.log("DOM Image loaded successfully for:", url);
        //             resolve(true);
        //         };
        //         img.onerror = (e) => {
        //             console.error("DOM Image failed to load for:", url, e);
        //             reject(new Error("DOM Image failed"));
        //         };
        //         img.src = url;
        //     }).catch(e => console.error("Raw image test error:", e));
        // }

        Assets.add({ alias: filename, src: url, parser: 'loadTextures' });
        await Assets.load(filename);
        console.log("Successfully loaded asset:", filename);
      } catch (e) {
        console.error("Failed to load asset:", filename, e);
      }
    });
    await Promise.all(promises);
    console.log("Finished loadAssets");
  }

  applyProperties(changesArray: any[], delay: number = 0, duration: number = 0, curve: string = "linear") {
    changesArray.forEach(change => {
      const join = change.join;
      if (!join) return;
      const containers = this.nodesMap[join];
      if (!containers) return;

      const activeContainers = containers.filter(c => !c.destroyed);
      if (activeContainers.length === 0) {
        delete this.nodesMap[join];
        return;
      }
      this.nodesMap[join] = activeContainers;

      let ease: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' = "linear";
      if (curve === "easein") ease = "easeIn";
      else if (curve === "easeout") ease = "easeOut";
      else if (curve === "easeinout") ease = "easeInOut";

      activeContainers.forEach(c => {
        const targetProps: any = {};
        if (change.zrotation !== undefined) targetProps.angle = change.zrotation;
        if (change.opacity !== undefined) targetProps.alpha = Math.max(0, Math.min(1, change.opacity));

        // X and Y are offset by pivot!
        if (change.x !== undefined) targetProps.x = change.x + c.pivot.x;
        if (change.y !== undefined) targetProps.y = change.y + c.pivot.y;

        if (change.w !== undefined) targetProps.width = change.w;
        if (change.h !== undefined) targetProps.height = change.h;

        let xScaleTarget = change.xscale !== undefined ? change.xscale : (change.scale !== undefined ? change.scale : undefined);
        let yScaleTarget = change.yscale !== undefined ? change.yscale : (change.scale !== undefined ? change.scale : undefined);

        if (duration > 0 || delay > 0) {
          if (Object.keys(targetProps).length > 0) {
            trackAnimation(c, animate(c, targetProps, { duration, delay, ease }));
          }
          if (xScaleTarget !== undefined) trackAnimation(c.scale, animate(c.scale, { x: xScaleTarget }, { duration, delay, ease }));
          if (yScaleTarget !== undefined) trackAnimation(c.scale, animate(c.scale, { y: yScaleTarget }, { duration, delay, ease }));
        } else {
          if (targetProps.angle !== undefined) c.angle = targetProps.angle;
          if (targetProps.alpha !== undefined) c.alpha = targetProps.alpha;
          if (targetProps.x !== undefined) c.x = targetProps.x;
          if (targetProps.y !== undefined) c.y = targetProps.y;
          if (targetProps.width !== undefined) c.width = targetProps.width;
          if (targetProps.height !== undefined) c.height = targetProps.height;
          if (xScaleTarget !== undefined) c.scale.x = xScaleTarget;
          if (yScaleTarget !== undefined) c.scale.y = yScaleTarget;
        }
      });
    });
  }

  /** A URL as the GUI gives it, made loadable here: project files by name, anything with a scheme as is. */
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
    const fileName = url.replace(/\\/g, '/').split('/').pop() || url;

    if (Assets.get(fileName)) return fileName;
    const possibleKeys = Object.keys(this.imageMap);
    const foundKey = possibleKeys.find(k => k.toLowerCase() === fileName.toLowerCase());
    return foundKey || fileName;
  }

  createNode(node: CFNode, listPrefix?: string, listIndex?: number): Container {
    node = { ...node }; // clone to avoid mutating original
    let registeredJoin: string | null = null;

    const resolveJoin = (j: string | undefined): string | undefined => {
      if (!j || j === "0") return j;
      if (listPrefix) return `${listPrefix}:${listIndex}:${j}`;
      return j;
    };
    node.j = resolveJoin(node.j);

    const container = new Container();
    (container as any).cfNode = node;
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
        bindGestures(container, gestures);
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

  createSubpage(def: CFSubpage, listPrefix?: string, listIndex?: number): Container {
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
      if (theme) {
        const css = theme.states["0"];
        if (css?.["background-color"]) {
          const colorStr = css["background-color"];
          if (colorStr.toLowerCase() !== 'transparent') {
            const bgGfx = new Graphics();
            bgGfx.rect(0, 0, def.w, def.h);
            bgGfx.fill({ color: colorStr });
            container.addChild(bgGfx);
          }
        }

        const bgImg = this.getBgImage(css?.["background-image"]);
        if (bgImg && Assets.get(bgImg)) {
          const bgSprite = new Sprite(Assets.get(bgImg));
          bgSprite.width = def.w;
          bgSprite.height = def.h;
          container.addChild(bgSprite);
        }
      }
    }

    // Nodes
    const gestureNodes = def.nodes.filter(n => n.type === 'gesture');
    if (gestureNodes.length > 0) {
      bindGestures(container, gestureNodes);
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

  navigate(pageName: string, forceOrientation?: 'landscape' | 'portrait', isBack: boolean = false) {
    if (pageName.toLowerCase() === "return") {
      const prevPage = this.pageHistory.pop();
      if (prevPage) {
        this.navigate(prevPage, forceOrientation, true);
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
    this.currentPageName = pageName;
    this.currentScope = pageName;
    this.nodesMap = {};

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
      this.cfApi.currentOrientation = isLandscape
        ? this.cfApi.LandscapeOrientation
        : this.cfApi.PortraitOrientation;
      this.cfApi.currentPage = pageName;
      this.cfApi.dispatchEvent(this.cfApi.PageFlipEvent, pageName);
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

        if (css?.["background-color"]) {
          const colorStr = css["background-color"];
          if (colorStr.toLowerCase() !== 'transparent') {
            const bgGfx = new Graphics();
            bgGfx.rect(0, 0, width, height);
            bgGfx.fill({ color: colorStr });
            newContainer.addChild(bgGfx);
          }
        }

        const bgImg = this.getBgImage(css?.["background-image"]);
        if (bgImg && Assets.get(bgImg)) {
          const bgSprite = new Sprite(Assets.get(bgImg));
          bgSprite.width = width;
          bgSprite.height = height;
          newContainer.addChild(bgSprite);
        }
      }
    }

    const gestureNodes = nodes.filter(n => n.type === 'gesture');
    if (gestureNodes.length > 0) {
      bindGestures(newContainer, gestureNodes);
    }

    nodes.forEach(n => {
      if (n.type !== 'gesture') {
        newContainer.addChild(this.createNode(n));
      }
    });

    if (this.currentContainer) {
      const old = this.currentContainer;
      newContainer.alpha = 0;
      this.app.stage.addChild(newContainer);
      this.layoutDebugLabels(newContainer);

      killTweensOf(old);
      trackAnimation(old, animate(old, { alpha: 0 }, { duration: 0.3 })).finished.then(() => {
        if (!old.destroyed) {
          this.app.stage.removeChild(old);
          old.destroy({ children: true });
        }
      }, () => {});
      trackAnimation(newContainer, animate(newContainer, { alpha: 1 }, { duration: 0.3 }));
    } else {
      this.app.stage.addChild(newContainer);
      this.layoutDebugLabels(newContainer);
    }
    this.currentContainer = newContainer;
  }

  async start() {
    this.pageHistory = [];
    this.initStore();
    await this.loadAssets();
    if (this.project.startPage) {
      this.navigate(this.project.startPage);
    } else {
      const firstPage = Object.keys(this.project.pages)[0];
      if (firstPage) this.navigate(firstPage);
    }
  }
}

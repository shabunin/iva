import type { Application } from 'pixi.js';
import type { CFRenderer } from '../renderer';

export type MenuOrientation = 'landscape' | 'portrait';

const STYLE_ID = 'iva-runtime-menu-styles';

/**
 * Shell / host-owned actions the toolbar cannot do alone.
 * Keep Tauri / file pickers / page reload out of cf-runtime.
 */
export interface RuntimeMenuHost {
  openNative?: () => void | Promise<void>;
  openZip?: () => void | Promise<void>;
  /** Default: stopSystems + location.reload */
  reload?: () => void | Promise<void>;
  /** e.g. Tauri set_devtools toggle */
  toggleDevtools?: () => void | Promise<void>;
}

/**
 * - `bar` — a toolbar strip **above** the canvas (no GUI overlap). Default.
 * - `overlay` — a floating toolbar over the canvas.
 */
export type RuntimeMenuPlacement = 'bar' | 'overlay';

export interface RuntimeMenuOptions {
  /**
   * Where the toolbar is attached.
   * For `bar`: a dedicated chrome host **outside** the canvas box.
   * For `overlay`: typically the canvas wrapper.
   */
  mount: HTMLElement;
  /** Element used for Fullscreen API (defaults to mount). Prefer the canvas box only. */
  fullscreenTarget?: HTMLElement;
  renderer: CFRenderer;
  app: Application;
  host?: RuntimeMenuHost;
  initialOrientation?: MenuOrientation;
  initialDebug?: boolean;
  onOrientationChange?: (o: MenuOrientation) => void;
  onDebugChange?: (debug: boolean) => void;
  /** Fired when the toolbar is shown/hidden (Ctrl+M). */
  onVisibilityChange?: (visible: boolean) => void;
  /** Initial visibility; default true. Toggle anytime with Ctrl+M. */
  visible?: boolean;
  /** Default: `bar` (does not cover the rendered GUI). */
  placement?: RuntimeMenuPlacement;
  /**
   * What zoom and the hand tool move: the canvas's parent by default (the
   * canvas with the web views and fields over it); its parent clips it.
   */
  viewport?: HTMLElement;
}

type MenuActionId =
  | 'open_native'
  | 'open_zip'
  | 'reload'
  | 'devtools'
  | 'outline'
  | 'fps'
  | 'fullscreen'
  | 'landscape'
  | 'portrait'
  | 'zoom_in'
  | 'zoom_out'
  | 'zoom_fit'
  | 'hand';

/** 24x24 line icons (stroke: currentColor). */
const ICONS: Record<string, string> = {
  open_native: '<path d="M3 6.5h6l2 2h10V19H3z"/>',
  open_zip: '<path d="M3 6.5h6l2 2h10V19H3z"/><path d="M12 11v2m0 2v2"/>',
  reload: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  landscape: '<rect x="3" y="6.5" width="18" height="11" rx="2"/><path d="M17.5 12h.01"/>',
  portrait: '<rect x="6.5" y="3" width="11" height="18" rx="2"/><path d="M12 17.5h.01"/>',
  outline: '<rect x="4" y="4" width="16" height="16" rx="1.5" stroke-dasharray="3 2.5"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  devtools: '<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5"/>',
  zoom_in: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9M10.5 7.5v6M7.5 10.5h6"/>',
  zoom_out: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9M7.5 10.5h6"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11.5V4a1.5 1.5 0 0 1 3 0v7.5M14 11.5V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-3.9-1.9L3.7 15a1.5 1.5 0 0 1 2.3-1.9L8 15.2"/>',
};

/** what each button does, its shortcut */
const TITLES: Record<string, string> = {
  open_native: 'Open… (⌘/Ctrl+O)',
  open_zip: 'Open a .gui.zip…',
  reload: 'Reload (⌘/Ctrl+R)',
  landscape: 'Landscape (⌘/Ctrl+1)',
  portrait: 'Portrait (⌘/Ctrl+2)',
  outline: 'Outline: element bounds, names on hover, pan & zoom (⌘/Ctrl+Shift+O)',
  fps: 'Frame rate in the corner (⌘/Ctrl+Shift+F)',
  fullscreen: 'Fullscreen (F11)',
  devtools: 'DevTools (⌘/Ctrl+Shift+I)',
  zoom_in: 'Zoom in (⌘/Ctrl+= or Ctrl+wheel)',
  zoom_out: 'Zoom out (⌘/Ctrl+-)',
  zoom_fit: 'Fit / 100% (⌘/Ctrl+0: fit)',
  hand: 'Hand: drag to move the view (H, or hold Space)',
};

/** a viewer's choices, kept across reloads (the preview reloads on every save) */
const remembered = {
  get(key: string): boolean {
    try {
      return localStorage.getItem(`iva.${key}`) === '1';
    } catch {
      return false;
    }
  },
  set(key: string, on: boolean) {
    try {
      localStorage.setItem(`iva.${key}`, on ? '1' : '0');
    } catch {
      // storage off: just not remembered
    }
  },
};

/**
 * The preview's toolbar: icon buttons for reload, orientation, outline,
 * fullscreen (and what the host adds: open, DevTools) and an FPS box.
 * Pure DOM — no React, no @tauri-apps. Ctrl+M hides it.
 */
export class RuntimeMenu {
  private readonly opts: RuntimeMenuOptions;
  private root: HTMLElement | null = null;
  private chromeVisible: boolean;
  private orientation: MenuOrientation;
  private destroyed = false;
  /** zoom (1 = the panel fits the stage) and the view's offset in the stage, CSS px */
  private zoom = 1;
  private tx = 0;
  private ty = 0;
  private hand = false;
  private spaceHand = false;
  private handLayer: HTMLElement | null = null;
  private drag: { x: number; y: number; tx: number; ty: number; pointer: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.destroyed) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    const act = (id: MenuActionId) => {
      e.preventDefault();
      void this.run(id);
    };

    // Always available — show/hide the toolbar
    if (mod && key === 'm') {
      e.preventDefault();
      this.setVisible(!this.chromeVisible);
      return;
    }
    if (mod && e.shiftKey && key === 'o') return act('outline');
    if (mod && e.shiftKey && key === 'f') return act('fps');
    if (mod && e.shiftKey && key === 'i') return act('devtools');
    if (mod && key === 'o') return act('open_native');
    if (mod && key === 'r') return act('reload');
    if (mod && key === '1') return act('landscape');
    if (mod && key === '2') return act('portrait');
    if (mod && (key === '=' || key === '+')) return act('zoom_in');
    if (mod && key === '-') return act('zoom_out');
    if (mod && key === '0') {
      e.preventDefault();
      this.setZoom(1);
      return;
    }
    if (e.key === 'F11') return act('fullscreen');
    // the hand: H toggles it, Space holds it (not while typing)
    if (!mod && !e.altKey && !typing(e.target)) {
      if (key === 'h' && !e.repeat) return act('hand');
      if (e.key === ' ' && !this.spaceHand) {
        e.preventDefault();
        this.spaceHand = true;
        this.syncHand();
      }
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ' && this.spaceHand) {
      this.spaceHand = false;
      this.syncHand();
    }
  };

  /** Ctrl+wheel over the panel: zoom about the pointer */
  private readonly onWheel = (e: WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const box = this.stageBox();
    if (!box) return;
    this.zoomAt(this.zoom * Math.exp(-e.deltaY * 0.0025), e.clientX - box.left, e.clientY - box.top);
  };

  private readonly onFullscreenChange = () => {
    this.syncState();
  };

  constructor(opts: RuntimeMenuOptions) {
    this.opts = opts;
    this.orientation = opts.initialOrientation ?? opts.renderer.targetOrientation ?? 'landscape';
    this.chromeVisible = opts.visible !== false;
    ensureStyles();
    // what the viewer had on before this load
    if (remembered.get('outline') && !opts.renderer.debugMode) {
      opts.renderer.setDebugMode(true);
      opts.onDebugChange?.(true);
    }
    if (remembered.get('fps')) opts.renderer.setShowFps(true);
    this.mountUi();
    this.applyVisibility();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
    this.mountViewport();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.stage()?.removeEventListener('wheel', this.onWheel);
    this.resizeObserver?.disconnect();
    this.handLayer?.remove();
    this.root?.remove();
    this.root = null;
  }

  // ── zoom and the hand ────────────────────────────────────────────

  private viewport(): HTMLElement | null {
    return this.opts.viewport ?? this.opts.app.canvas.parentElement;
  }

  /** what clips the view: the viewport's parent */
  private stage(): HTMLElement | null {
    return this.viewport()?.parentElement ?? null;
  }

  private stageBox(): DOMRect | null {
    return this.stage()?.getBoundingClientRect() ?? null;
  }

  private mountViewport(): void {
    const view = this.viewport();
    const stage = this.stage();
    if (!view || !stage) return;
    stage.style.overflow = 'hidden';
    if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';
    view.style.transformOrigin = '0 0';
    // over the panel while the hand is on: the GUI gets no touches, the view moves
    const layer = document.createElement('div');
    layer.className = 'iva-rt-hand';
    Object.assign(layer.style, { position: 'absolute', inset: '0', zIndex: '5', display: 'none', cursor: 'grab', touchAction: 'none' });
    layer.addEventListener('pointerdown', (e) => this.startDrag(e));
    stage.appendChild(layer);
    this.handLayer = layer;
    // the middle button moves the view too, hand or not
    stage.addEventListener('pointerdown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.startDrag(e);
      }
    }, true);
    stage.addEventListener('wheel', this.onWheel, { passive: false });
    // a new stage size (window, fullscreen): keep the view within it
    this.resizeObserver = new ResizeObserver(() => this.applyView());
    this.resizeObserver.observe(stage);
    this.applyView();
  }

  private startDrag(e: PointerEvent): void {
    const target = e.currentTarget as HTMLElement;
    this.drag = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, pointer: e.pointerId };
    target.setPointerCapture?.(e.pointerId);
    if (this.handLayer) this.handLayer.style.cursor = 'grabbing';
    const move = (m: PointerEvent) => {
      if (!this.drag || m.pointerId !== this.drag.pointer) return;
      this.tx = this.drag.tx + (m.clientX - this.drag.x);
      this.ty = this.drag.ty + (m.clientY - this.drag.y);
      this.applyView();
    };
    const up = (u: PointerEvent) => {
      if (!this.drag || u.pointerId !== this.drag.pointer) return;
      this.drag = null;
      if (this.handLayer) this.handLayer.style.cursor = 'grab';
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  private syncHand(): void {
    const on = this.hand || this.spaceHand;
    if (this.handLayer) this.handLayer.style.display = on ? '' : 'none';
    this.syncState();
  }

  /** zoom to `z`, keeping the point (x, y) of the stage (CSS px) where it is */
  private zoomAt(z: number, x: number, y: number): void {
    const next = Math.min(8, Math.max(0.25, z));
    this.tx = x - (x - this.tx) * (next / this.zoom);
    this.ty = y - (y - this.ty) * (next / this.zoom);
    this.zoom = next;
    this.applyView();
  }

  private setZoom(z: number): void {
    const box = this.stageBox();
    if (!box) return;
    if (z === 1) {
      this.zoom = 1;
      this.tx = this.ty = 0;
      this.applyView();
      return;
    }
    this.zoomAt(z, box.width / 2, box.height / 2);
  }

  /** the panel's pixels per CSS pixel: 1 at 100 % */
  private scale(): number {
    const stage = this.stage();
    const w = this.opts.app.screen.width || 1;
    return stage ? (stage.clientWidth * this.zoom) / w : this.zoom;
  }

  /** the transform, the view kept in the stage (centred while smaller), the zoom shown */
  private applyView(): void {
    const view = this.viewport();
    const stage = this.stage();
    if (!view || !stage) return;
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const cw = w * this.zoom;
    const ch = h * this.zoom;
    this.tx = cw <= w ? (w - cw) / 2 : Math.min(0, Math.max(w - cw, this.tx));
    this.ty = ch <= h ? (h - ch) / 2 : Math.min(0, Math.max(h - ch, this.ty));
    view.style.transform = this.zoom === 1 && !this.tx && !this.ty ? '' : `translate(${this.tx}px, ${this.ty}px) scale(${this.zoom})`;
    const label = this.root?.querySelector<HTMLElement>('[data-action="zoom_fit"]');
    if (label) label.textContent = `${Math.round(this.scale() * 100)}%`;
  }

  getOrientation(): MenuOrientation {
    return this.orientation;
  }

  /** the panel turned without the toolbar (a GUI with one orientation): show it */
  followOrientation(o: MenuOrientation): void {
    this.orientation = o;
    this.syncState();
  }

  isDebug(): boolean {
    return !!this.opts.renderer.debugMode;
  }

  /** Whether the toolbar is shown. */
  isVisible(): boolean {
    return this.chromeVisible;
  }

  setVisible(visible: boolean): void {
    if (this.destroyed || this.chromeVisible === visible) return;
    this.chromeVisible = visible;
    this.applyVisibility();
    this.opts.onVisibilityChange?.(visible);
  }

  toggleVisible(): boolean {
    this.setVisible(!this.chromeVisible);
    return this.chromeVisible;
  }

  private applyVisibility(): void {
    if (!this.root) return;
    this.root.hidden = !this.chromeVisible;
    this.root.style.display = this.chromeVisible ? '' : 'none';
    this.root.setAttribute('aria-hidden', this.chromeVisible ? 'false' : 'true');
  }

  private mountUi(): void {
    const placement = this.opts.placement ?? 'bar';
    const mount = this.opts.mount;
    const host = this.opts.host ?? {};

    // Overlay needs a positioned ancestor; bar lives in normal document flow.
    if (placement === 'overlay' && getComputedStyle(mount).position === 'static') {
      mount.style.position = 'relative';
    }

    const root = document.createElement('div');
    root.className = `iva-rt-menu iva-rt-menu--${placement}`;
    root.setAttribute('data-iva-chrome', 'runtime-menu');
    root.setAttribute('data-placement', placement);

    const bar = document.createElement('div');
    bar.className = 'iva-rt-menu__bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Preview');

    const button = (id: MenuActionId, toggle = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'iva-rt-menu__btn';
      b.dataset.action = id;
      b.title = TITLES[id];
      b.setAttribute('aria-label', TITLES[id].replace(/ \(.*\)$/, ''));
      if (toggle) b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[id]}</svg>`;
      return b;
    };
    const sep = () => {
      const s = document.createElement('span');
      s.className = 'iva-rt-menu__sep';
      return s;
    };

    if (placement === 'bar') {
      const brand = document.createElement('span');
      brand.className = 'iva-rt-menu__brand';
      brand.textContent = 'iva';
      bar.append(brand);
    }
    const files = [
      ...(typeof host.openNative === 'function' ? [button('open_native')] : []),
      ...(typeof host.openZip === 'function' ? [button('open_zip')] : []),
      button('reload'),
    ];
    const turn = (['landscape', 'portrait'] as const).map((o) => {
      const b = button(o, true);
      // a GUI with one orientation only: the other has nothing to show
      if (!this.hasLayout(o)) {
        (b as HTMLButtonElement).disabled = true;
        b.title = `This GUI has no ${o} layout`;
      }
      return b;
    });
    bar.append(...files, sep(), ...turn, sep(), button('outline', true));

    // the frame rate: a box of its own
    const fps = document.createElement('label');
    fps.className = 'iva-rt-menu__fps';
    fps.title = TITLES.fps;
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.dataset.action = 'fps';
    fps.append(box, document.createTextNode('FPS'));
    // zoom: out, the zoom (a tap: fit / 100 %), in; the hand
    const level = document.createElement('button');
    level.type = 'button';
    level.className = 'iva-rt-menu__zoom';
    level.dataset.action = 'zoom_fit';
    level.title = TITLES.zoom_fit;
    level.textContent = '100%';
    bar.append(fps, sep(), button('zoom_out'), level, button('zoom_in'), button('hand', true), sep(), button('fullscreen', true));
    if (typeof host.toggleDevtools === 'function') bar.append(button('devtools'));

    bar.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('button[data-action]');
      if (!el) return;
      e.preventDefault();
      void this.run(el.dataset.action as MenuActionId);
    });
    box.addEventListener('change', () => void this.run('fps', box.checked));

    root.append(bar);
    mount.appendChild(root);
    this.root = root;
    this.syncState();
  }

  /** the toggles' state: pressed buttons, the FPS box */
  private syncState(): void {
    if (!this.root) return;
    const press = (id: string, on: boolean) => {
      const b = this.root!.querySelector<HTMLElement>(`button[data-action="${id}"]`);
      if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    press('outline', this.opts.renderer.debugMode);
    press('landscape', this.orientation === 'landscape');
    press('portrait', this.orientation === 'portrait');
    const fsEl = this.opts.fullscreenTarget ?? this.opts.mount;
    press('fullscreen', document.fullscreenElement === fsEl);
    press('hand', this.hand || this.spaceHand);
    const box = this.root.querySelector<HTMLInputElement>('input[data-action="fps"]');
    if (box) box.checked = this.opts.renderer.showFps;
  }

  private async run(id: MenuActionId, on?: boolean): Promise<void> {
    const host = this.opts.host ?? {};
    try {
      switch (id) {
        case 'open_native':
          await host.openNative?.();
          break;
        case 'open_zip':
          await host.openZip?.();
          break;
        case 'reload':
          if (host.reload) await host.reload();
          else defaultReload();
          break;
        case 'devtools':
          await host.toggleDevtools?.();
          break;
        case 'outline':
          this.toggleOutline();
          break;
        case 'fps': {
          const next = on ?? !this.opts.renderer.showFps;
          this.opts.renderer.setShowFps(next);
          remembered.set('fps', next);
          break;
        }
        case 'fullscreen':
          await this.toggleFullscreen();
          break;
        case 'landscape':
          this.setOrientation('landscape');
          break;
        case 'portrait':
          this.setOrientation('portrait');
          break;
        case 'zoom_in':
          this.setZoom(this.zoom * 1.25);
          break;
        case 'zoom_out':
          this.setZoom(this.zoom / 1.25);
          break;
        case 'zoom_fit': {
          // fit, or the panel at 100 % (a pixel a pixel) when it fits already
          const box = this.stageBox();
          const real = box ? (this.opts.app.screen.width || 1) / box.width : 1;
          this.setZoom(this.zoom === 1 && Math.abs(real - 1) > 0.01 ? real : 1);
          break;
        }
        case 'hand':
          this.hand = !this.hand;
          this.syncHand();
          break;
      }
    } catch (e) {
      console.error(`[RuntimeMenu] action "${id}" failed:`, e);
    }
    if (id !== 'reload') this.syncState();
  }

  private toggleOutline(): void {
    const next = !this.opts.renderer.debugMode;
    this.opts.renderer.setDebugMode(next);
    remembered.set('outline', next);
    this.opts.onDebugChange?.(next);
  }

  private setOrientation(o: MenuOrientation): void {
    if (this.orientation === o && this.opts.renderer.targetOrientation === o) {
      this.syncState();
      return;
    }
    this.orientation = o;
    const proj = this.opts.renderer.project;
    const width =
      o === 'landscape'
        ? proj.properties.landscape?.width || 1024
        : proj.properties.portrait?.width || 768;
    const height =
      o === 'landscape'
        ? proj.properties.landscape?.height || 768
        : proj.properties.portrait?.height || 1024;

    this.opts.app.renderer.resize(width, height);
    this.opts.renderer.targetOrientation = o;
    if (this.opts.renderer.currentPageName) {
      this.opts.renderer.navigate(this.opts.renderer.currentPageName, o);
    }
    // a page with nothing in that orientation shows the other one: follow it
    this.orientation = (this.opts.renderer.targetOrientation as MenuOrientation) ?? o;
    this.opts.onOrientationChange?.(this.orientation);
  }

  /** whether any page has items in that orientation */
  private hasLayout(o: MenuOrientation): boolean {
    return Object.values(this.opts.renderer.project.pages).some((pg: any) => (pg?.[o]?.length ?? 0) > 0);
  }

  private async toggleFullscreen(): Promise<void> {
    const el = this.opts.fullscreenTarget ?? this.opts.mount;
    if (document.fullscreenElement === el) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  }
}

/** focus in a text field: keys are the field's */
function typing(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
}

function defaultReload(): void {
  const cf = (window as any).CF;
  try {
    cf?.stopSystems?.();
  } catch (e) {
    console.warn('[RuntimeMenu] stopSystems before reload:', e);
  }
  setTimeout(() => window.location.reload(), 150);
}

function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.iva-rt-menu {
  font: 12px/1.3 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: #e5e7eb;
  user-select: none;
  z-index: 100000;
}
.iva-rt-menu__bar {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
.iva-rt-menu__brand {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9ca3af;
  margin-right: 6px;
}
.iva-rt-menu__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: #cbd5e1;
  cursor: pointer;
}
.iva-rt-menu__btn:hover { background: rgba(148, 163, 184, 0.16); color: #f8fafc; }
.iva-rt-menu__btn:disabled { opacity: 0.35; cursor: default; background: transparent; }
.iva-rt-menu__btn:focus-visible, .iva-rt-menu__fps:focus-within { outline: 2px solid #60a5fa; outline-offset: 1px; }
.iva-rt-menu__btn[aria-pressed="true"] {
  background: rgba(59, 130, 246, 0.22);
  border-color: rgba(96, 165, 250, 0.55);
  color: #93c5fd;
}
.iva-rt-menu__sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}
.iva-rt-menu__fps {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 6px;
  border-radius: 7px;
  color: #cbd5e1;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.iva-rt-menu__fps:hover { background: rgba(148, 163, 184, 0.16); }
.iva-rt-menu__zoom {
  min-width: 46px;
  height: 26px;
  padding: 0 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #cbd5e1;
  font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.iva-rt-menu__zoom:hover { background: rgba(148, 163, 184, 0.16); color: #f8fafc; }
.iva-rt-menu__fps input { margin: 0; accent-color: #3b82f6; cursor: pointer; }

/* bar: own strip above the canvas, never covers the GUI */
.iva-rt-menu--bar {
  position: relative;
  display: block;
  width: 100%;
  flex-shrink: 0;
  box-sizing: border-box;
  background: #111827;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.iva-rt-menu--bar .iva-rt-menu__bar {
  min-height: 36px;
  padding: 4px 10px;
  box-sizing: border-box;
}

/* overlay: a floating toolbar over the canvas */
.iva-rt-menu--overlay {
  position: absolute;
  top: 8px;
  left: 8px;
}
.iva-rt-menu--overlay .iva-rt-menu__bar {
  padding: 4px 6px;
  border-radius: 10px;
  background: rgba(17, 24, 39, 0.86);
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
}
`;
  document.head.appendChild(style);
}

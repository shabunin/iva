import type { Application } from 'pixi.js';
import type { CFRenderer } from '../renderer';

export type MenuOrientation = 'landscape' | 'portrait';

const STYLE_ID = 'iva-runtime-menu-styles';

/**
 * Shell / host-owned actions the web menu cannot do alone.
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
 * - `bar` — layout chrome **above** the canvas (own strip, no GUI overlap). Default.
 * - `overlay` — floating control over the canvas (legacy).
 */
export type RuntimeMenuPlacement = 'bar' | 'overlay';

export interface RuntimeMenuOptions {
  /**
   * Where the menu DOM is attached.
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
  /** Fired when chrome is shown/hidden (checkbox or Ctrl+M). */
  onVisibilityChange?: (visible: boolean) => void;
  /** Initial chrome visibility; default true. Toggle anytime with Ctrl+M. */
  visible?: boolean;
  /** Default: `bar` (does not cover the rendered GUI). */
  placement?: RuntimeMenuPlacement;
}

type MenuActionId =
  | 'open_native'
  | 'open_zip'
  | 'reload'
  | 'devtools'
  | 'outline'
  | 'fullscreen'
  | 'landscape'
  | 'portrait';

/**
 * HTML chrome for CF runtime (replaces former Tauri native menu).
 * Pure DOM — no React, no @tauri-apps.
 */
export class RuntimeMenu {
  private readonly opts: RuntimeMenuOptions;
  private root: HTMLElement | null = null;
  private panel: HTMLElement | null = null;
  private open = false;
  private chromeVisible: boolean;
  private orientation: MenuOrientation;
  private destroyed = false;

  private readonly onDocClick = (e: MouseEvent) => {
    if (!this.open || !this.root) return;
    if (!this.root.contains(e.target as Node)) this.setOpen(false);
  };

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.destroyed) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    // Always available — show/hide chrome strip
    if (mod && key === 'm') {
      e.preventDefault();
      this.setVisible(!this.chromeVisible);
      return;
    }

    if (mod && key === 'o' && e.shiftKey) {
      e.preventDefault();
      void this.run('outline');
      return;
    }
    if (mod && key === 'o') {
      e.preventDefault();
      void this.run('open_native');
      return;
    }
    if (mod && key === 'r') {
      e.preventDefault();
      void this.run('reload');
      return;
    }
    if (mod && key === 'i' && e.shiftKey) {
      e.preventDefault();
      void this.run('devtools');
      return;
    }
    if (mod && key === '1') {
      e.preventDefault();
      void this.run('landscape');
      return;
    }
    if (mod && key === '2') {
      e.preventDefault();
      void this.run('portrait');
      return;
    }
    if (e.key === 'F11') {
      e.preventDefault();
      void this.run('fullscreen');
      return;
    }
    if (e.key === 'Escape' && this.open) {
      this.setOpen(false);
    }
  };

  private readonly onFullscreenChange = () => {
    this.syncChecks();
  };

  constructor(opts: RuntimeMenuOptions) {
    this.opts = opts;
    this.orientation = opts.initialOrientation ?? opts.renderer.targetOrientation ?? 'landscape';
    this.chromeVisible = opts.visible !== false;
    ensureStyles();
    // Always mount DOM so setVisible/Ctrl+M can show chrome without re-create.
    this.mountUi();
    this.applyVisibility();
    window.addEventListener('keydown', this.onKeyDown, true);
    document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('click', this.onDocClick, true);
    document.removeEventListener('fullscreenchange', this.onFullscreenChange);
    this.root?.remove();
    this.root = null;
    this.panel = null;
  }

  getOrientation(): MenuOrientation {
    return this.orientation;
  }

  isDebug(): boolean {
    return !!this.opts.renderer.debugMode;
  }

  /** Whether the chrome strip is shown. */
  isVisible(): boolean {
    return this.chromeVisible;
  }

  setVisible(visible: boolean): void {
    if (this.destroyed || this.chromeVisible === visible) return;
    this.chromeVisible = visible;
    if (!visible) this.setOpen(false);
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

    // Overlay needs a positioned ancestor; bar lives in normal document flow.
    if (placement === 'overlay') {
      const prevPos = getComputedStyle(mount).position;
      if (prevPos === 'static') {
        mount.style.position = 'relative';
      }
    }

    const root = document.createElement('div');
    root.className =
      placement === 'bar' ? 'iva-rt-menu iva-rt-menu--bar' : 'iva-rt-menu iva-rt-menu--overlay';
    root.setAttribute('data-iva-chrome', 'runtime-menu');
    root.setAttribute('data-placement', placement);

    const bar = document.createElement('div');
    bar.className = 'iva-rt-menu__bar';

    const brand = document.createElement('span');
    brand.className = 'iva-rt-menu__brand';
    brand.textContent = 'iva';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'iva-rt-menu__toggle';
    toggle.title = 'Runtime menu';
    toggle.setAttribute('aria-label', 'Runtime menu');
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.textContent = placement === 'bar' ? 'Menu ▾' : '☰';
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOpen(!this.open);
    });

    const panel = document.createElement('div');
    panel.className = 'iva-rt-menu__panel';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    panel.innerHTML = buildPanelHtml(this.opts.host);

    panel.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute('data-action') as MenuActionId;
      void this.run(id);
    });

    if (placement === 'bar') {
      bar.appendChild(brand);
      bar.appendChild(toggle);
      root.appendChild(bar);
      root.appendChild(panel);
    } else {
      root.appendChild(toggle);
      root.appendChild(panel);
    }

    mount.appendChild(root);

    this.root = root;
    this.panel = panel;
    this.syncChecks();
  }

  private setOpen(next: boolean): void {
    this.open = next;
    if (this.panel) this.panel.hidden = !next;
    if (this.root) this.root.classList.toggle('iva-rt-menu--open', next);
    if (next) {
      document.addEventListener('click', this.onDocClick, true);
      this.syncChecks();
    } else {
      document.removeEventListener('click', this.onDocClick, true);
    }
  }

  private syncChecks(): void {
    if (!this.panel) return;
    const mark = (id: string, on: boolean) => {
      const el = this.panel!.querySelector(`[data-action="${id}"] .iva-rt-menu__check`);
      if (el) el.textContent = on ? '✓' : '';
    };
    mark('outline', this.opts.renderer.debugMode);
    mark('landscape', this.orientation === 'landscape');
    mark('portrait', this.orientation === 'portrait');
    const fsEl = this.opts.fullscreenTarget ?? this.opts.mount;
    mark('fullscreen', document.fullscreenElement === fsEl);
  }

  private async run(id: MenuActionId): Promise<void> {
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
        case 'fullscreen':
          await this.toggleFullscreen();
          break;
        case 'landscape':
          this.setOrientation('landscape');
          break;
        case 'portrait':
          this.setOrientation('portrait');
          break;
      }
    } catch (e) {
      console.error(`[RuntimeMenu] action "${id}" failed:`, e);
    }
    if (id !== 'reload') {
      this.syncChecks();
      // keep panel open for toggles; close after open/reload-ish
      if (id === 'open_native' || id === 'open_zip') this.setOpen(false);
    }
  }

  private toggleOutline(): void {
    const next = !this.opts.renderer.debugMode;
    this.opts.renderer.setDebugMode(next);
    this.opts.onDebugChange?.(next);
  }

  private setOrientation(o: MenuOrientation): void {
    if (this.orientation === o && this.opts.renderer.targetOrientation === o) {
      this.syncChecks();
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
    this.opts.onOrientationChange?.(o);
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

function defaultReload(): void {
  const cf = (window as any).CF;
  try {
    cf?.stopSystems?.();
  } catch (e) {
    console.warn('[RuntimeMenu] stopSystems before reload:', e);
  }
  setTimeout(() => window.location.reload(), 150);
}

function buildPanelHtml(host?: RuntimeMenuHost): string {
  const hasNative = typeof host?.openNative === 'function';
  const hasZip = typeof host?.openZip === 'function';
  const hasDevtools = typeof host?.toggleDevtools === 'function';

  const item = (action: string, label: string, shortcut?: string, enabled = true) => {
    if (!enabled) return '';
    return `<button type="button" class="iva-rt-menu__item" data-action="${action}">
      <span class="iva-rt-menu__check"></span>
      <span class="iva-rt-menu__label">${label}</span>
      ${shortcut ? `<span class="iva-rt-menu__kbd">${shortcut}</span>` : ''}
    </button>`;
  };

  const section = (title: string, body: string) => {
    if (!body.trim()) return '';
    return `<div class="iva-rt-menu__section">
      <div class="iva-rt-menu__section-title">${title}</div>
      ${body}
    </div>`;
  };

  const file = [
    item('open_native', 'Open (native fs)', '⌘/Ctrl+O', hasNative),
    item('open_zip', 'Open (.gui.zip)', undefined, hasZip),
    item('reload', 'Reload App', '⌘/Ctrl+R', true),
  ].join('');

  const view = [
    item('devtools', 'DevTools', '⌘/Ctrl+Shift+I', hasDevtools),
    item('outline', 'Outline', '⌘/Ctrl+Shift+O', true),
    item('fullscreen', 'Fullscreen', 'F11', true),
    item('landscape', 'Landscape', '⌘/Ctrl+1', true),
    item('portrait', 'Portrait', '⌘/Ctrl+2', true),
  ].join('');

  return (
    section('File', file) +
    section('View', view) +
    `<div class="iva-rt-menu__footer">cf-runtime · hide with Ctrl+M</div>`
  );
}

function ensureStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
/* —— shared —— */
.iva-rt-menu {
  font: 12px/1.3 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: #e5e7eb;
  user-select: none;
  z-index: 100000;
}
.iva-rt-menu__toggle {
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  background: rgba(31, 41, 55, 0.95);
  color: #f3f4f6;
  cursor: pointer;
}
.iva-rt-menu__toggle:hover {
  background: rgba(55, 65, 81, 0.98);
  border-color: rgba(96, 165, 250, 0.45);
}
.iva-rt-menu--open .iva-rt-menu__toggle {
  border-color: rgba(96, 165, 250, 0.65);
  color: #93c5fd;
}
.iva-rt-menu__panel {
  min-width: 240px;
  padding: 6px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(17, 24, 39, 0.98);
  box-shadow: 0 12px 40px rgba(0,0,0,0.45);
}
.iva-rt-menu__section { padding: 4px 0; }
.iva-rt-menu__section + .iva-rt-menu__section {
  border-top: 1px solid rgba(255,255,255,0.08);
  margin-top: 4px;
  padding-top: 8px;
}
.iva-rt-menu__section-title {
  padding: 2px 10px 6px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #9ca3af;
}
.iva-rt-menu__item {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
}
.iva-rt-menu__item:hover {
  background: rgba(59, 130, 246, 0.18);
}
.iva-rt-menu__check {
  color: #60a5fa;
  font-size: 12px;
  width: 16px;
}
.iva-rt-menu__label { font-size: 13px; }
.iva-rt-menu__kbd {
  font-size: 10px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
.iva-rt-menu__footer {
  padding: 6px 10px 2px;
  font-size: 10px;
  color: #6b7280;
  text-align: right;
}

/* —— bar: own strip above canvas, never covers GUI —— */
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
  display: flex;
  align-items: center;
  gap: 10px;
  height: 36px;
  padding: 0 10px;
  box-sizing: border-box;
}
.iva-rt-menu--bar .iva-rt-menu__brand {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9ca3af;
}
.iva-rt-menu--bar .iva-rt-menu__toggle {
  height: 26px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 500;
}
.iva-rt-menu--bar .iva-rt-menu__panel {
  position: absolute;
  top: 100%;
  left: 8px;
  margin-top: 4px;
  z-index: 100001;
}

/* —— overlay: floating over canvas (optional) —— */
.iva-rt-menu--overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  pointer-events: none;
}
.iva-rt-menu--overlay > * { pointer-events: auto; }
.iva-rt-menu--overlay .iva-rt-menu__toggle {
  width: 36px;
  height: 36px;
  font-size: 16px;
  backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.35);
  background: rgba(17, 24, 39, 0.82);
}
.iva-rt-menu--overlay .iva-rt-menu__panel {
  position: absolute;
  top: 44px;
  left: 0;
  backdrop-filter: blur(12px);
  background: rgba(17, 24, 39, 0.94);
}
`;
  document.head.appendChild(style);
}

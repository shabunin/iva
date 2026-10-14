import { Application } from 'pixi.js';
import { parseGUI, type CFProject } from './parser';
import { CFRenderer, stopAllAnimations } from './renderer';
import { DomLayer } from './domLayer';
import { CFAPI } from './cf';
import { joinStore } from './joinStore';
import {
  RuntimeMenu,
  type RuntimeMenuHost,
  type RuntimeMenuPlacement,
} from './chrome/runtimeMenu';

export type Orientation = 'landscape' | 'portrait';

export interface LoadProjectMenuOptions {
  /**
   * Where to mount chrome.
   * Prefer a dedicated strip **above** the canvas (placement `bar`).
   * Defaults to `canvas.parentElement`.
   * Pass `false` to disable chrome entirely.
   */
  mount?: HTMLElement | false;
  /** Prefer the canvas box only — not the menu strip. */
  fullscreenTarget?: HTMLElement;
  host?: RuntimeMenuHost;
  onDebugChange?: (debug: boolean) => void;
  onVisibilityChange?: (visible: boolean) => void;
  /** Initial chrome visibility; default true. Ctrl+M toggles. */
  visible?: boolean;
  /** default `bar` — strip above GUI, no overlap */
  placement?: RuntimeMenuPlacement;
}

export interface LoadProjectOptions {
  guiXml: string;
  imageMap: Record<string, string>;
  scriptMap: Record<string, string>;
  canvas: HTMLCanvasElement;
  /** Reuse an existing Pixi Application (avoids WebGL context loss on reload). */
  app?: Application | null;
  orientation?: Orientation;
  debugMode?: boolean;
  onOrientationChange?: (o: Orientation) => void;
  /**
   * A project file's URL by its name in the GUI (a web view's
   * `url="page.html"`, url() in an input theme), when the host serves more
   * than the images in `imageMap`.
   */
  fileUrl?: (name: string) => string | undefined;
  /** Previous renderer to tear down (stage children only). */
  previousRenderer?: CFRenderer | null;
  /** Destroy previous web menu when reloading a project. */
  previousMenu?: RuntimeMenu | null;
  /**
   * Web runtime menu (replaces native Tauri menu).
   * `true` / omit → enable with defaults; `false` → off.
   */
  menu?: boolean | LoadProjectMenuOptions;
}

export interface LoadProjectResult {
  project: CFProject;
  renderer: CFRenderer;
  app: Application;
  /** Script tags injected for project JS — caller should remove on next load. */
  scriptElements: HTMLScriptElement[];
  /** Blob URLs created for scripts — revoke on cleanup. */
  scriptBlobUrls: string[];
  /** DOM chrome menu; destroy on next load / unmount. */
  menu: RuntimeMenu | null;
}

/**
 * Parse a CF GUI, mount Pixi renderer, inject scripts, run userMain, start systems.
 * Host networking (window.agapi / installStdlib) must already be in place.
 */
export async function loadProject(options: LoadProjectOptions): Promise<LoadProjectResult> {
  const {
    guiXml,
    imageMap,
    scriptMap,
    canvas,
    orientation = 'landscape',
    debugMode = false,
    onOrientationChange,
  } = options;

  // Tear down previous CF systems FIRST — otherwise reload leaves Rust sockets
  // bound (EADDRINUSE on origin ports) while a new CFAPI starts another set.
  const prevCf = (typeof window !== 'undefined' ? (window as any).CF : null) as
    | { stopSystems?: () => void }
    | null;
  if (prevCf && typeof prevCf.stopSystems === 'function') {
    try {
      prevCf.stopSystems();
    } catch (e) {
      console.warn('[loadProject] prev CF.stopSystems failed:', e);
    }
  }

  try {
    options.previousMenu?.destroy();
  } catch (e) {
    console.warn('[loadProject] previousMenu.destroy failed:', e);
  }

  const project = await parseGUI(guiXml);

  stopAllAnimations();

  if (options.previousRenderer) {
    DomLayer.of(options.previousRenderer)?.clear();
    options.app?.stage.removeChildren();
  }
  joinStore.clear();

  const width =
    orientation === 'landscape'
      ? project.properties.landscape?.width || 1024
      : project.properties.portrait?.width || 768;
  const height =
    orientation === 'landscape'
      ? project.properties.landscape?.height || 768
      : project.properties.portrait?.height || 1024;

  let app = options.app ?? null;
  if (!app) {
    app = new Application();
    await app.init({
      canvas,
      width,
      height,
      backgroundColor: 0x000000,
      // transparent where web views / input fields are: they show through (see DomLayer)
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      preference: 'webgl',
    });
  } else {
    app.renderer.resize(width, height);
  }

  const renderer = new CFRenderer(app, project, imageMap);
  renderer.fileUrl = options.fileUrl;
  renderer.targetOrientation = orientation;
  renderer.setDebugMode(debugMode);

  CFAPI.makeGlobal(renderer);
  const globalCF = (window as any).CF;
  renderer.cfApi = globalCF;
  if (onOrientationChange) {
    renderer.onOrientationChange = onOrientationChange;
  }
  globalCF.userMain = undefined;

  const scriptElements: HTMLScriptElement[] = [];
  const scriptBlobUrls: string[] = [];

  if (project.scripts) {
    for (const scriptNode of project.scripts) {
      if (!scriptNode.name) continue;

      const targetName = scriptNode.name.toLowerCase().replace(/\\/g, '/');
      const targetLeaf = targetName.split('/').pop() || '';

      let scriptContent = '';
      for (const [key, content] of Object.entries(scriptMap)) {
        const normalizedKey = key.toLowerCase().replace(/\\/g, '/');
        if (
          normalizedKey === targetName ||
          normalizedKey.endsWith('/' + targetName) ||
          normalizedKey === targetLeaf ||
          normalizedKey.endsWith('/' + targetLeaf)
        ) {
          scriptContent = content;
          break;
        }
      }

      if (!scriptContent) continue;

      try {
        const blobContent = `${scriptContent}\n//# sourceURL=cf-script://${scriptNode.name}`;
        const blob = new Blob([blobContent], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        scriptBlobUrls.push(blobUrl);
        const scriptElement = document.createElement('script');
        scriptElement.src = blobUrl;

        await new Promise<void>((resolve) => {
          scriptElement.onload = () => resolve();
          scriptElement.onerror = () => resolve();
          document.head.appendChild(scriptElement);
        });

        scriptElements.push(scriptElement);
      } catch (e) {
        console.error(`Error executing project script ${scriptNode.name}:`, e);
      }
    }
  }

  await renderer.start();

  if (globalCF && Array.isArray(globalCF.modules)) {
    for (const mod of globalCF.modules) {
      if (typeof mod.setup === 'function') {
        try {
          mod.setup.call(mod.object || window);
        } catch (e) {
          console.error(`Error in module setup for ${mod.name}:`, e);
        }
      }
    }
  }

  const userMainFn =
    typeof globalCF.userMain === 'function'
      ? globalCF.userMain
      : typeof (window as any).userMain === 'function'
        ? (window as any).userMain
        : undefined;

  if (userMainFn) {
    try {
      userMainFn();
    } catch (e) {
      console.error('Error in CF.userMain:', e);
    }
  }

  if (globalCF && typeof globalCF.startSystems === 'function') {
    globalCF.startSystems();
  }

  setTimeout(() => {
    if (globalCF && typeof globalCF.dispatchEvent === 'function') {
      globalCF.dispatchEvent(globalCF.PreloadingCompleteEvent);
    }
  }, 0);

  let menu: RuntimeMenu | null = null;
  const menuOpt = options.menu;
  if (menuOpt !== false) {
    const menuCfg: LoadProjectMenuOptions =
      menuOpt === true || menuOpt === undefined ? {} : menuOpt;
    if (menuCfg.mount !== false) {
      const mountEl = menuCfg.mount ?? canvas.parentElement;
      if (mountEl) {
        menu = new RuntimeMenu({
          mount: mountEl,
          fullscreenTarget: menuCfg.fullscreenTarget ?? mountEl,
          renderer,
          app,
          host: menuCfg.host,
          initialOrientation: orientation,
          initialDebug: debugMode,
          onOrientationChange,
          onDebugChange: menuCfg.onDebugChange,
          onVisibilityChange: menuCfg.onVisibilityChange,
          visible: menuCfg.visible,
          placement: menuCfg.placement ?? 'bar',
        });
      }
    }
  }

  return { project, renderer, app, scriptElements, scriptBlobUrls, menu };
}

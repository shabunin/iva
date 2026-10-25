/**
 * iva panel: a GUI (.gui) on iva's own runtime, full screen - what iViewer
 * does on a panel - and a browser for GUIs: GUI links (CF.loadGUI,
 * CF.openURL, a button's href) followed, back and forward through them, an
 * address bar (an option) to type one, the GUIs loaded kept on the device.
 * Systems and scripts get real sockets from the app (src-tauri: the
 * runtime's host commands); the GUI comes from a web server - a .gui, a
 * zipped GUI, iva serve's address (live reload and all).
 *
 * First start: the built-in demo (the iva/ui gallery). Settings: three fingers on the screen, Ctrl+S or F1
 * on a keyboard, or a finger held in the top-left corner. Ctrl+R: the GUI
 * again from its server.
 */
import { getVersion } from '@tauri-apps/api/app';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { openUrl as openOutside } from '@tauri-apps/plugin-opener';
import type { Application } from 'pixi.js';
import { installHost } from '../src/runtime/stdlib';
import { createApp, loadProject, rendererLabel, type LoadProgress, type LoadProjectResult, type Orientation, type RendererChoice } from '../src/runtime/cf';
import { createIvaHost } from '../src/runtime/host';
import { closeHostSockets } from '../src/runtime/host/net/provider';
import { installFonts } from '../src/preview/fonts';
import { formatLocation, History, isGuiUrl, parseLocation, type GuiLocation } from '../src/runtime/location';
import { PARSED_STAMP, type KeptParse, appArchive, fetchGui, folderManifest, guiUrl, manifestOf, newerVersion, ownFile, savedManifest, toSave, unpackPlan, useArchives, useTurn, zipped, type Download, type Fetched, type Manifest } from './loader';
import { forgetAllGuis, forgetGui, keptGui, keptGuis, saveGui, savedGui, usedGui, type Kept, type SavedGui } from './store';
import { androidDevice } from './device';

// ── what the panel keeps: between starts (localStorage), across a GUI change (sessionStorage) ──
/** the GUI shown last: what the next start runs (it follows GUI links) */
const GUI = 'iva-panel:gui';
/** the GUI the settings name: the panel's default, what CF.loadGUI(null) goes back to */
const DEFAULT_GUI = 'iva-panel:default-gui';
/** the page to start on (CF.loadGUI's startPage, an address's ?page=) */
const PAGE = 'iva-panel:page';
/** iViewer's "Disconnect on Exit/Sleep" ('0': off), as CF.loadGUI or the settings last set it */
const DISCONNECT = 'iva-panel:disconnectOnSuspend';
/** iViewer's "Auto Lock Delay": minutes without a touch the screen stays on (0, none: always), as CF.loadGUI or the settings last set it */
const AUTOLOCK = 'iva-panel:autoLockDelay';
/** the server's GUI, not the copy kept (CF.loadGUI's reloadGUI, Ctrl+R) */
const FRESH = 'iva-panel:fresh';
/** a GUI shown once, not made the next start's (CF.loadGUI's rememberLastGUI: false) */
const ONCE = 'iva-panel:once';
/** no loading text this time (CF.loadGUI's showPreloadStatus: false) */
const QUIET = 'iva-panel:quiet';
/** the view's options */
const OUTLINE = 'iva-panel:outline';
const FPS = 'iva-panel:fps';
/** a frame drawn only when something changed ('0': every frame) */
const ON_DEMAND = 'iva-panel:on-demand';
const onDemand = () => localStorage.getItem(ON_DEMAND) !== '0';
/** what draws the GUI (the settings' Graphics): auto, webgl2, webgl1, webgpu, canvas */
const RENDERER = 'iva-panel:renderer';
const RENDERERS: RendererChoice[] = ['auto', 'webgl2', 'webgl1', 'webgpu', 'canvas'];
const rendererChoice = (): RendererChoice => {
  const v = localStorage.getItem(RENDERER) as RendererChoice | null;
  return v && RENDERERS.includes(v) ? v : 'auto';
};
const BAR = 'iva-panel:addressbar';
/** a GUI's sizes, as the app unpacked it: the one each orientation runs (JSON by orientation; a key per GUI) */
const SIZES = 'iva-panel:sizes:';
/** the GUIs no copy is kept of (JSON: their URLs) */
const NO_COPY = 'iva-panel:no-copy';

const flag = (key: string, dflt = false) => {
  const v = localStorage.getItem(key);
  return v === null ? dflt : v === '1';
};
const setFlag = (key: string, on: boolean) => localStorage.setItem(key, on ? '1' : '0');

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $<HTMLDivElement>('stage');
const canvas = $<HTMLCanvasElement>('canvas');
const status = $<HTMLDivElement>('status');
const form = $<HTMLFormElement>('settings');
const input = $<HTMLInputElement>('url');
const bar = $<HTMLDivElement>('bar');
const address = $<HTMLInputElement>('address');
const copies = $<HTMLDivElement>('copies');
const options = {
  bar: $<HTMLInputElement>('opt-bar'),
  outline: $<HTMLInputElement>('opt-outline'),
  fps: $<HTMLInputElement>('opt-fps'),
  disconnect: $<HTMLInputElement>('opt-disconnect'),
  autoLock: $<HTMLSelectElement>('opt-autolock'),
  renderer: $<HTMLSelectElement>('opt-renderer'),
  onDemand: $<HTMLInputElement>('opt-ondemand'),
};

/** where the panel has been (back, forward), across the page reloads a GUI change takes */
const history = new History(sessionStorage);
let current: LoadProjectResult | null = null;
/** the fonts iViewer panels name, in (start: behind the GUI's reading) - before the GUI draws, so text measures right */
let fontsIn: Promise<unknown> = Promise.resolve();
/** what the page before left on the host, closed (start: behind the GUI's reading) - before the GUI runs */
let socketsClosed: Promise<unknown> = Promise.resolve();
/** the Pixi app the GUI draws in, being made (start: behind the GUI's reading) */
let appMade: Promise<Application> | undefined;
/** the GUI shown and the page it is on: the address bar's text */
let shown: GuiLocation | null = null;
/** this load without the loading text */
const quiet = sessionStorage.getItem(QUIET) === '1';
sessionStorage.removeItem(QUIET);
/**
 * the orientation the window asks for: clearly taller or wider; a nearly square one (a Titan 2's screen) the way the
 * device is turned, where it says (screen.orientation), else what there is (landscape at first)
 */
const wanted = (now: Orientation): Orientation => {
  if (innerHeight > innerWidth * 1.15) return 'portrait';
  if (innerWidth > innerHeight * 1.15) return 'landscape';
  const type = typeof screen !== 'undefined' ? screen.orientation?.type : undefined;
  return type ? (type.startsWith('portrait') ? 'portrait' : 'landscape') : now;
};
let orientation: Orientation = wanted('landscape');
// a GUI in several sizes: the one laid out the way the screen is turned
useTurn(orientation);
/** a line under the GUI while there is none shown (failing); a GUI shown has the screen to itself */
const say = (text: string) => {
  status.textContent = current ? '' : text;
};
/** a line worth seeing even with a GUI up (scripts missing, the copy running for the server), for a while */
let noticeTimer = 0;
const notice = (text: string, ms = 12000) => {
  status.textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    if (status.textContent === text) status.textContent = '';
  }, ms);
};
// ── the loading screen: the GUI's name, how far it got, what it's doing ──

const loading = $<HTMLDivElement>('loading');
/**
 * Each step of a start: where it begins on the bar (the next one's start is
 * where it ends), and how long it takes a Nexus 5 - the bar creeps through a
 * step in about that time, so it moves while the page is busy (a transform
 * animated by the compositor: it goes on with the page's script running). A
 * step counted (an upload, the scripts, the images) fills its part as it goes.
 */
const STEPS = {
  starting: [0, 0.6],
  download: [0.03, 1],
  unpacking: [0.06, 2],
  reading: [0.15, 0.9],
  gui: [0.22, 2],
  graphics: [0.45, 0.7],
  scripts: [0.52, 2],
  images: [0.74, 1],
  page: [0.82, 2],
  started: [0.97, 0.5],
  done: [1, 0.2],
} as const;
type Step = keyof typeof STEPS;
const ORDER = Object.keys(STEPS) as Step[];
const fill = loading.querySelector('#loading-bar > div') as HTMLElement;
/** where the bar is going: never back (a step said twice, a copy failing over to its server) */
let barTarget = 0;
/** how far a start got: its step, what to say, and of a step counted how many of how many - shown unless asked not to (CF.loadGUI's showPreloadStatus: false) */
function progress(step: Step, what: string, done?: number, total?: number) {
  if (quiet || loading.hidden) return;
  const [from, secs] = STEPS[step];
  const to = STEPS[ORDER[ORDER.indexOf(step) + 1] ?? 'done'][0];
  // counted: so far; else most of the way, slowing as it goes
  const target = total ? from + (to - from) * Math.min(1, (done ?? 0) / total) : from + (to - from) * 0.85;
  if (target > barTarget) {
    barTarget = target;
    fill.style.transition = total || step === 'done' ? 'transform 0.25s ease-out' : `transform ${secs}s cubic-bezier(0.25, 0.6, 0.35, 1)`;
    fill.style.transform = `scaleX(${target.toFixed(3)})`;
  }
  loading.classList.remove('waiting');
  $('loading-what').textContent = what;
}
/** the GUI's name over the bar */
const loadingTitle = (title: string) => void ($('loading-title').textContent = title);
/** the loading screen gone: once the first page is drawn (the frame after), or at once (a failure says why below it) */
function loaded(now = false) {
  if (now) loading.hidden = true;
  else requestAnimationFrame(() => requestAnimationFrame(() => (loading.hidden = true)));
}
if (quiet) loading.hidden = true;
/** loadProject's steps, as the bar says them */
const projectProgress = (p: LoadProgress) => {
  if (p.stage === 'gui') progress('gui', 'Reading its pages');
  else if (p.stage === 'graphics') progress('graphics', 'Setting up the graphics');
  else if (p.stage === 'scripts') progress('scripts', `Starting scripts: ${Math.min((p.done ?? 0) + 1, p.total ?? 0)} of ${p.total}`, p.done, p.total);
  else if (p.stage === 'images') progress('images', `Loading images: ${p.done} of ${p.total}`, p.done, p.total);
  else if (p.stage === 'page') progress('page', 'Drawing the first page');
  else progress('started', 'Starting');
};

/** the built-in demo: the iva/ui gallery, a zipped GUI among the app's own files (scripts/demo.mjs) */
const DEMO = new URL('demo/iva-ui-gallery.gui.zip', location.href).href;
/** one spelling of a GUI's URL (http://host:8019 and http://host:8019/ are one GUI): the location's */
const canonical = (url: string) => parseLocation(url)?.gui ?? url;
/** the spellings a copy may be kept under: this one, and the other with or without the trailing slash (older panels kept the bare host) */
const spellings = (url: string) => [...new Set([url, canonical(url), url.replace(/\/$/, ''), `${url}/`])];

// what went wrong, for the settings page (a panel has no console to look at)
const errors: string[] = [];
const noteError = (text: string) => {
  errors.push(`${new Date().toLocaleTimeString()} ${text}`);
  if (errors.length > 30) errors.shift();
};
const consoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  try {
    noteError(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : String(a))).join(' '));
  } finally {
    consoleError(...args);
  }
};
addEventListener('error', (e) => noteError(`${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`));
addEventListener('unhandledrejection', (e) => noteError(`unhandled: ${e.reason?.message ?? e.reason}`));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

// the phone's own settings and keys (the app's side: PanelDevice.kt), where the app offers them
const device = androidDevice();
// the loading screen drawn (the frame after the first): the app's splash, showing through the web view till now, can go
requestAnimationFrame(() => requestAnimationFrame(() => device?.shown()));
installHost({ ...createIvaHost(), ...(device ? { deviceControl: device } : {}) });

/** the auto-lock delay set (minutes; 0: the screen always on) */
const autoLockDelay = () => Math.max(0, Number(localStorage.getItem(AUTOLOCK)) || 0);
device?.autoLock(autoLockDelay());
function setAutoLockDelay(minutes: number) {
  const m = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
  localStorage.setItem(AUTOLOCK, String(m));
  device?.autoLock(m);
}

/** the GUI's size in the orientation shown */
function guiSize(o: Orientation) {
  const p = current?.project.properties;
  return o === 'landscape'
    ? { w: p?.landscape?.width || 1024, h: p?.landscape?.height || 768 }
    : { w: p?.portrait?.width || 768, h: p?.portrait?.height || 1024 };
}

/** as large as the screen (under the address bar) takes it, its aspect kept; drawn at the screen's pixels (sharp, as iViewer scales a GUI up) */
function fit() {
  if (!current) return;
  const top = bar.hidden ? 0 : bar.offsetHeight;
  const room = Math.max(1, innerHeight - top);
  const { w, h } = guiSize(orientation);
  const s = Math.min(innerWidth / w, room / h);
  stage.style.width = `${Math.round(w * s)}px`;
  stage.style.height = `${Math.round(h * s)}px`;
  stage.style.top = `${top + room / 2}px`;
  current.app.renderer.resize(w, h, s * (devicePixelRatio || 1));
}

/** the size the window was last made (this run of the app): a reload of the same GUI leaves it as the user left it */
const SIZED = 'iva-panel:window-size';

/**
 * On a desktop, the window as big as the GUI (and the address bar): drawn
 * 1:1 - at another size it's scaled, and its text goes soft. Once a size:
 * iva serve's live reloads leave a window the user sized alone, a GUI of
 * another size gets its own. Not on a phone, not a window maximized or full
 * screen, not past the screen.
 */
async function sizeWindow() {
  if (!current || /Android|iPhone|iPad/i.test(navigator.userAgent)) return;
  const { w, h } = guiSize(orientation);
  const top = bar.hidden ? 0 : bar.offsetHeight;
  const want = `${w}x${h + top}`;
  if (sessionStorage.getItem(SIZED) === want) return;
  sessionStorage.setItem(SIZED, want);
  if (w > screen.availWidth || h + top > screen.availHeight - 48) return;
  try {
    const win = getCurrentWindow();
    if ((await win.isMaximized()) || (await win.isFullscreen())) return;
    await win.setSize(new LogicalSize(w, h + top));
  } catch (e) {
    noteError(`the window's size: ${message(e)}`);
  }
}

/** a text field has the keyboard: the window got shorter for it, not turned */
const typing = () => document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;

/**
 * The window changed: the device turned - the page in that orientation, if
 * the page has it (GUI Designer writes the other one empty; turning to it
 * would only rebuild the page) - and the GUI as large as fits again. Not
 * while a field has the keyboard: rebuilding the page would take the field
 * from under it.
 */
function turned() {
  if (!current || typing()) return;
  const want = wanted(orientation);
  const page = current.renderer.currentPageName;
  // a GUI in several sizes, another laid out the way it's turned now (iva build's <Project sizes>): that one, on
  // this page - once the device has stayed turned a moment (a window dragged on a desktop goes through shapes)
  const other = want !== orientation && shown ? sizesOf(shown.gui)?.[want] : undefined;
  clearTimeout(turning);
  if (other !== undefined && other !== shownSize) {
    turning = window.setTimeout(() => {
      if (wanted(orientation) !== want) return;
      if (page) sessionStorage.setItem(PAGE, page);
      void letGo().then(() => location.reload());
    }, 400);
    fit();
    return;
  }
  if (want !== orientation && page && (current.project.pages[page]?.[want]?.length ?? 0) > 0) {
    current.renderer.navigate(page, want);
    // the view that way now: the renderer makes the page once that way's images are in (its own orientation the old
    // one until then)
    orientation = want;
  }
  fit();
}
let turning = 0;
addEventListener('resize', turned);
// a square screen turned: its shape the same, the device's orientation not
screen.orientation?.addEventListener('change', () => turned());
// a field let go (the keyboard going): what the window is now
document.addEventListener('focusout', () => setTimeout(turned, 300));

// ── going places ──────────────────────────────────────────────────

/**
 * Go to a GUI, on a page: the panel's page reloads with it (the runtime
 * keeps its globals per page). It becomes the GUI the next start runs,
 * unless `once`; `fresh`: its server's copy, not the one kept; `quiet`: no
 * loading text.
 */
async function goTo(loc: GuiLocation, o: { once?: boolean; fresh?: boolean; quiet?: boolean } = {}) {
  if (o.once) sessionStorage.setItem(ONCE, loc.gui);
  else {
    sessionStorage.removeItem(ONCE);
    localStorage.setItem(GUI, loc.gui);
  }
  if (loc.page) sessionStorage.setItem(PAGE, loc.page);
  else sessionStorage.removeItem(PAGE);
  if (o.fresh) sessionStorage.setItem(FRESH, '1');
  if (o.quiet) sessionStorage.setItem(QUIET, '1');
  await letGo();
  location.reload();
}

/**
 * The GUI's systems closed and their ports let go before the page reloads:
 * the Rust side's sockets outlive the page, and a server still listening
 * would hold its port from the next GUI's - its web server never answering,
 * blank web views. A second or so at most.
 */
async function letGo() {
  try {
    const done = (window as any).CF?.stopSystems?.();
    if (done && typeof done.then === 'function') await Promise.race([done, new Promise((r) => setTimeout(r, 1500))]);
  } catch {
    // going away anyway
  }
}

/**
 * CF.loadGUI: a URL (relative to the GUI it's in; ?page= in it the page),
 * '' this one again, null the settings' GUI - the panel's default - with
 * the settings iViewer's has that mean something here: startPage,
 * reloadGUI / reloadAssets (the server's copy), rememberLastGUI,
 * showPreloadStatus, disconnectOnSuspend, autoLockDelay (minutes).
 */
function loadGui(from: string, url: string | null, settings: Record<string, unknown>) {
  const loc: GuiLocation | null = url === null
    ? { gui: localStorage.getItem(DEFAULT_GUI) ?? localStorage.getItem(GUI) ?? from }
    : url ? parseLocation(url, from) : { gui: from };
  if (!loc) {
    noteError(`CF.loadGUI(${JSON.stringify(url)}): not a URL`);
    return;
  }
  if (typeof settings.startPage === 'string' && settings.startPage) loc.page = settings.startPage;
  if (typeof settings.disconnectOnSuspend === 'boolean') localStorage.setItem(DISCONNECT, settings.disconnectOnSuspend ? '1' : '0');
  if (typeof settings.autoLockDelay === 'number') setAutoLockDelay(settings.autoLockDelay);
  goTo(loc, {
    once: settings.rememberLastGUI === false,
    fresh: settings.reloadGUI === true || settings.reloadAssets === true,
    quiet: settings.showPreloadStatus === false,
  });
}

/** CF.openURL, a button's href: a GUI it names is loaded (a browser of GUIs); a web page, tel:, mailto: go to the device's apps */
function openUrl(url: string) {
  const from = shown?.gui;
  if (isGuiUrl(url, from)) {
    const loc = parseLocation(url, from);
    if (loc) return goTo(loc);
  }
  openOutside(url).catch((e) => noteError(`opening ${url}: ${message(e)}`));
}

/** the GUI again, from its server (Ctrl+R, the address bar's reload) */
const reload = () => {
  if (shown) goTo(shown, { fresh: true });
};

// ── the address bar ───────────────────────────────────────────────

function showAddress() {
  if (document.activeElement !== address) address.value = shown ? formatLocation(shown) : (localStorage.getItem(GUI) ?? '');
  $<HTMLButtonElement>('back').disabled = !history.canBack();
  $<HTMLButtonElement>('forward').disabled = !history.canForward();
}

/** the address typed: a page of this GUI flips to it; this GUI again reloads it; another GUI is loaded */
function go() {
  const loc = parseLocation(address.value, shown?.gui);
  if (!loc) return;
  address.blur();
  if (shown && current && loc.gui === shown.gui) {
    if (loc.page && current.project.pages[loc.page]) {
      current.renderer.cfApi?.flipToPage(loc.page);
      return;
    }
    if (!loc.page) return goTo(loc, { fresh: true });
  }
  goTo(loc);
}
$('go').addEventListener('click', go);
address.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    go();
  } else if (e.key === 'Escape') {
    address.blur();
    showAddress();
  }
});
address.addEventListener('focus', () => address.select());
$('back').addEventListener('click', () => {
  const to = history.back();
  if (to) goTo(to);
});
$('forward').addEventListener('click', () => {
  const to = history.forward();
  if (to) goTo(to);
});
$('reload').addEventListener('click', reload);

function applyBar() {
  bar.hidden = !flag(BAR);
  showAddress();
  fit();
}

// ── running a GUI ─────────────────────────────────────────────────

/** Run it. */
async function show(m: Manifest) {
  await Promise.all([fontsIn, socketsClosed]);
  document.title = `${m.title} · iva panel`;
  loadingTitle(m.title);
  shownSize = m.size;
  // read from its archive (a browser: no app to unpack it): its size for each orientation, for when it's turned
  if (m.sizes) localStorage.setItem(SIZES + m.url, JSON.stringify(m.sizes));
  const startPage = sessionStorage.getItem(PAGE) ?? undefined;
  sessionStorage.removeItem(PAGE);
  current = await loadProject({
    guiXml: m.guiXml,
    project: m.project,
    onParsed: m.keepParsed,
    onProgress: projectProgress,
    renderer: rendererChoice(),
    app: appMade,
    renderOnDemand: onDemand(),
    imageMap: m.imageMap,
    atlas: m.atlas,
    scriptMap: m.scriptMap,
    canvas,
    fileUrl: m.fileUrl,
    guiUrl: m.url,
    loadGui: (next, settings) => loadGui(m.url, next, settings),
    openUrl,
    startPage,
    orientation,
    // not the preview's toolbar: its keys (H: the hand, Ctrl+R...) would take a hardware keyboard's
    menu: false,
    debugMode: flag(OUTLINE),
    disconnectOnSuspend: localStorage.getItem(DISCONNECT) !== '0',
    onOrientationChange: (o) => {
      orientation = o;
      fit();
    },
  });
  if (flag(FPS)) current.renderer.setShowFps(true);
  // a GUI with one orientation: shown in it, whichever way the device is
  orientation = (current.renderer.targetOrientation as Orientation | undefined) ?? orientation;
  shown = { gui: m.url, page: current.renderer.currentPageName ?? startPage };
  history.arrive(shown);
  const cf = current.renderer.cfApi;
  cf?.watch(cf.PageFlipEvent, (_from: string | null, to: string) => {
    shown = { gui: m.url, page: to };
    history.page(to);
    showAddress();
    // a page laid out the way the device is turned, after one that wasn't (a square GUI's): that way
    setTimeout(turned, 0);
  });
  showAddress();
  fit();
  void sizeWindow();
  say('');
  progress('done', '');
  loaded();
  // turned while it loaded
  turned();
  for (const p of m.problems) noteError(p);
  if (m.missingScripts.length) {
    noteError(`missing scripts: ${m.missingScripts.join(', ')}`);
    notice(`${m.missingScripts.length} script(s) missing: ${m.missingScripts.map((s) => s.split('/').pop()).join(', ')} - Ctrl+R loads again (details: three fingers, Ctrl+S)`);
  } else if (m.url === DEMO) {
    notice('The demo built into the panel - your own GUI: settings (three fingers on the screen, Ctrl+S or F1)');
  }
}

/** the copy kept of a GUI, under whichever spelling of its URL it was kept */
async function savedCopy(url: string): Promise<SavedGui | undefined> {
  for (const u of spellings(url)) {
    const s = await savedGui(u);
    if (s) return s;
  }
  return undefined;
}

// ── the files unpacked: a start doesn't unzip what one before did ──────

/** a start's stages, timed from the page's start (in the log; a slow phone's start told apart) */
const mark = (what: string) => console.info(`[panel] ${what}: ${Math.round(performance.now())} ms`);

/** this screen's shape, for the files unpacked: another (a size shaped otherwise) unpacks again */
const screenKey = () => (typeof screen === 'undefined' ? '' : `${Math.min(screen.width, screen.height)}x${Math.max(screen.width, screen.height)}`);

/** the copy kept's version, as the files unpacked from it know it */
const keptKey = (k: { savedAt: number; bytes: number }) => `kept ${k.savedAt} ${k.bytes} ${screenKey()}`;

/** the built-in demo's version: its archive's hash, as the panel's build saw it (vite.config.ts) */
declare const __IVA_DEMO__: string;

/**
 * The version of the archive a GUI runs from, as its files unpacked know it:
 * the app's own file (the built-in demo) by its hash, else by its size - as
 * the app answers (an answer without a size: none); a copy kept by when it
 * was kept. None: nothing unpacked to go by.
 */
async function unpackKey(url: string): Promise<string | undefined> {
  if (ownFile(url)) {
    if (typeof __IVA_DEMO__ === 'string' && __IVA_DEMO__ && url === DEMO) return `own ${__IVA_DEMO__} ${screenKey()}`;
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      const len = res.ok ? res.headers.get('content-length') : null;
      return len ? `own ${len} ${new URL(import.meta.url).pathname} ${screenKey()}` : undefined;
    } catch {
      return undefined;
    }
  }
  for (const u of spellings(url)) {
    const k = await keptGui(u).catch(() => undefined);
    if (k) return keptKey(k);
  }
  return undefined;
}

/**
 * the app's side: it downloads a GUI's archive to the device (kept there as the GUI's copy), unpacks it and packs its
 * images in sheets (src-tauri/src/unpack.rs) - a browser has none
 */
const native = isTauri();
if (native) {
  useArchives({
    fetch: (id, url, known) => invoke<Fetched>('gui_fetch', { args: { id, url, ...known } }),
    names: (id, savedAt) => invoke<string[]>('gui_archive', { id, savedAt }),
    text: (id, savedAt, name) => invoke<string>('gui_archive_text', { id, savedAt, name }),
  });
}

/** the size of the GUI shown (its folder in its archive), of several */
let shownSize: string | undefined;

/** a GUI's size for each orientation, as read from its archive when the app unpacked it */
function sizesOf(url: string): Record<Orientation, string> | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(SIZES + url) ?? 'null') as Record<Orientation, string> | null;
    return v && typeof v.landscape === 'string' && typeof v.portrait === 'string' ? v : undefined;
  } catch {
    return undefined;
  }
}

/** a GUI's files unpacked by the app: the folder, its files, whether its images are in sheets yet */
interface Unpacked {
  root: string;
  files: string[];
  packed: boolean;
  /** the GUI as parsed by a start before (its file), if the app keeps one */
  parsed?: string;
  /** how long unpacking took (unpacked just now) */
  ms?: number;
}

/** what the app says as it packs, in the log: how far it got, how long it took */
interface Packing {
  id: string;
  ms?: number;
  done?: number;
  total?: number;
  sheets?: number;
  images?: number;
  error?: string;
}
/** so many bytes in MB, as the loading screen says them */
const mb = (n: number) => (n / 1048576).toFixed(1);
if (native) {
  // a GUI's archive coming (gui_fetch): the bar fills with it
  void listen<{ id: string; done: number; total?: number }>('iva-gui-download', ({ payload: e }) =>
    progress('download', `Downloading the GUI: ${mb(e.done)}${e.total ? ` of ${mb(e.total)}` : ''} MB`, e.done, e.total));
  void listen<Packing>('iva-gui-packing', ({ payload: e }) => mark(`packing: ${e.done} of ${e.total} groups`));
  void listen<Packing>('iva-gui-packed', ({ payload: e }) =>
    e.error ? noteError(`packing ${e.id}'s images: ${e.error}`) : mark(`packed by the app: ${e.images} images in ${e.sheets} sheets in ${e.ms} ms`));
}

/** the GUI's files unpacked by the app from this version (its key), in the size this orientation runs, if they are */
async function unpackedFolder(url: string, key: string): Promise<Unpacked | null> {
  const size = sizesOf(url)?.[orientation];
  if (!native || size === undefined) return null;
  return invoke<Unpacked | null>('gui_unpacked', { id: url, version: key, size }).catch((e) => {
    noteError(`the files unpacked: ${message(e)}`);
    return null;
  });
}

/** bytes as base64 (the browser's own encoder) */
const base64 = (bytes: Uint8Array<ArrayBuffer>) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(new Blob([bytes]));
  });

/**
 * an archive to the app, in pieces (an Android web view hands the app strings, not bytes): its token - only a copy an
 * older panel kept here; one from a server the app downloads itself
 */
async function upload(bytes: Uint8Array<ArrayBuffer>): Promise<number> {
  const token = await invoke<number>('gui_upload_begin');
  const piece = 2 << 20;
  for (let at = 0; at < bytes.length; at += piece) {
    progress('unpacking', `Handing the GUI to the app: ${mb(at)} of ${mb(bytes.length)} MB`, at, bytes.length * 2);
    await invoke('gui_upload', { token, data: await base64(bytes.subarray(at, at + piece)) });
  }
  return token;
}

/** where an archive is, for the app to unpack: its bytes here, or a GUI's copy the app keeps (whose, when it came) */
type ZipAt = Uint8Array<ArrayBuffer> | { id: string; savedAt: number };

/** a copy's archive, where it is: the app's (it downloaded it), or here (an older panel's copy; a browser's) */
const zipOf = (s: SavedGui): ZipAt | undefined => (s.appZip ? { id: s.url, savedAt: s.savedAt } : s.zip);

/**
 * A GUI's archive unpacked by the app - the size this screen runs, into its
 * folder for this version (its key) - and the GUI from there: each file by
 * its URL, nothing unzipped here (a slow phone takes seconds to inflate a
 * thousand images, the app a fraction of one). The app reads the archive
 * itself - one it downloaded (a GUI's copy: `drop`, let go once unpacked),
 * its own (the built-in demo) - a copy an older panel kept here it's sent.
 * None: no app, no version, or it failed - the page unzips it, as a browser
 * does.
 */
async function unpacked(url: string, key: string | undefined, zip: ZipAt, drop = false): Promise<Manifest | null> {
  if (!native || !key) return null;
  try {
    progress('unpacking', 'Unpacking the GUI');
    const plan = await unpackPlan(zip instanceof Uint8Array ? zip : await appArchive(zip.id, zip.savedAt), url);
    const from = !(zip instanceof Uint8Array) ? { kept: zip, drop } : ownFile(url) ? { asset: decodeURIComponent(new URL(url).pathname) } : { upload: await upload(zip) };
    progress('unpacking', `Unpacking the GUI: ${plan.files.length} files`, 1, 2);
    const u = await invoke<Unpacked>('gui_unpack', { args: { id: url, version: key, size: plan.size, files: plan.files, atlas: plan.atlas, ...from } });
    // the size for each orientation: the next start finds the folder for the one it's turned
    localStorage.setItem(SIZES + url, JSON.stringify({ landscape: plan.sizes?.landscape ?? plan.size, portrait: plan.sizes?.portrait ?? plan.size }));
    mark(`unpacked by the app: ${u.files.length} files${u.ms === undefined ? ' (before)' : ` in ${u.ms} ms`}`);
    progress('reading', 'Reading the GUI');
    return keepParsed(await folderManifest(u, url), url, key);
  } catch (e) {
    noteError(`unpacking ${url}: ${message(e)}`);
    return null;
  }
}

/**
 * A GUI from the app's folder, parsed afresh this start (no kept parse, or
 * another build's): its parse kept beside its files for the next start
 * (written as it comes, before the GUI runs and changes it).
 */
function keepParsed(m: Manifest, url: string, key: string): Manifest {
  if (!native || m.project) return m;
  m.keepParsed = (project) => {
    const data = JSON.stringify({ stamp: PARSED_STAMP, project, index: m.index } satisfies KeptParse);
    void invoke('gui_keep_parsed', { id: url, version: key, size: m.size ?? '', data }).catch((e) => noteError(`keeping ${url}'s parse: ${message(e)}`));
  };
  return m;
}

/** A GUI from its copy kept: its zip unpacked by the app (the app's own copy; one an older panel kept here, sent to it), else read here. */
async function fromCopy(url: string, saved: SavedGui, key = keptKey(saved)): Promise<Manifest> {
  const zip = zipOf(saved);
  return (zip && (await unpacked(url, key, zip))) || savedManifest(saved);
}

/** What came from a GUI's server, to run: unpacked by the app (as version `key`), with what to keep of it - or read here. */
interface Served {
  m: Manifest;
  key?: string;
  copy?: SavedGui;
}

/**
 * A GUI from what its server gave: a zip unpacked by the app - one it
 * downloaded to the device (kept there as the GUI's copy, unless the
 * settings say no copy), the built-in demo among its own files - else read
 * here (a .gui; a browser; an archive the app couldn't unpack).
 */
async function served(url: string, got: Download): Promise<Served> {
  if (native && zipped(got)) {
    const copy = keepsCopy(got.url) ? await toSave(got) : undefined;
    const key = copy ? keptKey(copy) : got.archive ? keptKey(got.archive) : ownFile(url) ? await unpackKey(url) : undefined;
    const zip: ZipAt = got.archive ? { id: got.url, savedAt: got.archive.savedAt } : got.bytes!;
    const m = await unpacked(url, key, zip, !copy && !!got.archive);
    if (m) return { m, key, copy };
  }
  progress('reading', 'Reading the GUI');
  return { m: await manifestOf(got) };
}

/** What came from the server, shown, kept on the device behind the GUI running: unpacked by the app, its copy kept and its images packed for the next start. */
function keepServed(url: string, got: Download, s: Served) {
  if (!s.key) {
    if (!ownFile(url)) void keep(got, s.m);
    return;
  }
  const copy = s.copy;
  if (copy) void keepCopy(copy).then(() => (kept = copy)).catch((e) => noteError(`keeping ${got.url} on the device: ${message(e)}`));
  pack(url, s.key, s.m);
}

/** Its images packed in sheets by the app (behind the GUI running), for the next start - if they aren't. */
function pack(url: string, key: string | undefined, m: Manifest) {
  if (!native || !key || !m.toPack || m.atlas) return;
  void invoke('gui_pack', { args: { id: url, version: key, size: m.size ?? '', images: m.toPack() } }).catch((e) => noteError(`packing ${url}'s images: ${message(e)}`));
}

/**
 * The GUI: its copy on the device at once, if it has one - its server asked
 * for a newer one behind it - else from its server (then kept on the device).
 * Its server not there: the copy, else again in a while, as a panel on the
 * wall should.
 */
async function start() {
  mark('starting');
  // a page starting afresh: what the page before it left on the host (a server its reload didn't get
  // to close) goes before the GUI runs (show waits for it) - it would hold its port from this GUI's servers
  socketsClosed = closeHostSockets().then((left) => {
    if (!left.total) return;
    const what = ([['server', left.servers], ['connection', left.connections], ['UDP socket', left.udp], ['TLS connection', left.tls]] as [string, number][])
      .filter(([, n]) => n).map(([w, n]) => `${n} ${w}${n === 1 ? '' : 's'}`).join(', ');
    // seen in the settings' error list: a page that left these behind is a bug to look at
    noteError(`left on the host by the page before, closed now: ${what}`);
  });
  progress('starting', 'Starting');
  // the fonts and the graphics set up behind the GUI's reading (show waits for them)
  fontsIn = installFonts().then(() => mark('fonts in'));
  // (at a pixel's size: sized for the GUI - by loadProject, at 1 - then fitted to the screen)
  appMade = createApp(canvas, rendererChoice(), 1, 1, 1);
  void appMade.then(() => mark('graphics set up'), () => {});
  applyBar();
  const stored = sessionStorage.getItem(ONCE) ?? localStorage.getItem(GUI);
  // the first start: the built-in demo, as iViewer starts with one (the settings: a gesture away, as the notice says)
  if (!stored) return goTo({ gui: DEMO });
  const url = canonical(stored);
  if (url !== stored && !sessionStorage.getItem(ONCE)) localStorage.setItem(GUI, url);
  const fresh = sessionStorage.getItem(FRESH) === '1';
  sessionStorage.removeItem(FRESH);
  // the app's own files: from the app, always (a copy kept by an older version of it: let go)
  if (ownFile(url)) void forgetGui(url).catch(() => {});
  loadingTitle(url === DEMO ? 'The demo' : url.replace(/^[a-z]+:\/\//i, ''));
  // its files unpacked by the app from this version, a start before: nothing to read or unzip, its images in sheets
  const key = fresh ? undefined : await unpackKey(url);
  const folder = key ? await unpackedFolder(url, key) : null;
  if (folder) mark(`the app's folder: ${folder.files.length} files`);
  if (folder) progress('reading', 'Reading the GUI');
  const m = folder && key ? await folderManifest(folder, url).then((f) => keepParsed(f, url, key), (e) => void noteError(`the files unpacked: ${message(e)}`)) : undefined;
  if (folder && m && !m.missingScripts.length) {
    mark(`unpacked files found: ${folder.files.length}, ${m.atlas ? `${m.atlas.sheets.length} sheets` : 'no sheets yet'}`);
    await show(m);
    mark('shown');
    // the app stopped while it packed them: packed now
    pack(url, key, m);
    // the copy kept, for its server's newer version (behind the GUI running)
    if (!ownFile(url)) {
      void savedCopy(url).then((s) => {
        if (!s) return;
        kept = s;
        void usedGui(url).catch(() => {});
        void checkServer();
      }).catch(() => {});
    }
    return;
  }
  const saved = ownFile(url) ? undefined : await savedCopy(url).catch((e) => void noteError(`the copy kept: ${message(e)}`));
  if (saved && !fresh) {
    try {
      const key = keptKey(saved);
      progress('reading', 'Reading the copy kept on this device');
      const m = await fromCopy(url, saved, key);
      if (m.missingScripts.length) {
        // a copy with scripts missing (kept by an older panel from a load that lost them): its server first, if it answers
        try {
          const got = await fetchGui(url);
          const live = await served(url, got);
          await show(live.m);
          keepServed(url, got, live);
          return;
        } catch (e) {
          noteError(`${message(e)} - the copy kept runs, ${m.missingScripts.length} script(s) missing`);
        }
      }
      mark('the copy kept read');
      await show(m);
      mark('shown');
      kept = saved;
      pack(url, key, m);
      void usedGui(url).catch(() => {});
      void checkServer();
      return;
    } catch (e) {
      noteError(`the copy kept of ${url}: ${message(e)}`);
    }
  }
  try {
    progress('download', ownFile(url) ? 'Reading the GUI' : `Downloading the GUI from ${new URL(guiUrl(url)).host}`);
    const got = await fetchGui(url);
    // a zipped GUI (the built-in demo too): unpacked by the app, and a copy kept - by its version the app unpacked it as
    const live = await served(url, got);
    // the link lost scripts the server has: a whole copy kept runs instead (a GUI short of its start script runs nothing)
    if (live.m.missingScripts.length && saved) {
      try {
        const m = await fromCopy(url, saved);
        if (!m.missingScripts.length) {
          await show(m);
          kept = saved;
          notice(`the server's copy came short of ${live.m.missingScripts.length} script(s) - the copy kept on ${new Date(saved.savedAt).toLocaleString()} runs (Ctrl+R: again from the server)`);
          return;
        }
      } catch (e) {
        noteError(`the copy kept of ${url}: ${message(e)}`);
      }
    }
    mark('read');
    await show(live.m);
    mark('shown');
    keepServed(url, got, live);
  } catch (e) {
    const why = message(e);
    noteError(why);
    // the server's asked for and not there: the copy kept
    if (saved && !current) {
      try {
        await show(await fromCopy(url, saved));
        kept = saved;
        notice(`${why} - the copy kept on ${new Date(saved.savedAt).toLocaleString()} runs`);
        return;
      } catch (e2) {
        noteError(`the copy kept of ${url}: ${message(e2)}`);
      }
    }
    loaded(true);
    say(`${why} - trying again in 5 s (three fingers, Ctrl+S: settings)`);
    failed = true;
    retryLater();
  }
}

// ── the copies kept on the device ─────────────────────────────────

/** the copy of the GUI shown kept on the device: what the next start runs, what the server's is checked against */
let kept: SavedGui | null = null;

const noCopy = (): Set<string> => {
  try {
    const v = JSON.parse(localStorage.getItem(NO_COPY) ?? '[]') as unknown;
    return new Set(Array.isArray(v) ? (v as string[]) : []);
  } catch {
    return new Set();
  }
};
/** whether a copy of the GUI is kept on the device (the settings say; yes unless said otherwise) */
// the app's own files (the built-in demo) aren't kept: they're in the app, and a copy outlives an update of it
const keepsCopy = (url: string) => !ownFile(url) && !noCopy().has(url);
function setKeepsCopy(url: string, on: boolean) {
  const s = noCopy();
  if (on) s.delete(url);
  else s.add(url);
  localStorage.setItem(NO_COPY, JSON.stringify([...s]));
}

/**
 * A copy kept (the one before for its URL goes). The GUIs it pushes out of
 * the ones kept (store.ts) go on the app's side too - their files unpacked,
 * their archives - but not the one shown.
 */
async function keepCopy(s: SavedGui) {
  for (const u of await saveGui(s)) {
    if (u !== s.url && !(shown && spellings(shown.gui).includes(u))) void forgetCopy(u).catch((e) => noteError(message(e)));
  }
}

/** What came from the server, kept on the device (behind the GUI running): the next start runs it. */
async function keep(got: Download, m?: Manifest) {
  if (!keepsCopy(got.url)) return;
  try {
    const s = await toSave(got, m);
    await keepCopy(s);
    kept = s;
    // iva serve's whole build: unpacked and packed for the next start
    const zip = zipOf(s);
    if (zip) {
      const key = keptKey(s);
      void unpacked(got.url, key, zip).then((u) => u && pack(got.url, key, u));
    }
  } catch (e) {
    noteError(`keeping ${got.url} on the device: ${message(e)}`);
  }
}

/** The server asked for a newer version of the GUI kept: kept, and run now (on the page shown). */
let checking = false;
let checkedAt = 0;
async function checkServer() {
  if (!kept || checking) return;
  checking = true;
  checkedAt = Date.now();
  try {
    const newer = await newerVersion(kept);
    if (!newer) return;
    await keepCopy(newer);
    const page = current?.renderer.currentPageName;
    if (page) sessionStorage.setItem(PAGE, page);
    await letGo();
    location.reload();
  } catch (e) {
    // no server now: the copy runs on
    noteError(`asking for a newer GUI: ${message(e)}`);
  } finally {
    checking = false;
  }
}
// back in front: the server asked again (at most once a minute)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - checkedAt > 60_000) void checkServer();
});

/**
 * Put away and back (Android: the activity's onPause, onResume): the GUI
 * asleep and awake, as iViewer's - its systems disconnected (Disconnect on
 * Exit/Sleep), its servers' ports let go. The app tells the page before it
 * stops its timers: left to learn it's hidden, it may not before Android
 * freezes the app, whose servers would keep their ports with no one to
 * answer (iViewer couldn't open its own there). Awake once it stays so a
 * moment (CF's setAsleep): unlocking the screen pauses and resumes the app
 * a few times in a fraction of a second.
 */
(window as unknown as { ivaPanelSleep: (asleep: boolean) => void }).ivaPanelSleep = (asleep) => {
  current?.renderer.cfApi?.setAsleep(asleep);
};

/** the GUI didn't load: again in 5 s - not while the settings are open (the page would go from under the typing) */
let failed = false;
let retry = 0;
function retryLater() {
  clearTimeout(retry);
  if (failed && form.hidden) retry = window.setTimeout(() => location.reload(), 5000);
}

// ── settings ─────────────────────────────────────────────────────────

function openSettings() {
  clearTimeout(retry);
  input.value = localStorage.getItem(GUI) ?? '';
  options.bar.checked = flag(BAR);
  options.outline.checked = flag(OUTLINE);
  options.fps.checked = flag(FPS);
  options.onDemand.checked = onDemand();
  options.disconnect.checked = localStorage.getItem(DISCONNECT) !== '0';
  showAutoLock();
  options.renderer.value = rendererChoice();
  $('opt-renderer-now').textContent = current ? `(now: ${rendererLabel(current.app)})` : '';
  $('errors').textContent = errors.slice().reverse().join('\n');
  $('cancel').hidden = !current && !failed;
  void showCopies();
  form.hidden = false;
  input.focus();
}
function closeSettings() {
  form.hidden = true;
  retryLater();
}
const toggleSettings = () => (form.hidden ? openSettings() : closeSettings());

const size = (bytes: number) => (bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

/** the GUIs this panel knows - shown, the default, visited, kept - each with its copy's state and what to do with it */
async function showCopies() {
  const list = await keptGuis().catch((e) => {
    noteError(message(e));
    return [] as Kept[];
  });
  const urls = [...new Set([shown?.gui, localStorage.getItem(GUI), localStorage.getItem(DEFAULT_GUI), ...history.entries().map((e) => e.gui), ...list.map((k) => k.url)]
    .filter((u): u is string => !!u).map(canonical))];
  copies.replaceChildren(...urls.map((url) => copyRow(url, list.find((k) => spellings(url).includes(k.url)))));
}

/** a copy forgotten under every spelling of its URL */
const forgetCopy = (url: string) => Promise.all(spellings(url).flatMap((u) => (localStorage.removeItem(SIZES + u), [forgetGui(u), native ? invoke('gui_forget', { id: u }) : undefined])));

function copyRow(url: string, k: Kept | undefined): HTMLElement {
  const row = document.createElement('div');
  row.className = 'copy';
  const name = document.createElement('div');
  name.className = 'copy-url';
  name.textContent = url;
  const info = document.createElement('div');
  info.className = 'hint';
  const tags = [url === shown?.gui ? 'shown now' : '', url === localStorage.getItem(DEFAULT_GUI) ? 'the default' : ''].filter(Boolean);
  const state = k ? `Kept: ${size(k.bytes)}, ${new Date(k.savedAt).toLocaleString()}` : keepsCopy(url) ? 'No copy yet: kept once it loads from its server' : 'No copy kept';
  info.textContent = tags.length ? `${state} (${tags.join(', ')})` : state;
  const keepIt = document.createElement('label');
  keepIt.className = 'check';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = keepsCopy(url);
  box.addEventListener('change', () => {
    setKeepsCopy(url, box.checked);
    if (box.checked) void showCopies();
    else void forgetCopy(url).catch((e) => noteError(message(e))).then(showCopies);
  });
  keepIt.append(box, document.createTextNode(' Keep a copy on this device'));
  const button = (text: string, act: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'small';
    b.textContent = text;
    b.addEventListener('click', act);
    return b;
  };
  const actions = document.createElement('div');
  actions.className = 'row';
  actions.append(
    button('Open', () => goTo({ gui: url })),
    button('Save now', () => void saveNow(url)),
    button('Clear', () => void forgetCopy(url).catch((e) => noteError(message(e))).then(showCopies)),
  );
  row.append(name, info, keepIt, actions);
  return row;
}

/** the GUI from its server, kept now - before its turn to run */
async function saveNow(url: string) {
  setKeepsCopy(url, true);
  try {
    await keep(await fetchGui(url));
  } catch (e) {
    noteError(`saving ${url}: ${message(e)}`);
  }
  void showCopies();
}
$('clear-all').addEventListener('click', () => void Promise.all([forgetAllGuis(), native ? invoke('gui_forget', { id: null }) : undefined]).catch((e) => noteError(message(e))).then(showCopies));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const loc = parseLocation(input.value);
  if (!loc) return;
  localStorage.setItem(DEFAULT_GUI, loc.gui);
  goTo(loc);
});
$('demo').addEventListener('click', () => {
  input.value = DEMO;
  form.requestSubmit();
});
$('cancel').addEventListener('click', closeSettings);
options.bar.addEventListener('change', () => {
  setFlag(BAR, options.bar.checked);
  applyBar();
});
options.outline.addEventListener('change', () => {
  setFlag(OUTLINE, options.outline.checked);
  current?.renderer.setDebugMode(options.outline.checked);
});
options.onDemand.addEventListener('change', () => {
  localStorage.setItem(ON_DEMAND, options.onDemand.checked ? '1' : '0');
  current?.renderer.setRenderOnDemand(options.onDemand.checked);
});
options.fps.addEventListener('change', () => {
  setFlag(FPS, options.fps.checked);
  current?.renderer.setShowFps(options.fps.checked);
});
/** the delay set in the list - one it hasn't (a script's) added to it */
function showAutoLock() {
  const m = String(autoLockDelay());
  const list = options.autoLock;
  if (![...list.options].some((o) => o.value === m)) list.add(new Option(`${m} minutes`, m));
  list.value = m;
  list.disabled = !device;
}
options.autoLock.addEventListener('change', () => setAutoLockDelay(Number(options.autoLock.value)));
// another kind of drawing: a canvas takes one for good - the panel again, with a new one
options.renderer.addEventListener('change', () => {
  localStorage.setItem(RENDERER, options.renderer.value);
  location.reload();
});
options.disconnect.addEventListener('change', () => {
  localStorage.setItem(DISCONNECT, options.disconnect.checked ? '1' : '0');
  if (current?.renderer.cfApi) current.renderer.cfApi.disconnectOnSuspend = options.disconnect.checked;
});
getVersion().then((v) => {
  $('about').textContent = `iva panel ${v}`;
}, () => {});

// three fingers on the screen (held a moment), or one in the top-left corner held 3 s: settings (the GUI still gets the touches)
const down = new Map<number, { x: number; y: number }>();
let hold = 0;
function rearm() {
  clearTimeout(hold);
  const pts = [...down.values()];
  const corner = pts.length === 1 && pts[0].x < 48 && pts[0].y < 48;
  if (form.hidden && (pts.length >= 3 || corner)) hold = window.setTimeout(openSettings, corner ? 3000 : 400);
}
addEventListener('pointerdown', (e) => {
  down.set(e.pointerId, { x: e.clientX, y: e.clientY });
  rearm();
}, true);
for (const type of ['pointerup', 'pointercancel'] as const) {
  addEventListener(type, (e) => {
    down.delete(e.pointerId);
    rearm();
  }, true);
}
// a keyboard (a phone's own, a desktop's): Ctrl+S / F1 the settings, Ctrl+R the GUI again from its server, Ctrl+L the address bar, Escape closes
addEventListener('keydown', (e) => {
  const ctrl = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (e.key === 'F1' || (ctrl && (e.code === 'KeyS' || key === 's'))) {
    e.preventDefault();
    toggleSettings();
  } else if (ctrl && (e.code === 'KeyR' || key === 'r')) {
    e.preventDefault();
    reload();
  } else if (ctrl && (e.code === 'KeyL' || key === 'l') && !bar.hidden) {
    e.preventDefault();
    address.focus();
  } else if (e.key === 'Escape' && !form.hidden) {
    closeSettings();
  }
});

// the systems' sockets closed with the page (a reload, CF.loadGUI)
addEventListener('pagehide', () => {
  try {
    (window as any).CF?.stopSystems?.();
  } catch {
    /* the page is going away */
  }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

start().catch((e) => {
  console.error(e);
  loaded(true);
  say(String(e?.message ?? e));
});

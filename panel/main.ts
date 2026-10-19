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
import { installHost } from '../src/runtime/stdlib';
import { loadProject, rendererLabel, type LoadProjectResult, type Orientation, type RendererChoice } from '../src/runtime/cf';
import { createIvaHost } from '../src/runtime/host';
import { closeHostSockets } from '../src/runtime/host/net/provider';
import { installFonts } from '../src/preview/fonts';
import { formatLocation, History, isGuiUrl, parseLocation, type GuiLocation } from '../src/runtime/location';
import { folderManifest, loadManifest, newerVersion, ownFile, savedManifest, toSave, type Download, type Manifest } from './loader';
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
/** the GUI shown and the page it is on: the address bar's text */
let shown: GuiLocation | null = null;
/** this load without the loading text */
const quiet = sessionStorage.getItem(QUIET) === '1';
sessionStorage.removeItem(QUIET);
/** the orientation the window asks for: clearly taller or wider - a nearly square one keeps what there is (landscape at first) */
const wanted = (now: Orientation): Orientation =>
  innerHeight > innerWidth * 1.15 ? 'portrait' : innerWidth > innerHeight * 1.15 ? 'landscape' : now;
let orientation: Orientation = wanted('landscape');
/** a line under the GUI while there is none shown (loading, failing); a GUI shown has the screen to itself */
const say = (text: string, loading = false) => {
  status.textContent = current || (loading && quiet) ? '' : text;
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
  if (want !== orientation && page && (current.project.pages[page]?.[want]?.length ?? 0) > 0) {
    current.renderer.navigate(page, want);
    orientation = (current.renderer.targetOrientation as Orientation | undefined) ?? want;
  }
  fit();
}
addEventListener('resize', turned);
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
  document.title = `${m.title} · iva panel`;
  const startPage = sessionStorage.getItem(PAGE) ?? undefined;
  sessionStorage.removeItem(PAGE);
  current = await loadProject({
    guiXml: m.guiXml,
    renderer: rendererChoice(),
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
  });
  showAddress();
  fit();
  void sizeWindow();
  say('');
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

/**
 * The version of the archive a GUI runs from, as its files unpacked know it:
 * the app's own file (the built-in demo) by its size and this build of the
 * panel; a copy kept by when it was kept. None: nothing unpacked to go by.
 */
async function unpackKey(url: string): Promise<string | undefined> {
  if (ownFile(url)) {
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

/** the app's side: it unpacks a GUI's archive and packs its images in sheets (src-tauri/src/unpack.rs) - a browser has none */
const native = isTauri();

/** a GUI's files unpacked by the app: the folder, its files, whether its images are in sheets yet */
interface Unpacked {
  root: string;
  files: string[];
  packed: boolean;
}

/** what the app says as it unpacks and packs, in the log: how long each took */
interface Unpacking {
  id: string;
  ms?: number;
  done?: number;
  total?: number;
  sheets?: number;
  images?: number;
  error?: string;
}
if (native) {
  void listen<Unpacking>('iva-gui-unpacked', ({ payload: e }) =>
    e.error ? noteError(`unpacking ${e.id}: ${e.error}`) : mark(`unpacked by the app: ${e.done} files in ${e.ms} ms`));
  void listen<Unpacking>('iva-gui-packing', ({ payload: e }) => mark(`packing: ${e.done} of ${e.total} groups`));
  void listen<Unpacking>('iva-gui-packed', ({ payload: e }) =>
    e.error ? noteError(`packing ${e.id}'s images: ${e.error}`) : mark(`packed by the app: ${e.images} images in ${e.sheets} sheets in ${e.ms} ms`));
}

/** the GUI's files unpacked by the app from this version (its key), if they are */
async function unpackedFolder(url: string, key: string): Promise<Unpacked | null> {
  if (!native) return null;
  return invoke<Unpacked | null>('gui_unpacked', { id: url, version: key }).catch((e) => {
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

/** an archive to the app, in pieces (an Android web view hands the app strings, not bytes): its token */
async function upload(bytes: Uint8Array<ArrayBuffer>): Promise<number> {
  const token = await invoke<number>('gui_upload_begin');
  const piece = 2 << 20;
  for (let at = 0; at < bytes.length; at += piece) await invoke('gui_upload', { token, data: await base64(bytes.subarray(at, at + piece)) });
  return token;
}

/**
 * A GUI that ran from its archive, unpacked by the app for the next start
 * and its images packed in sheets (behind the GUI running): the app's own
 * (the built-in demo) it reads itself, any other it's sent.
 */
async function adapt(url: string, key: string | undefined, m: Manifest) {
  if (!native || !key || !m.adapt) return;
  try {
    if (await unpackedFolder(url, key)) return;
    const plan = m.adapt();
    const own = ownFile(url);
    if (!own && !plan.bytes) return;
    const args = {
      id: url, version: key, files: plan.files, atlas: plan.atlas, images: plan.images,
      ...(own ? { asset: decodeURIComponent(new URL(url).pathname) } : { upload: await upload(plan.bytes!) }),
    };
    await invoke('gui_unpack', { args });
    mark(`to the app to unpack: ${plan.files.length} files, ${plan.images.length} images to pack`);
  } catch (e) {
    noteError(`unpacking ${url} for the next start: ${message(e)}`);
  }
}

/**
 * The GUI: its copy on the device at once, if it has one - its server asked
 * for a newer one behind it - else from its server (then kept on the device).
 * Its server not there: the copy, else again in a while, as a panel on the
 * wall should.
 */
async function start() {
  // a page starting afresh: what the page before it left on the host (a server its reload didn't get
  // to close) goes first - it would hold its port from this GUI's servers
  const left = await closeHostSockets();
  if (left.total) {
    const what = ([['server', left.servers], ['connection', left.connections], ['UDP socket', left.udp], ['TLS connection', left.tls]] as [string, number][])
      .filter(([, n]) => n).map(([w, n]) => `${n} ${w}${n === 1 ? '' : 's'}`).join(', ');
    // seen in the settings' error list: a page that left these behind is a bug to look at
    noteError(`left on the host by the page before, closed now: ${what}`);
  }
  mark('starting');
  await installFonts();
  mark('fonts in');
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
  // its files unpacked by the app from this version, a start before: nothing to read or unzip, its images in sheets
  const key = fresh ? undefined : await unpackKey(url);
  const unpacked = key ? await unpackedFolder(url, key) : null;
  const m = unpacked ? await folderManifest(unpacked, url).catch((e) => void noteError(`the files unpacked: ${message(e)}`)) : undefined;
  if (unpacked && m && !m.missingScripts.length) {
    mark(`unpacked files found: ${unpacked.files.length}, ${m.atlas ? `${m.atlas.sheets.length} sheets` : 'no sheets yet'}`);
    await show(m);
    mark('shown');
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
      const m = await savedManifest(saved);
      if (m.missingScripts.length) {
        // a copy with scripts missing (kept by an older panel from a load that lost them): its server first, if it answers
        try {
          const live = await loadManifest(url);
          await show(live.manifest);
          void keep(live.got, live.manifest);
          return;
        } catch (e) {
          noteError(`${message(e)} - the copy kept runs, ${m.missingScripts.length} script(s) missing`);
        }
      }
      mark('the copy kept read');
      await show(m);
      mark('shown');
      kept = saved;
      void adapt(url, keptKey(saved), m);
      void usedGui(url).catch(() => {});
      void checkServer();
      return;
    } catch (e) {
      noteError(`the copy kept of ${url}: ${message(e)}`);
    }
  }
  say(`loading ${url}…`, true);
  try {
    const { manifest, got } = await loadManifest(url);
    // the link lost scripts the server has: a whole copy kept runs instead (a GUI short of its start script runs nothing)
    if (manifest.missingScripts.length && saved) {
      try {
        const m = await savedManifest(saved);
        if (!m.missingScripts.length) {
          await show(m);
          kept = saved;
          notice(`the server's copy came short of ${manifest.missingScripts.length} script(s) - the copy kept on ${new Date(saved.savedAt).toLocaleString()} runs (Ctrl+R: again from the server)`);
          return;
        }
      } catch (e) {
        noteError(`the copy kept of ${url}: ${message(e)}`);
      }
    }
    mark('read');
    await show(manifest);
    mark('shown');
    if (ownFile(url)) void unpackKey(url).then((k) => adapt(url, k, manifest));
    else void keep(got, manifest);
  } catch (e) {
    const why = message(e);
    noteError(why);
    // the server's asked for and not there: the copy kept
    if (saved && !current) {
      try {
        await show(await savedManifest(saved));
        kept = saved;
        notice(`${why} - the copy kept on ${new Date(saved.savedAt).toLocaleString()} runs`);
        return;
      } catch (e2) {
        noteError(`the copy kept of ${url}: ${message(e2)}`);
      }
    }
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

/** What came from the server, kept on the device (behind the GUI running): the next start runs it. */
async function keep(got: Download, m: Manifest) {
  if (!keepsCopy(got.url)) return;
  try {
    const s = await toSave(got, m);
    await saveGui(s);
    kept = s;
    void adapt(got.url, keptKey(s), m);
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
    await saveGui(newer);
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
const forgetCopy = (url: string) => Promise.all(spellings(url).flatMap((u) => [forgetGui(u), native ? invoke('gui_forget', { id: u }) : undefined]));

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
    const { manifest, got } = await loadManifest(url);
    await keep(got, manifest);
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
  say(String(e?.message ?? e));
});

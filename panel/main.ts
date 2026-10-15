/**
 * iva panel: a GUI (.gui) on iva's own runtime, full screen - what iViewer
 * does on a panel. Systems and scripts get real sockets from the app
 * (src-tauri: the runtime's host commands); the GUI comes from a web server -
 * a .gui, a zipped GUI, iva serve's address (live reload and all).
 *
 * Settings (the GUI's URL): on first start, then a three-finger hold, a long
 * press in the top-left corner, or F1.
 */
import { getVersion } from '@tauri-apps/api/app';
import { installHost } from '../src/runtime/stdlib';
import { loadProject, type LoadProjectResult, type Orientation } from '../src/runtime/cf';
import { createIvaHost } from '../src/runtime/host';
import { installFonts } from '../src/preview/fonts';
import { guiUrl, loadManifest, newerVersion, savedManifest, toSave, type Download, type Manifest } from './loader';
import { forgetGui, keptGui, saveGui, savedGui, usedGui, type SavedGui } from './store';

/** localStorage: the GUI's URL; sessionStorage: the page CF.loadGUI asked for */
const GUI = 'iva-panel:gui';
const PAGE = 'iva-panel:page';
/** localStorage: iViewer's "Disconnect on Exit/Sleep" ('0': off), as CF.loadGUI last set it */
const DISCONNECT = 'iva-panel:disconnectOnSuspend';
/** sessionStorage: CF.loadGUI asked for the server's GUI, not the copy kept (its reloadGUI) */
const FRESH = 'iva-panel:fresh';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $<HTMLDivElement>('stage');
const canvas = $<HTMLCanvasElement>('canvas');
const status = $<HTMLDivElement>('status');
const form = $<HTMLFormElement>('settings');
const input = $<HTMLInputElement>('url');

let current: LoadProjectResult | null = null;
/** the orientation the window asks for: clearly taller or wider - a nearly square one keeps what there is (landscape at first) */
const wanted = (now: Orientation): Orientation =>
  innerHeight > innerWidth * 1.15 ? 'portrait' : innerWidth > innerHeight * 1.15 ? 'landscape' : now;
let orientation: Orientation = wanted('landscape');
const say = (text: string) => {
  status.textContent = text;
};

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

installHost(createIvaHost());

/** the GUI's size in the orientation shown */
function guiSize(o: Orientation) {
  const p = current?.project.properties;
  return o === 'landscape'
    ? { w: p?.landscape?.width || 1024, h: p?.landscape?.height || 768 }
    : { w: p?.portrait?.width || 768, h: p?.portrait?.height || 1024 };
}

/** as large as the screen takes it, its aspect kept; drawn at the screen's pixels (sharp, as iViewer scales a GUI up) */
function fit() {
  if (!current) return;
  const { w, h } = guiSize(orientation);
  const s = Math.min(innerWidth / w, innerHeight / h);
  stage.style.width = `${Math.round(w * s)}px`;
  stage.style.height = `${Math.round(h * s)}px`;
  current.app.renderer.resize(w, h, s * (devicePixelRatio || 1));
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

/** CF.loadGUI / a cf:// link: that GUI ('' this one again), in a fresh page - the runtime keeps its globals per page */
function loadGui(from: string, url: string, settings: Record<string, unknown>) {
  localStorage.setItem(GUI, url ? new URL(guiUrl(url), from).href : from);
  if (typeof settings.startPage === 'string' && settings.startPage) sessionStorage.setItem(PAGE, settings.startPage);
  if (typeof settings.disconnectOnSuspend === 'boolean') localStorage.setItem(DISCONNECT, settings.disconnectOnSuspend ? '1' : '0');
  // "Reload GUI" (iva serve's live reload): the server's, not the copy kept
  if (settings.reloadGUI === true || settings.reloadAssets === true) sessionStorage.setItem(FRESH, '1');
  location.reload();
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Run it. */
async function show(m: Manifest) {
  document.title = `${m.title} · iva panel`;
  const startPage = sessionStorage.getItem(PAGE) ?? undefined;
  sessionStorage.removeItem(PAGE);
  current = await loadProject({
    guiXml: m.guiXml,
    imageMap: m.imageMap,
    scriptMap: m.scriptMap,
    canvas,
    fileUrl: m.fileUrl,
    guiUrl: m.url,
    loadGui: (next, settings) => loadGui(m.url, next, settings),
    startPage,
    orientation,
    // not the preview's toolbar: its keys (H: the hand, Ctrl+R...) would take a hardware keyboard's
    menu: false,
    disconnectOnSuspend: localStorage.getItem(DISCONNECT) !== '0',
    onOrientationChange: (o) => {
      orientation = o;
      fit();
    },
  });
  // a GUI with one orientation: shown in it, whichever way the device is
  orientation = (current.renderer.targetOrientation as Orientation | undefined) ?? orientation;
  fit();
  say(m.missingScripts.length ? `missing scripts: ${m.missingScripts.join(', ')}` : '');
}

/**
 * The GUI: its copy on the device at once, if it has one - its server asked
 * for a newer one behind it - else from its server (then kept on the device).
 * Its server not there: the copy, else again in a while, as a panel on the
 * wall should.
 */
async function start() {
  await installFonts();
  const url = localStorage.getItem(GUI);
  if (!url) {
    openSettings();
    return;
  }
  const fresh = sessionStorage.getItem(FRESH) === '1';
  sessionStorage.removeItem(FRESH);
  const saved = await savedGui(url).catch((e) => void noteError(`the copy kept: ${message(e)}`));
  if (saved && !fresh) {
    try {
      await show(await savedManifest(saved));
      kept = saved;
      void usedGui(url).catch(() => {});
      void checkServer();
      return;
    } catch (e) {
      noteError(`the copy kept of ${url}: ${message(e)}`);
    }
  }
  say(`loading ${url}…`);
  try {
    const { manifest, got } = await loadManifest(url);
    await show(manifest);
    void keep(got, manifest);
  } catch (e) {
    const why = message(e);
    noteError(why);
    // the server's asked for and not there: the copy kept
    if (saved && !current) {
      try {
        await show(await savedManifest(saved));
        kept = saved;
        say(`${why} - the copy kept on ${new Date(saved.savedAt).toLocaleString()}`);
        setTimeout(() => say(''), 8000);
        return;
      } catch (e2) {
        noteError(`the copy kept of ${url}: ${message(e2)}`);
      }
    }
    say(`${why} - trying again in 5 s (three fingers held: settings)`);
    failed = true;
    retryLater();
  }
}

/** the copy of the GUI shown kept on the device: what the next start runs, what the server's is checked against */
let kept: SavedGui | null = null;

/** What came from the server, kept on the device (behind the GUI running): the next start runs it. */
async function keep(got: Download, m: Manifest) {
  try {
    const s = await toSave(got, m);
    await saveGui(s);
    kept = s;
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
  $('errors').textContent = errors.slice().reverse().join('\n');
  $('cancel').hidden = !current && !failed;
  void showKept();
  form.hidden = false;
  input.focus();
}

/** whether the GUI is kept on the device, since when */
async function showKept() {
  const url = localStorage.getItem(GUI);
  const k = url ? await keptGui(url).catch(() => undefined) : undefined;
  $('saved').textContent = k
    ? `Kept on this device (${new Date(k.savedAt).toLocaleString()}, ${k.bytes < 1048576 ? `${Math.ceil(k.bytes / 1024)} KB` : `${(k.bytes / 1048576).toFixed(1)} MB`}): it starts without its server.`
    : url ? 'Not kept on this device yet: it is once it has loaded from its server.' : '';
  $('forget').hidden = !k;
}
$('forget').addEventListener('click', () => {
  const url = localStorage.getItem(GUI);
  if (url) void forgetGui(url).then(showKept, (e) => noteError(message(e)));
});
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input.value.trim();
  if (!v) return;
  localStorage.setItem(GUI, guiUrl(v));
  location.reload();
});
$('cancel').addEventListener('click', () => {
  form.hidden = true;
  retryLater();
});
getVersion().then((v) => {
  $('about').textContent = `iva panel ${v}`;
}, () => {});

// three fingers held 1.5 s, or one in the top-left corner held 3 s: settings (the GUI still gets the touches)
const down = new Map<number, { x: number; y: number }>();
let hold = 0;
function rearm() {
  clearTimeout(hold);
  const pts = [...down.values()];
  const corner = pts.length === 1 && pts[0].x < 48 && pts[0].y < 48;
  if (form.hidden && (pts.length >= 3 || corner)) hold = window.setTimeout(openSettings, corner ? 3000 : 1500);
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
addEventListener('keydown', (e) => {
  if (e.key === 'F1' && form.hidden) openSettings();
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

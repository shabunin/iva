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
import { guiUrl, loadManifest } from './loader';

/** localStorage: the GUI's URL; sessionStorage: the page CF.loadGUI asked for */
const GUI = 'iva-panel:gui';
const PAGE = 'iva-panel:page';

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
  location.reload();
}

async function start() {
  await installFonts();
  const url = localStorage.getItem(GUI);
  if (!url) {
    openSettings();
    return;
  }
  say(`loading ${url}…`);
  try {
    const m = await loadManifest(url);
    document.title = `${m.title} · iva panel`;
    const startPage = sessionStorage.getItem(PAGE) ?? undefined;
    sessionStorage.removeItem(PAGE);
    current = await loadProject({
      guiXml: m.guiXml,
      imageMap: m.imageMap,
      scriptMap: m.scriptMap,
      canvas,
      fileUrl: m.fileUrl,
      loadGui: (next, settings) => loadGui(m.url, next, settings),
      startPage,
      orientation,
      onOrientationChange: (o) => {
        orientation = o;
        fit();
      },
    });
    // a GUI with one orientation: shown in it, whichever way the device is
    orientation = (current.renderer.targetOrientation as Orientation | undefined) ?? orientation;
    fit();
    say(m.missingScripts.length ? `missing scripts: ${m.missingScripts.join(', ')}` : '');
  } catch (e) {
    // its server isn't there (yet): again in a while, as a panel on the wall should
    const why = e instanceof Error ? e.message : String(e);
    noteError(why);
    say(`${why} - trying again in 5 s (three fingers held: settings)`);
    setTimeout(() => location.reload(), 5000);
  }
}

// ── settings ─────────────────────────────────────────────────────────

function openSettings() {
  input.value = localStorage.getItem(GUI) ?? '';
  $('errors').textContent = errors.slice().reverse().join('\n');
  $('cancel').hidden = !current;
  form.hidden = false;
  input.focus();
}
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input.value.trim();
  if (!v) return;
  localStorage.setItem(GUI, guiUrl(v));
  location.reload();
});
$('cancel').addEventListener('click', () => {
  form.hidden = true;
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

import { installHost } from '../runtime/stdlib';
import { loadProject, type Orientation, type LoadProjectResult } from '../runtime/cf';
import { createIvaHost } from '../runtime/host';
import { control, ensureConnected } from '../runtime/host/bridge/transport';
import { installFonts } from './fonts';

interface GuiEntry { rel: string; name: string }
interface Manifest {
  gui: string;
  title: string;
  guiXml: string;
  imageMap: Record<string, string>;
  scriptMap: Record<string, string>;
  missingScripts: string[];
  fileBase: string;
}

// Errors from the runtime and project scripts: counted in the status bar,
// kept in window.__ivaErrors for tooling.
const errors: string[] = ((window as any).__ivaErrors = []);
const noteError = (text: string) => {
  errors.push(text);
  const el = document.getElementById('errors');
  if (el) {
    el.hidden = false;
    el.textContent = `${errors.length} error${errors.length > 1 ? 's' : ''}`;
    el.title = errors.slice(-10).join('\n');
  }
};
const consoleError = console.error.bind(console);
/** Something logged, as text (never throws: objects can be circular). */
const describe = (a: unknown): string => {
  if (a instanceof Error) return a.message;
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a) ?? String(a);
  } catch {
    return String(a);
  }
};
console.error = (...args: unknown[]) => {
  try {
    noteError(args.map(describe).join(' '));
  } finally {
    consoleError(...args);
  }
};
window.addEventListener('error', (e) => noteError(`${e.message} (${e.filename?.split('/').pop()}:${e.lineno})`));
window.addEventListener('unhandledrejection', (e) => noteError(`unhandled: ${e.reason?.message ?? e.reason}`));

installHost(createIvaHost());
ensureConnected();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = $<HTMLSelectElement>('picker');
const status = $<HTMLSpanElement>('status');
const stage = $<HTMLDivElement>('stage');
const canvas = $<HTMLCanvasElement>('canvas');
const chrome = $<HTMLDivElement>('chrome');

const params = new URLSearchParams(location.search);
let orientation: Orientation = params.get('o') === 'portrait' ? 'portrait' : 'landscape';
let current: LoadProjectResult | null = null;
/** the GUI shown: a .gui of the project (its path), or a URL */
let shown = '';

function setStatus(text: string, kind: 'ok' | 'warn' | 'err' = 'ok') {
  status.textContent = text;
  status.dataset.kind = kind;
}

function size(o: Orientation) {
  const p = current?.project.properties;
  return o === 'landscape'
    ? { w: p?.landscape?.width || 1024, h: p?.landscape?.height || 768 }
    : { w: p?.portrait?.width || 768, h: p?.portrait?.height || 1024 };
}

function fitStage() {
  const { w, h } = size(orientation);
  stage.style.aspectRatio = `${w} / ${h}`;
  stage.style.setProperty('--w', String(w));
  stage.style.setProperty('--h', String(h));
}

function setOrientation(o: Orientation) {
  orientation = o;
  const url = new URL(location.href);
  url.searchParams.set('o', o);
  history.replaceState(null, '', url);
  if (!current) return;
  const { w, h } = size(o);
  current.app.renderer.resize(w, h);
  if (current.renderer.currentPageName) current.renderer.navigate(current.renderer.currentPageName, o);
  current.menu?.followOrientation(o);
  fitStage();
}

/**
 * CF.loadGUI / a cf:// link: the GUI it names (the server says where that
 * is: a .gui of the project by that name, else the URL), '' this one again;
 * in a new page - the runtime keeps globals (CF, scripts, sockets) per page.
 */
async function loadGui(url: string, settings: Record<string, unknown>) {
  let gui = shown;
  if (url) {
    setStatus(`loading ${url}…`);
    const res = await fetch(`/__iva/resolve?from=${encodeURIComponent(shown)}&url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      setStatus(`CF.loadGUI(${url}): ${await res.text()}`, 'err');
      return;
    }
    const r: { gui: string; note?: string } = await res.json();
    gui = r.gui;
    if (r.note) sessionStorage.setItem('iva-note', r.note);
  }
  const next = new URL(location.href);
  next.searchParams.set('gui', gui);
  if (typeof settings.startPage === 'string' && settings.startPage) next.searchParams.set('page', settings.startPage);
  else next.searchParams.delete('page');
  location.href = next.toString();
}

async function boot(gui: string) {
  shown = gui;
  setStatus(`loading ${gui}…`);
  const res = await fetch(`/__iva/manifest?gui=${encodeURIComponent(gui)}`);
  if (!res.ok) {
    showBuildError(await res.text());
    setStatus('build failed', 'err');
    return;
  }
  const m: Manifest = await res.json();
  document.title = `${m.title} · iva`;
  current = await loadProject({
    guiXml: m.guiXml,
    imageMap: m.imageMap,
    scriptMap: m.scriptMap,
    canvas,
    // a web view's url="page.html": the project's own file
    fileUrl: (name) => m.fileBase + name.split('/').map(encodeURIComponent).join('/'),
    // http://127.0.0.1:<port>/ is the panel itself: its server runs in iva dev's backend
    webUrl: (url) => {
      const lo = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::(\d+))?(\/[^#]*)?(#.*)?$/i.exec(url);
      return lo ? `/__iva/loop/${lo[1] ?? '80'}${lo[2] ?? '/'}${lo[3] ?? ''}` : undefined;
    },
    loadGui: (url, settings) => void loadGui(url, settings),
    // where it came from: a URL, else the project's .gui on this server
    guiUrl: /^(https?|cf):\/\//i.test(m.gui) ? m.gui : new URL(m.fileBase + m.gui.split('/').pop(), location.href).href,
    startPage: params.get('page') ?? undefined,
    orientation,
    onOrientationChange: (o) => setOrientation(o),
    menu: {
      mount: chrome,
      placement: 'bar',
      fullscreenTarget: stage,
      host: { reload: () => location.reload() },
    },
  });
  // a GUI with one orientation: the renderer showed the other while loading - the panel's size follows
  const turned = current.renderer.targetOrientation as Orientation | undefined;
  const want = size(turned ?? orientation);
  if (turned && (turned !== orientation || current.app.screen.width !== want.w || current.app.screen.height !== want.h)) setOrientation(turned);
  fitStage();
  const warn = m.missingScripts.length ? ` · missing scripts: ${m.missingScripts.join(', ')}` : '';
  // how a link got here (cf://... -> the project's own .gui)
  const note = sessionStorage.getItem('iva-note');
  sessionStorage.removeItem('iva-note');
  setStatus(`${m.title}${note ? ` · ${note}` : ''}${warn}`, warn ? 'warn' : 'ok');
}

async function main() {
  await installFonts();
  const guis: GuiEntry[] = await (await fetch('/__iva/guis')).json();
  if (!guis.length) {
    setStatus('no .gui files found', 'err');
    return;
  }
  const asked = params.get('gui') ?? '';
  // a GUI of the project, or one from a web server (a link, CF.loadGUI)
  const chosen = guis.some((g) => g.rel === asked) || /^(https?|cf):\/\//i.test(asked) ? asked : guis[0].rel;
  if (!guis.some((g) => g.rel === chosen)) guis.push({ rel: chosen, name: chosen });
  for (const g of guis) picker.add(new Option(g.name, g.rel, false, g.rel === chosen));
  picker.hidden = guis.length < 2;
  picker.onchange = () => {
    const url = new URL(location.href);
    url.searchParams.set('gui', picker.value);
    // a fresh page: cf-runtime keeps globals (CF, scripts, sockets) per page
    location.href = url.toString();
  };
  await boot(chosen);
}

/** A failed build: the message over the last good panel, until the next good build reloads. */
function showBuildError(text: string) {
  const box = $<HTMLDivElement>('build-error');
  box.querySelector('pre')!.textContent = text;
  box.hidden = false;
}

control.onMessage = (msg) => {
  if (msg.t === 'reload') location.reload();
  else if (msg.t === 'error') {
    showBuildError(msg.text);
    setStatus('build failed', 'err');
  }
  else if (msg.t === 'backend-closed') setStatus('iva dev stopped - reload when it is back', 'err');
};

const stopSystems = () => {
  try { (window as any).CF?.stopSystems?.(); } catch { /* page is going away */ }
};
window.addEventListener('pagehide', stopSystems);
document.addEventListener('contextmenu', (e) => e.preventDefault());

main().catch((e) => {
  console.error(e);
  setStatus(String(e?.message ?? e), 'err');
});

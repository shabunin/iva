import { installStdlib } from '@agapi/stdlib';
import { loadProject, type Orientation, type LoadProjectResult, type LoadProjectOptions } from '@agapi/cf-runtime';
import { createIvaHost } from './host';
import { control, ensureConnected } from './bridge/transport';
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

installStdlib(createIvaHost());
// cf-runtime routes CF.request and remote <img> loads through the host's HTTP
// (no CORS, self-signed certs) only when it sees this Tauri marker; the iva
// host serves the same, and nothing Tauri is loaded to read the marker otherwise.
(window as any).__TAURI_INTERNALS__ ??= { iva: true };
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
  fitStage();
}

async function boot(gui: string) {
  setStatus(`loading ${gui}…`);
  const res = await fetch(`/__iva/manifest?gui=${encodeURIComponent(gui)}`);
  if (!res.ok) {
    showBuildError(await res.text());
    setStatus('build failed', 'err');
    return;
  }
  const m: Manifest = await res.json();
  document.title = `${m.title} · iva`;
  // fileUrl: a web view's url="page.html" is the project's own file (an older agapi ignores it)
  const options: LoadProjectOptions & { fileUrl?: (name: string) => string } = {
    guiXml: m.guiXml,
    imageMap: m.imageMap,
    scriptMap: m.scriptMap,
    canvas,
    fileUrl: (name) => m.fileBase + name.split('/').map(encodeURIComponent).join('/'),
    orientation,
    onOrientationChange: (o) => setOrientation(o),
    menu: {
      mount: chrome,
      placement: 'bar',
      fullscreenTarget: stage,
      host: { reload: () => location.reload() },
    },
  };
  current = await loadProject(options);
  fitStage();
  const warn = m.missingScripts.length ? ` · missing scripts: ${m.missingScripts.join(', ')}` : '';
  setStatus(`${m.title}${warn}`, warn ? 'warn' : 'ok');
}

async function main() {
  await installFonts();
  const guis: GuiEntry[] = await (await fetch('/__iva/guis')).json();
  if (!guis.length) {
    setStatus('no .gui files found', 'err');
    return;
  }
  const chosen = params.get('gui') && guis.some((g) => g.rel === params.get('gui')) ? params.get('gui')! : guis[0].rel;
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

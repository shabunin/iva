/**
 * iva/web: the web app's side of a <WebApp>. The panel serves the page and
 * answers it (iva-http.js): the joins the WebApp named, as they change;
 * setting them; calling panel functions; project files.
 *
 *   import { panel } from 'iva/web';
 *   panel.on('kitchen', (on) => lamp.visible = !!on);
 *   button.onclick = () => panel.set('kitchen', 1);
 *   const rows = await panel.call('history', from, to);
 *
 * One request at a time, each checked: iViewer sends what the panel answers
 * to every client of its server (all web apps share one), so an answer can
 * be another's - it is asked again. Load files with panel.asset() /
 * panel.url(), not <img src> (the browser would take another's answer as the
 * file). URLs stay relative: the app is at /<name>/ (in the preview, under a
 * longer path).
 */

export type Value = number | string;
type Values = Record<string, Value>;
/** a recorded row: [time (ms), value per recorded name] */
export type Sample = [number, ...(number | null)[]];

interface Boot {
  names: string[];
  options: Record<string, unknown>;
  values: Values;
  v: number;
  reload?: number;
  record: string[] | null;
}

interface Job {
  path: string;
  query: Record<string, string>;
  poll?: boolean;
  resolve(v: unknown): void;
  reject(e: Error): void;
}

const boot: Boot = (globalThis as { __iva?: Boot }).__iva ?? { names: [], options: {}, values: {}, v: 0, record: null };

const values: Values = { ...boot.values };
let version = boot.v;
let seq = 0;
let failures = 0;
const queue: Job[] = [];
let busy: { job: Job; xhr: XMLHttpRequest } | null = null;
let wake: ReturnType<typeof setTimeout> | null = null;
const listeners = new Map<string, Set<(v: Value) => void>>();
const allListeners = new Set<(values: Values) => void>();
const sampleListeners = new Set<(s: Sample) => void>();
let lastSample = 0;
let leaving = false;

function notify(name: string, v: Value) {
  for (const cb of listeners.get(name) ?? []) cb(v);
}

function apply(out: { v: number; values: Values; reload?: number; sample?: Sample | null }) {
  // the look switched (<Project themes>): the page again, in its colours - and nothing more asked of this one
  if ((out.reload ?? 0) !== (boot.reload ?? 0)) {
    leaving = true;
    location.reload();
    return;
  }
  version = out.v;
  const moved: string[] = [];
  for (const [k, v] of Object.entries(out.values ?? {})) {
    if (values[k] === v) continue;
    values[k] = v;
    moved.push(k);
  }
  for (const k of moved) notify(k, values[k]);
  if (moved.length) for (const cb of allListeners) cb(values);
  if (out.sample && out.sample[0] > lastSample) {
    lastSample = out.sample[0];
    for (const cb of sampleListeners) cb(out.sample);
  }
}

const watching = () => boot.names.length > 0 || !!boot.record;

function pump() {
  if (leaving) return;
  if (busy) {
    // a request waiting for news gives way to one with something to ask
    if (busy.job.poll && queue.length) busy.xhr.abort();
    return;
  }
  if (wake) return;
  const job = queue.shift() ?? (watching() ? pollJob() : null);
  if (!job) return;
  send(job);
}

function pollJob(): Job {
  return { path: 'iva/poll', query: { v: String(version) }, poll: true, resolve: (out) => apply(out as Parameters<typeof apply>[0]), reject: () => {} };
}

function later(ms: number) {
  wake = setTimeout(() => {
    wake = null;
    pump();
  }, ms);
}

/** An answer's data: the panel answers with its boot page, the data in its last script. */
function unwrap(text: string): { data: any } | null {
  const at = text.lastIndexOf('id="iva-data">');
  const end = text.lastIndexOf('</script>');
  if (at < 0 || end < at) return null;
  try {
    return { data: JSON.parse(text.slice(at + 14, end)) };
  } catch {
    return null;
  }
}

// one page's requests numbered apart from another's (they share the panel's server)
const tag = Math.random().toString(36).slice(2, 7);
// the key the panel gave this page's address (?k=): it answers nothing without it
const key = new URLSearchParams(location.search).get('k') ?? '';

function send(job: Job) {
  const r = `${tag}${++seq}`;
  const xhr = new XMLHttpRequest();
  const qs = Object.entries({ ...job.query, r, k: key }).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  xhr.open('GET', `${job.path}?${qs}`);
  xhr.timeout = job.poll ? 30000 : 20000;
  busy = { job, xhr };
  const finish = (again: boolean, delay = 0) => {
    if (busy?.xhr !== xhr) return;
    busy = null;
    // a job that didn't get its own answer goes again (sets and reads are safe to repeat)
    if (again && !job.poll) queue.unshift(job);
    if (delay) later(delay);
    else pump();
  };
  const failed = () => {
    // the panel away (a page change, a reload): again, more slowly each time
    failures++;
    finish(true, Math.min(5000, 100 * 2 ** Math.min(failures, 6)) * (0.75 + Math.random() / 2));
  };
  xhr.onload = () => {
    const got = unwrap(xhr.responseText);
    // another page's answer (the panel sends each to every page it serves): ask again, now
    if (got && xhr.getResponseHeader('X-Iva-Req') !== r) return finish(true, 10 + Math.random() * 40);
    if (!got) return failed();
    failures = 0;
    if (xhr.status === 200) job.resolve(got.data);
    else job.reject(new Error(got.data?.error ?? `${job.path}: HTTP ${xhr.status}`));
    // refused: the panel started again since this page loaded (a new key) - nothing more asked of this one
    if (xhr.status === 403) leaving = true;
    finish(false);
  };
  xhr.onerror = failed;
  xhr.ontimeout = failed;
  xhr.onabort = () => finish(true);
  xhr.send();
}

function request<T>(path: string, query: Record<string, string>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({ path, query, resolve: resolve as (v: unknown) => void, reject });
    pump();
  });
}

export interface Panel {
  /** the WebApp's options (its `options` prop, in the look shown) */
  readonly options: Record<string, any>;
  /** the joins' values now, by the names the WebApp gave them */
  readonly values: Readonly<Values>;
  /** the names the WebApp gave its joins */
  readonly names: readonly string[];
  /** with `record`: the names whose values each recorded row has, in order */
  readonly recorded: readonly string[];
  /** cb(value) now (if it has one) and whenever it changes; returns a function that stops it */
  on(name: string, cb: (v: Value) => void): () => void;
  /** cb(values) whenever any changes */
  onChange(cb: (values: Values) => void): () => void;
  /** set a join (by its name): digital 0 / 1, analog 0..65535, serial text */
  set(name: string, value: Value): Promise<void>;
  /** run a panel function: one of the WebApp's `handlers`, or 'history' with `record` */
  call<T = unknown>(fn: string, ...args: unknown[]): Promise<T>;
  /** a project file */
  asset(name: string): Promise<ArrayBuffer>;
  /** a project file as a URL for <img src> / a loader (a blob: URL) */
  url(name: string, type?: string): Promise<string>;
  /** `record`: the recorded rows between two times (ms), and each new one as it comes */
  history(from?: number, to?: number): Promise<{ names: string[]; rows: Sample[] }>;
  onSample(cb: (s: Sample) => void): () => void;
}

export const panel: Panel = {
  options: boot.options,
  values,
  names: boot.names,
  recorded: boot.record ?? [],
  on(name, cb) {
    let set = listeners.get(name);
    if (!set) listeners.set(name, (set = new Set()));
    set.add(cb);
    if (values[name] !== undefined) cb(values[name]);
    pump();
    return () => set!.delete(cb);
  },
  onChange(cb) {
    allListeners.add(cb);
    pump();
    return () => allListeners.delete(cb);
  },
  set(name, value) {
    // shown at once; the panel's answer confirms it
    values[name] = value;
    notify(name, value);
    return request<void>('iva/set', { [name]: String(value) });
  },
  async call<T>(fn: string, ...args: unknown[]) {
    const out = await request<{ value: T }>('iva/call', { fn, args: JSON.stringify(args) });
    return out.value;
  },
  async asset(name) {
    // the file's bytes come as base64 (in the panel's page, as every answer)
    const out = await request<{ b64: string }>(`iva/asset/${encodeURIComponent(name)}`, {});
    const bin = atob(out.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  },
  async url(name, type) {
    const data = await panel.asset(name);
    return URL.createObjectURL(new Blob([data], type ? { type } : undefined));
  },
  history: (from, to) => panel.call('history', from ?? null, to ?? null),
  onSample(cb) {
    sampleListeners.add(cb);
    pump();
    return () => sampleListeners.delete(cb);
  },
};

// news from the panel from the start
setTimeout(pump, 0);

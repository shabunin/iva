/**
 * The page's link to the `iva dev` backend: one WebSocket carrying
 * invoke(cmd, args) -> result and backend -> page events. agapi's host
 * classes reach it through the `@tauri-apps/api/*` stand-ins next to this
 * file (aliased in the Vite config), so they run unchanged without Tauri.
 */

type Listener = (payload: unknown) => void;

interface Pending {
  resolve: (v: any) => void;
  reject: (e: unknown) => void;
}

const listeners = new Map<string, Set<Listener>>();
const pending = new Map<number, Pending>();
const queue: string[] = [];
let seq = 0;
let socket: WebSocket | null = null;
let open = false;

/** Called for backend messages that aren't host traffic (reload, log, ...). */
export const control = { onMessage: (_msg: any) => {} };

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${proto}//${location.host}/__iva/host`);
  socket.onopen = () => {
    open = true;
    for (const m of queue.splice(0)) socket!.send(m);
  };
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === 'result') {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.value);
      else p.reject(msg.error);
    } else if (msg.t === 'event') {
      listeners.get(msg.name)?.forEach((l) => l(msg.payload));
    } else {
      control.onMessage(msg);
    }
  };
  socket.onclose = () => {
    open = false;
    for (const p of pending.values()) p.reject('ECONNRESET: iva dev backend went away');
    pending.clear();
    control.onMessage({ t: 'backend-closed' });
  };
}

function send(msg: object) {
  if (!socket) connect();
  const text = JSON.stringify(msg);
  if (open) socket!.send(text);
  else queue.push(text);
}

export function invoke<T = any>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    send({ t: 'invoke', id, cmd, args });
  });
}

export function listen(name: string, fn: Listener): () => void {
  let set = listeners.get(name);
  if (!set) listeners.set(name, (set = new Set()));
  set.add(fn);
  return () => set!.delete(fn);
}

/** Open the link now (the page also needs it for reload notices). */
export function ensureConnected() {
  if (!socket) connect();
}

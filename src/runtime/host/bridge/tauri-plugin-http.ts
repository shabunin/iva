/**
 * Stand-in for `@tauri-apps/plugin-http`: fetch() runs in the iva dev backend
 * (no CORS, self-signed certificates allowed), the page gets a Response.
 */
import { invoke } from './transport';

export type Proxy = unknown;

interface Wire {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

const toBase64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

/** base64 to bytes: the browser's own decoder (Chrome 140+), else a plain loop - Uint8Array.from(atob(), fn) took ~100 ms per MB */
const fromBase64 = (s: string): Uint8Array => {
  const own = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64;
  if (own) return own.call(Uint8Array, s);
  const chars = atob(s);
  const out = new Uint8Array(chars.length);
  for (let i = 0; i < chars.length; i++) out[i] = chars.charCodeAt(i);
  return out;
};

async function bodyBytes(body: unknown): Promise<Uint8Array | null> {
  if (body == null) return null;
  if (typeof body === 'string') return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
}

export async function fetch(input: string | URL | Request, init: Record<string, any> = {}): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((v, k) => (headers[k] = v));
  const bytes = await bodyBytes(init.body);
  const res = await invoke<Wire>('http_fetch', {
    url,
    method: init.method ?? 'GET',
    headers,
    body: bytes && bytes.length ? toBase64(bytes) : null,
    acceptInvalidCerts: init.danger?.acceptInvalidCerts ?? true,
    connectTimeout: init.connectTimeout ?? null,
    maxRedirections: init.maxRedirections ?? 20,
  });
  const raw = fromBase64(res.body);
  // Response() refuses a body on 204/304 and any status outside 200-599
  const nullBody = [101, 204, 205, 304].includes(res.status);
  const status = res.status >= 200 && res.status <= 599 ? res.status : 200;
  const out = new Response(nullBody ? null : raw, { status, statusText: res.statusText, headers: res.headers });
  Object.defineProperty(out, 'url', { value: res.url });
  return out;
}

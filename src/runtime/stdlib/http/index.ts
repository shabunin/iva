import { getHost } from '../host';

/**
 * Node-shaped http facade. Delegates to host.http when installed (Tauri).
 * Without a host, methods throw — browser cannot open real listen sockets.
 */

function requireHttpHost() {
  const host = getHost();
  if (!host?.http) {
    throw new Error(
      '@agapi/stdlib/http: no HttpHost installed. Call installStdlib(createTauriHost()) in Tauri app bootstrap.'
    );
  }
  return host.http;
}

export function createServer(requestListener?: (req: any, res: any) => void) {
  return requireHttpHost().createServer(requestListener);
}

export function request(options: any, callback?: (res: any) => void) {
  return requireHttpHost().request(options, callback);
}

export function get(options: any, callback?: (res: any) => void) {
  return requireHttpHost().get(options, callback);
}

/** Lazy host WebSocketServer constructor for `new http.WebSocketServer(...)`. */
export function getWebSocketServerCtor(): new (options: { port: number }) => any {
  const Ctor = requireHttpHost().WebSocketServer;
  if (!Ctor) {
    throw new Error('@agapi/stdlib/http: WebSocketServer not provided by host');
  }
  return Ctor;
}

/** Lazy host WebSocket (MDN-compatible client) constructor for `new http.WebSocket(url)`. */
export function getWebSocketCtor(): new (url: string, protocols?: string | string[]) => any {
  const Ctor = requireHttpHost().WebSocket;
  if (!Ctor) {
    throw new Error('@agapi/stdlib/http: WebSocket not provided by host');
  }
  return Ctor;
}

const http = {
  createServer,
  request,
  get,
  get WebSocketServer() {
    return getWebSocketServerCtor();
  },
  get WebSocket() {
    return getWebSocketCtor();
  },
};

export default http;

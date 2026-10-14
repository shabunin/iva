/**
 * The agapi platform host for the preview page: agapi's own host classes
 * (TCP, TCP server, UDP, TLS, DNS, HTTP client), with their Tauri IPC
 * swapped for the iva dev backend (see bridge/). Scripts and CF systems get
 * real sockets on the machine running `iva dev`.
 */
import type { AgapiHost, HttpHost } from '@agapi/stdlib/host';
import { TauriNetworkProvider } from '@agapi-src/host-tauri/src/net/provider';
import { createDnsHost } from '@agapi-src/host-tauri/src/dns';
import { createTlsHost } from '@agapi-src/host-tauri/src/tls/index';
import * as httpClient from '@agapi-src/host-tauri/src/http/index';

function createHttpHost(): HttpHost {
  return {
    name: 'IvaHttpHost',
    request: httpClient.request,
    get: httpClient.get,
    // hosting HTTP / WebSocket servers isn't in the iva backend yet
    createServer: () => {
      throw new Error('iva dev: http.createServer is not supported yet');
    },
    WebSocket: globalThis.WebSocket,
  };
}

export function createIvaHost(): AgapiHost {
  return {
    name: 'iva',
    net: new TauriNetworkProvider(),
    http: createHttpHost(),
    dns: createDnsHost(),
    tls: createTlsHost(),
  };
}

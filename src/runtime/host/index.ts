/**
 * The preview page's host: TCP, TCP server, UDP, TLS, DNS and an HTTP client,
 * done by the iva dev backend over one WebSocket (see bridge/). Scripts and
 * CF systems get real sockets on the machine running `iva dev`.
 */
import type { AgapiHost, HttpHost } from '../stdlib/host';
import { TauriNetworkProvider } from './net/provider';
import { createDnsHost } from './dns';
import { createTlsHost } from './tls/index';
import * as httpClient from './http/index';

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

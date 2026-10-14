import type { AgapiHost } from './host';
import { setHost } from './host';
import { net } from './net/manager';

/**
 * Bind the platform host (sockets, HTTP, DNS, TLS) into the runtime. iViewer
 * gives project scripts the CF API only: no global of our own is installed.
 */
export function installHost(host: AgapiHost): void {
  setHost(host);
  net.setProvider(host.net);
}

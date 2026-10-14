import { getHost } from '../host';
import type { TlsConnectOptions } from '../host';
import type { ITcpSocket } from '../net/types';
import { EventEmitter } from '../events';

export type { TlsConnectOptions };
export type TlsConnectListener = () => void;

/**
 * Node-shaped tls.connect(options[, callback]) → TLSSocket-like.
 *
 * Client only (no tls.createServer yet).
 */
export function connect(
  options: TlsConnectOptions | number,
  hostOrListener?: string | TlsConnectListener,
  listener?: TlsConnectListener
): ITcpSocket {
  let opts: TlsConnectOptions = {};
  let cb: TlsConnectListener | undefined;

  if (typeof options === 'number') {
    opts.port = options;
    if (typeof hostOrListener === 'string') {
      opts.host = hostOrListener;
      cb = listener;
    } else {
      cb = hostOrListener;
    }
  } else {
    opts = { ...options };
    if (typeof hostOrListener === 'function') {
      cb = hostOrListener;
    }
  }

  opts.host = opts.host || 'localhost';
  opts.port = opts.port || 443;
  opts.servername = opts.servername || opts.host;
  if (opts.rejectUnauthorized === undefined) {
    opts.rejectUnauthorized = true;
  }

  const host = getHost();
  if (!host?.tls) {
    const stub = new EventEmitter() as any;
    stub.destroyed = true;
    stub.connecting = false;
    stub.readyState = 'closed';
    setTimeout(() => {
      stub.emit(
        'error',
        new Error(
          'tls.connect: no TlsHost installed. Call installStdlib(createTauriHost()) in Tauri.'
        )
      );
    }, 0);
    return stub;
  }

  const socket = host.tls.connect(opts);
  if (cb) {
    // Node fires the optional callback on secureConnect
    socket.once('secureConnect', cb);
  }
  return socket;
}

const tls = {
  connect,
};

export default tls;

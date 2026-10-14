import { EventEmitter, type ITcpSocket } from '../../stdlib/net';
import { Buffer, toUint8Array } from '../../stdlib/buffer';
import { mapHostError } from '../../stdlib/errors';
import type { TlsConnectOptions } from '../../stdlib/host';
import { invoke } from '../bridge/tauri-core';
import { listen, UnlistenFn } from '../bridge/tauri-event';
import type { NetEventPayload } from '../../stdlib/net';

export const activeTlsSockets = new Map<string, TauriTlsSocket>();

let globalTlsListenerPromise: Promise<UnlistenFn> | null = null;

function ensureGlobalTlsListener() {
  if (globalTlsListenerPromise) return;
  globalTlsListenerPromise = listen<NetEventPayload>('plugin:net:tls', (event) => {
    const socket = activeTlsSockets.get(event.payload.id);
    if (socket) socket.handleNetEvent(event.payload);
  });
}

interface TlsConnectResult {
  id: string;
  remote_address: string;
  remote_port: number;
  local_address: string;
  local_port: number;
  family: string;
  authorized: boolean;
  alpn_protocol: string | null;
}

/**
 * TLS client socket — Node-shaped subset of tls.TLSSocket.
 */
export class TauriTlsSocket extends EventEmitter implements ITcpSocket {
  public destroyed = false;
  public connecting = false;
  public readyState = 'closed';
  public bytesRead = 0;
  public bytesWritten = 0;
  public bufferSize = 0;
  public localAddress?: string;
  public localPort?: number;
  public localFamily?: string;
  public remoteAddress?: string;
  public remotePort?: number;
  public remoteFamily?: string;
  public timeout?: number;
  public authorized = false;
  public alpnProtocol: string | null = null;
  public encrypted = true;

  private socketId: string | null = null;
  private encoding: string | null = null;
  private timeoutTimer: any = null;
  private isPaused = false;
  private pausedBuffer: Uint8Array[] = [];
  private writeEnded = false;

  get pending(): boolean {
    return this.connecting;
  }

  startConnect(options: TlsConnectOptions): this {
    const host = options.host || 'localhost';
    const port = options.port || 443;
    const serverName = options.servername || host;
    const rejectUnauthorized = options.rejectUnauthorized !== false;
    const alpn = options.ALPNProtocols;

    this.connecting = true;
    this.readyState = 'opening';
    this.remoteAddress = host;
    this.remotePort = port;

    invoke<TlsConnectResult>('tls_connect', {
      host,
      port,
      serverName,
      rejectUnauthorized,
      alpn: alpn ?? null,
    })
      .then((result) => {
        this.socketId = result.id;
        this.remoteAddress = result.remote_address;
        this.remotePort = result.remote_port;
        this.remoteFamily = result.family;
        this.localAddress = result.local_address;
        this.localPort = result.local_port;
        this.localFamily = result.family;
        this.authorized = result.authorized;
        this.alpnProtocol = result.alpn_protocol;

        this.connecting = false;
        this.readyState = 'open';

        activeTlsSockets.set(result.id, this);
        ensureGlobalTlsListener();
        this.resetTimeoutTimer();

        this.emit('connect');
        this.emit('secureConnect');
        this.emit('ready');
      })
      .catch((err) => {
        this.connecting = false;
        this.readyState = 'closed';
        this.emit(
          'error',
          mapHostError(err, { syscall: 'connect', address: host, port })
        );
        this.emit('close', true);
      });

    return this;
  }

  /** @internal */
  public handleNetEvent(payload: NetEventPayload) {
    switch (payload.event) {
      case 'data':
        if (payload.data) {
          const chunk = new Uint8Array(payload.data);
          this.bytesRead += chunk.length;
          this.resetTimeoutTimer();
          if (this.isPaused) this.pausedBuffer.push(chunk);
          else this.emitData(chunk);
        }
        break;
      case 'finish':
        this.writeEnded = true;
        if (this.readyState === 'open') this.readyState = 'readOnly';
        this.emit('finish');
        break;
      case 'close':
        this.readyState = 'closed';
        this.emit('end');
        this.emit('close', false);
        this.cleanup();
        break;
      case 'error': {
        this.readyState = 'closed';
        const err = mapHostError(payload.error || 'Unknown error', {
          syscall: 'tls',
          address: this.remoteAddress,
          port: this.remotePort,
        });
        this.emit('error', err);
        this.emit('close', true);
        this.cleanup();
        break;
      }
    }
  }

  private emitData(chunk: Uint8Array) {
    if (this.encoding) {
      this.emit('data', new TextDecoder(this.encoding).decode(chunk));
    } else {
      this.emit('data', Buffer.from(chunk));
    }
  }

  connect(_a?: any, _b?: any, _c?: any): this {
    return this;
  }

  write(
    data: string | Uint8Array,
    encoding: string = 'utf8',
    callback?: (err?: Error | null) => void
  ): boolean {
    if (this.destroyed || !this.socketId || this.writeEnded) {
      const err = mapHostError('This socket has been ended', {
        syscall: 'write',
        address: this.remoteAddress,
        port: this.remotePort,
      });
      const cb = callback;
      if (cb) setTimeout(() => cb(err), 0);
      else this.emit('error', err);
      return false;
    }
    if (typeof encoding === 'function') {
      callback = encoding as any;
      encoding = 'utf8';
    }
    const payload = Array.from(toUint8Array(data, encoding as any));
    this.bytesWritten += payload.length;
    this.resetTimeoutTimer();
    invoke('tls_write', { id: this.socketId, data: payload })
      .then(() => callback?.(null))
      .catch((err) => {
        const mapped = mapHostError(err, {
          syscall: 'write',
          address: this.remoteAddress,
          port: this.remotePort,
        });
        if (callback) callback(mapped);
        else this.emit('error', mapped);
      });
    return true;
  }

  end(data?: string | Uint8Array, encoding?: string, callback?: () => void): this {
    if (this.destroyed || this.writeEnded) {
      if (callback) setTimeout(callback, 0);
      return this;
    }
    const doShutdown = () => {
      if (!this.socketId || this.writeEnded) {
        callback?.();
        return;
      }
      this.writeEnded = true;
      this.readyState = this.readyState === 'closed' ? 'closed' : 'readOnly';
      invoke('tls_shutdown', { id: this.socketId })
        .then(() => callback?.())
        .catch((err) => {
          this.emit('error', mapHostError(err, { syscall: 'shutdown' }));
          callback?.();
        });
    };
    if (data !== undefined && data !== null && (data as any) !== '') {
      this.write(data as any, encoding as any, (err) => {
        if (err) this.emit('error', err);
        doShutdown();
      });
    } else {
      doShutdown();
    }
    return this;
  }

  destroy(err?: Error): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.writeEnded = true;
    if (this.socketId) {
      invoke('tls_destroy', { id: this.socketId }).catch(console.error);
    }
    if (err) this.emit('error', err);
    this.cleanup();
    this.emit('close', !!err);
    return this;
  }

  destroySoon(): this {
    return this.destroy();
  }

  resetAndDestroy(): this {
    return this.destroy();
  }

  setKeepAlive(_enable?: boolean, _initialDelay?: number): this {
    return this;
  }

  setNoDelay(_noDelay?: boolean): this {
    return this;
  }

  setTimeout(timeout: number, callback?: () => void): this {
    this.timeout = timeout;
    if (callback) this.on('timeout', callback);
    this.resetTimeoutTimer();
    return this;
  }

  private resetTimeoutTimer() {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    if (this.timeout && this.timeout > 0 && !this.destroyed) {
      this.timeoutTimer = setTimeout(() => this.emit('timeout'), this.timeout);
    }
  }

  setEncoding(encoding: string): this {
    this.encoding = encoding === 'utf8' ? 'utf-8' : encoding;
    return this;
  }

  pause(): this {
    this.isPaused = true;
    return this;
  }

  resume(): this {
    if (!this.isPaused) return this;
    this.isPaused = false;
    const buf = this.pausedBuffer;
    this.pausedBuffer = [];
    for (const c of buf) this.emitData(c);
    return this;
  }

  address() {
    if (this.destroyed || this.readyState === 'closed') return null;
    return {
      port: this.localPort || 0,
      family: this.localFamily || 'IPv4',
      address: this.localAddress || '127.0.0.1',
    };
  }

  private cleanup() {
    if (this.socketId) activeTlsSockets.delete(this.socketId);
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.socketId = null;
    this.destroyed = true;
    this.connecting = false;
    this.readyState = 'closed';
  }
}

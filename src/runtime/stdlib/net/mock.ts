import { EventEmitter } from '../events';
import { isIPv6 } from './ip';
import type { ITcpServer, ITcpSocket, IUdpSocket, INetworkProvider } from './types';

export class MockTcpSocket extends EventEmitter implements ITcpSocket {
  public destroyed = false;
  public connecting = false;
  public pending = false;
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
  private mockInterval: ReturnType<typeof setInterval> | null = null;

  connect(port: number, host: string, connectionListener?: () => void): this;
  connect(options: any, connectionListener?: () => void): this;
  connect(path: string, connectionListener?: () => void): this;
  connect(portOrOptionsOrPath: any, hostOrCreateListener?: any, connectionListener?: () => void): this {
    let port = 0;
    let host = '127.0.0.1';
    let listener = connectionListener;

    if (typeof portOrOptionsOrPath === 'number') {
      port = portOrOptionsOrPath;
      if (typeof hostOrCreateListener === 'string') {
        host = hostOrCreateListener;
      } else if (typeof hostOrCreateListener === 'function') {
        listener = hostOrCreateListener;
      }
    } else if (typeof portOrOptionsOrPath === 'object' && portOrOptionsOrPath !== null) {
      port = portOrOptionsOrPath.port || 0;
      host = portOrOptionsOrPath.host || '127.0.0.1';
      if (typeof hostOrCreateListener === 'function') {
        listener = hostOrCreateListener;
      }
    } else if (typeof portOrOptionsOrPath === 'string') {
      host = 'localhost';
      if (typeof hostOrCreateListener === 'function') {
        listener = hostOrCreateListener;
      }
    }

    this.connecting = true;
    this.pending = true;
    this.readyState = 'opening';
    this.remoteAddress = host;
    this.remotePort = port;
    this.remoteFamily = isIPv6(host) ? 'IPv6' : 'IPv4';

    if (listener) this.once('connect', listener);

    console.log(`[Mock TCP] Connecting to ${host}:${port}...`);

    setTimeout(() => {
      if (this.destroyed) return;
      this.connecting = false;
      this.pending = false;
      this.readyState = 'open';
      this.localAddress = '127.0.0.1';
      this.localPort = Math.floor(Math.random() * 50000) + 10000;
      this.localFamily = 'IPv4';

      this.emit('connect');
      this.emit('ready');

      this.mockInterval = setInterval(() => {
        if (this.destroyed) return;
        const chunk = new Uint8Array([0x01, 0x02, 0x03]);
        this.bytesRead += chunk.length;
        this.emit('data', chunk);
      }, 10000);
    }, 500);

    return this;
  }

  write(data: string | Uint8Array, _encoding: string = 'utf8', callback?: (err?: Error | null) => void): boolean {
    if (this.destroyed || this.readyState === 'readOnly') {
      const err = new Error('Socket is closed');
      this.emit('error', err);
      if (callback) setTimeout(() => callback(err), 0);
      return false;
    }
    const len = typeof data === 'string' ? new TextEncoder().encode(data).length : data.length;
    this.bytesWritten += len;
    console.log(`[Mock TCP Write -> ${this.remoteAddress}:${this.remotePort}]`, data);
    if (callback) setTimeout(() => callback(null), 0);
    return true;
  }

  end(data?: string | Uint8Array, encoding?: string, callback?: () => void): this {
    if (data) {
      this.write(data, encoding, () => {
        this.readyState = 'readOnly';
        this.emit('finish');
        if (callback) callback();
      });
    } else {
      this.readyState = 'readOnly';
      this.emit('finish');
      if (callback) setTimeout(callback, 0);
    }
    return this;
  }

  destroy(err?: Error): this {
    if (this.destroyed) return this;
    this.destroyed = true;
    this.connecting = false;
    this.pending = false;
    this.readyState = 'closed';
    if (this.mockInterval) clearInterval(this.mockInterval);
    console.log(`[Mock TCP] Disconnected from ${this.remoteAddress}:${this.remotePort}`);
    if (err) this.emit('error', err);
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
    return this;
  }

  setEncoding(_encoding: string): this {
    return this;
  }

  pause(): this {
    return this;
  }

  resume(): this {
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
}

export class MockTcpServer extends EventEmitter implements ITcpServer {
  public listening = false;
  public maxConnections = Infinity;
  public dropMaxConnection = false;
  private localPort?: number;
  private localAddress?: string;

  constructor(options?: any, connectionListener?: (socket: ITcpSocket) => void) {
    super();
    if (options) {
      this.maxConnections = options.maxConnections ?? Infinity;
      this.dropMaxConnection = !!options.dropMaxConnection;
    }
    if (connectionListener) {
      this.on('connection', connectionListener);
    }
  }

  listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
  listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  listen(port?: number, listeningListener?: () => void): this;
  listen(path: string, backlog?: number, listeningListener?: () => void): this;
  listen(path: string, listeningListener?: () => void): this;
  listen(options: any, listeningListener?: () => void): this;
  listen(handle: any, backlog?: number, listeningListener?: () => void): this;
  listen(handle: any, listeningListener?: () => void): this;
  listen(
    portOrOptionsOrPath?: any,
    hostOrListener?: any,
    backlogOrListener?: any,
    callback?: () => void
  ): this {
    let port = 0;
    let host = '0.0.0.0';
    let listener = callback;

    if (typeof portOrOptionsOrPath === 'number') {
      port = portOrOptionsOrPath;
      if (typeof hostOrListener === 'string') {
        host = hostOrListener;
        if (typeof backlogOrListener === 'function') {
          listener = backlogOrListener;
        }
      } else if (typeof hostOrListener === 'function') {
        listener = hostOrListener;
      }
    } else if (typeof portOrOptionsOrPath === 'object' && portOrOptionsOrPath !== null) {
      port = portOrOptionsOrPath.port || 0;
      host = portOrOptionsOrPath.host || '0.0.0.0';
      if (typeof hostOrListener === 'function') {
        listener = hostOrListener;
      }
    } else if (typeof portOrOptionsOrPath === 'function') {
      listener = portOrOptionsOrPath;
    }

    this.listening = true;
    this.localPort = port || Math.floor(Math.random() * 50000) + 10000;
    this.localAddress = host;

    if (listener) this.once('listening', listener);

    console.log(`[Mock TCP Server] Listening on ${host}:${this.localPort}`);
    setTimeout(() => {
      this.emit('listening');
    }, 10);

    return this;
  }

  close(callback?: (err?: Error) => void): this {
    if (!this.listening) {
      if (callback) setTimeout(() => callback(new Error('Server not listening')), 0);
      return this;
    }
    this.listening = false;
    this.emit('close');
    if (callback) setTimeout(() => callback(), 0);
    return this;
  }

  address() {
    if (!this.listening) return null;
    return {
      port: this.localPort || 0,
      family: isIPv6(this.localAddress || '') ? 'IPv6' : 'IPv4',
      address: this.localAddress || '0.0.0.0',
    };
  }

  getConnections(callback: (err: Error | null, count: number) => void): this {
    setTimeout(() => callback(null, 0), 0);
    return this;
  }

  ref(): this {
    return this;
  }

  unref(): this {
    return this;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  closeAllConnections(): this {
    return this;
  }

  closeIdleConnections(): this {
    return this;
  }
}

export class MockUdpSocket extends EventEmitter implements IUdpSocket {
  bind(port?: number, address?: string, callback?: () => void): this {
    console.log(`[Mock UDP] Binding to ${address || '0.0.0.0'}:${port}`);
    if (callback) setTimeout(callback, 10);
    return this;
  }

  send(msg: any, ...args: any[]): void {
    let port = 0;
    let address = '127.0.0.1';
    let callback: ((error: Error | null) => void) | undefined;
    if (typeof args[args.length - 1] === 'function') {
      callback = args.pop();
    }
    if (args.length === 1) {
      port = args[0];
    } else if (args.length === 2) {
      port = args[0];
      address = args[1];
    } else if (args.length === 3) {
      // send(msg, offset, length, port)
      port = args[2];
    } else if (args.length === 4) {
      port = args[2];
      address = args[3];
    }
    console.log(`[Mock UDP Send -> ${address}:${port}]`, msg);
    if (callback) setTimeout(() => callback(null), 0);
  }

  close(callback?: () => void): this {
    this.emit('close');
    if (callback) setTimeout(callback, 0);
    return this;
  }

  addMembership(multicastAddress: string, _multicastInterface?: string): void {
    console.log(`[Mock UDP] Joined Multicast Group: ${multicastAddress}`);
  }

  dropMembership(multicastAddress: string, _multicastInterface?: string): void {
    console.log(`[Mock UDP] Left Multicast Group: ${multicastAddress}`);
  }

  setBroadcast(flag: boolean): void {
    console.log(`[Mock UDP] setBroadcast: ${flag}`);
  }
}

export class DefaultMockProvider implements INetworkProvider {
  name = 'MockBrowserProvider';
  Socket = MockTcpSocket;
  Server = MockTcpServer;

  createTcpSocket() {
    return new MockTcpSocket();
  }

  createUdpSocket() {
    return new MockUdpSocket();
  }

  createTcpServer(options?: any, connectionListener?: (socket: ITcpSocket) => void) {
    return new MockTcpServer(options, connectionListener);
  }
}

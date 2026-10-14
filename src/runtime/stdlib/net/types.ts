/**
 * Node.js-shaped TCP/UDP interfaces used by stdlib and host backends.
 */

export interface ITcpSocket {
  connect(port: number, host: string, connectionListener?: () => void): this;
  connect(options: any, connectionListener?: () => void): this;
  connect(path: string, connectionListener?: () => void): this;

  write(
    data: string | Uint8Array,
    encoding?: string,
    callback?: (err?: Error | null) => void
  ): boolean;
  end(
    data?: string | Uint8Array,
    encoding?: string,
    callback?: () => void
  ): this;
  /** Half-close write side (Node-like); keep reading until peer closes. */
  destroy(err?: Error): this;
  destroySoon(): this;
  resetAndDestroy(): this;

  setKeepAlive(enable?: boolean, initialDelay?: number): this;
  setNoDelay(noDelay?: boolean): this;
  setTimeout(timeout: number, callback?: () => void): this;
  setEncoding(encoding: string): this;

  pause(): this;
  resume(): this;
  address(): any;

  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;

  destroyed: boolean;
  connecting: boolean;
  pending: boolean;
  readyState: string;
  bytesRead: number;
  bytesWritten: number;
  bufferSize: number;
  localAddress?: string;
  localPort?: number;
  localFamily?: string;
  remoteAddress?: string;
  remotePort?: number;
  remoteFamily?: string;
  timeout?: number;
}

export interface IUdpSocket {
  bind(port?: number | object | (() => void), address?: string | (() => void), callback?: () => void): this;
  /** Node-style overloaded send — host implementation accepts rest args. */
  send(msg: any, ...args: any[]): void;
  close(callback?: () => void): this;
  address?(): { address: string; family: string; port: number };
  remoteAddress?(): { address?: string; port?: number; family: string };
  connect?(port: number, address?: string, callback?: () => void): void;
  disconnect?(): void;
  addMembership(multicastAddress: string, multicastInterface?: string): void;
  dropMembership(multicastAddress: string, multicastInterface?: string): void;
  setBroadcast(flag: boolean): void;
  setTTL?(ttl: number): void;
  setMulticastTTL?(ttl: number): void;
  setMulticastLoopback?(flag: boolean): void;
  getRecvBufferSize?(): number;
  setRecvBufferSize?(size: number): void;
  getSendBufferSize?(): number;
  setSendBufferSize?(size: number): void;
  ref?(): this;
  unref?(): this;

  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;
}

export interface ITcpServer {
  listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
  listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  listen(port?: number, listeningListener?: () => void): this;
  listen(path: string, backlog?: number, listeningListener?: () => void): this;
  listen(path: string, listeningListener?: () => void): this;
  listen(options: any, listeningListener?: () => void): this;
  listen(handle: any, backlog?: number, listeningListener?: () => void): this;
  listen(handle: any, listeningListener?: () => void): this;

  close(callback?: (err?: Error) => void): this;
  address(): any;
  getConnections(callback: (err: Error | null, count: number) => void): this;
  ref(): this;
  unref(): this;
  [Symbol.asyncDispose](): Promise<void>;
  closeAllConnections(): this;
  closeIdleConnections(): this;

  on(event: string, listener: (...args: any[]) => void): this;
  once(event: string, listener: (...args: any[]) => void): this;
  off(event: string, listener: (...args: any[]) => void): this;

  listening: boolean;
  maxConnections: number;
  dropMaxConnection: boolean;
}

export interface INetworkProvider {
  name: string;
  createTcpSocket(): ITcpSocket;
  createUdpSocket(type?: 'udp4' | 'udp6' | any): IUdpSocket;
  createTcpServer(options?: any, connectionListener?: (socket: ITcpSocket) => void): ITcpServer;

  Socket: any;
  Server: any;
}

import type { INetworkProvider, ITcpServer, ITcpSocket, IUdpSocket } from './net/types';

/**
 * Platform host injected into stdlib at bootstrap.
 * Applications never talk to Tauri directly — only through this.
 */
export interface NetHost extends INetworkProvider {
  /** Optional richer factories; defaults use INetworkProvider methods. */
}

export interface HttpHost {
  name: string;
  createServer(requestListener?: (req: any, res: any) => void): any;
  request(options: any, callback?: (res: any) => void): any;
  get(options: any, callback?: (res: any) => void): any;
  WebSocketServer?: new (options: { port: number }) => any;
  /** MDN-compatible `WebSocket` client (outbound only). */
  WebSocket?: new (url: string, protocols?: string | string[]) => any;
}

export interface DnsLookupOptions {
  family?: number;
  hints?: number;
  all?: boolean;
  verbatim?: boolean;
  order?: 'ipv4first' | 'ipv6first' | 'verbatim';
}

export interface DnsLookupAddress {
  address: string;
  family: number;
}

export interface DnsHost {
  name: string;
  lookup(
    hostname: string,
    options?: DnsLookupOptions
  ): Promise<DnsLookupAddress | DnsLookupAddress[]>;
}

export interface TlsConnectOptions {
  host?: string;
  port?: number;
  servername?: string;
  rejectUnauthorized?: boolean;
  ALPNProtocols?: string[];
  path?: string;
}

export interface TlsHost {
  name: string;
  connect(options: TlsConnectOptions): ITcpSocket;
}

/** What the runtime gets from the platform: sockets, and HTTP / DNS / TLS when the host has them. */
export interface AgapiHost {
  name: string;
  net: NetHost;
  http?: HttpHost;
  dns?: DnsHost;
  tls?: TlsHost;
}

/** Runtime slot set by installHost(). */
let currentHost: AgapiHost | null = null;

export function getHost(): AgapiHost | null {
  return currentHost;
}

export function setHost(host: AgapiHost | null): void {
  currentHost = host;
}

export type { INetworkProvider, ITcpServer, ITcpSocket, IUdpSocket };

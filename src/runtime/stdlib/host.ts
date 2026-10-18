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
/** The device the GUI runs on, as iViewer gives it to scripts (CF.device, CF.ipv4address ...). */
export interface HostDeviceInfo {
  platform: string;
  version: string;
  model: string;
  name: string;
  /** an ID of this device (made once, kept) */
  uuid: string;
  ipv4address: string;
  ipv4netmask: string;
  ipv6address: string;
  ipv6netmask: string;
  MACaddress: string;
  /** None, WiFi, WAN, VPN (as iViewer) */
  networkType: string;
  networkSSID: string;
}

/**
 * The device's own settings, as far as the host knows them (each one it
 * has): CF.device's brightness, volume and battery, and the system bars.
 */
export interface HostDeviceProperties {
  /** 0 to 1 */
  screenBrightness?: number;
  /** 0 to 1 (the media volume) */
  soundOutputVolume?: number;
  /** 0 to 1 */
  batteryLevel?: number;
  batteryChargeStatus?: 'unknown' | 'unplugged' | 'charging' | 'full';
  statusBar?: 'visible' | 'hidden';
  navigationBar?: 'visible' | 'hidden';
}

/** what CF.setDeviceProperty asks of the device: the properties it can set */
export interface HostDeviceChange {
  screenBrightness?: number;
  soundOutputVolume?: number;
  statusBar?: 'visible' | 'hidden';
  /** the status bar's text and icons (white on a dark GUI, black on a light one) */
  statusBarText?: 'white' | 'black';
  navigationBar?: 'visible' | 'hidden';
}

/** a hardware key CF.interceptHardwareKey hears: Android's key code, from how long a hold, kept from the system or not */
export interface HostHardwareKey {
  keyCode: number;
  /** ms held at least */
  pressTime: number;
  /** the system doesn't get the key (a shorter press it does) */
  intercept: boolean;
}

/** The device's settings and keys where the host reaches them (the panel app on Android; a browser's battery). */
export interface HostDeviceControl {
  /** the properties now (the ones the host has) */
  properties(): Promise<HostDeviceProperties>;
  /**
   * Each change after: the user's, the battery's, the system's - and, quiet,
   * what a set() made of the device (a volume on its step), heard by no script.
   */
  onChange(cb: (changed: HostDeviceProperties, quiet: boolean) => void): void;
  set(change: HostDeviceChange): void;
  /**
   * The keys to hear - all of them, the ones before replaced - and what's
   * heard: a key let go, held so long (ms). None: the host has no keys.
   */
  keys?(keys: HostHardwareKey[], onKey: (keyCode: number, held: number) => void): void;
}

export interface AgapiHost {
  name: string;
  net: NetHost;
  http?: HttpHost;
  dns?: DnsHost;
  tls?: TlsHost;
  /** the device and its network now */
  device?: () => Promise<HostDeviceInfo>;
  /** the device's own settings and keys, where the host has them */
  deviceControl?: HostDeviceControl;
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

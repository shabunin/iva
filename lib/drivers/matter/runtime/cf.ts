/**
 * iViewer's CF as the driver uses it: the panel's global. What it does on
 * the wire (CF.send with a byte a char, the frames a catch-all feedback
 * matches, Bonjour lookups, persisted tokens) is all the driver asks of it.
 */

export interface CfSystem {
  address: string;
  port: number;
  enabled: boolean;
  connections?: string[];
  localPort?: number;
  type?: string;
}

/** a service CF.startLookup found (iViewer's shape; TXT data as it gives it) */
export interface FoundService {
  name: string;
  type?: string;
  hostname?: string;
  addresses?: string[];
  port: number;
  data?: Record<string, string | null> | null;
}

export type LookupCallback = (added: FoundService[], removed: FoundService[], error?: string) => void;

export interface CF {
  FeedbackMatchedEvent: string;
  JoinChangeEvent: string;
  ConnectionStatusChangeEvent: string;
  GlobalTokensJoin: string;
  ipv4address: string;
  ipv4netmask?: string;
  ipv6address?: string;
  MACaddress: string;
  /** "iva" in iva's own runtime; undefined in iViewer */
  runtime?: string;
  device?: { platform?: string; name?: string; model?: string };
  systems: Record<string, CfSystem>;
  send(system: string, data: string, format?: unknown): void;
  watch(event: string, ...args: unknown[]): void;
  setSystemProperties(system: string, props: Record<string, unknown>): void;
  startLookup(type: string, name: string, callback: LookupCallback): void;
  stopLookup(type: string, name: string): void;
  setToken(join: string, name: string, value: string): void;
  getJoin(join: string, callback: (join: string, value: string, tokens?: Record<string, string>) => void): void;
  setJoin(join: string, value: string | number, event?: boolean): void;
  log(message: string): void;
}

/** the panel's CF */
export function cf(): CF {
  const c = (globalThis as { CF?: CF }).CF;
  if (!c) throw new Error('no CF: this script runs on the panel');
  return c;
}

/** bytes as the string CF.send takes: a char a byte */
export function toBinary(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return s;
}

/** the bytes a feedback matched: a char a byte (a char past a byte is kept to its low byte) */
export function fromBinary(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

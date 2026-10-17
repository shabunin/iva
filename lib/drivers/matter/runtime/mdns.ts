/**
 * DNS-SD for matter.js from CF.startLookup / CF.stopLookup: what Bonjour
 * finds (operational nodes as _matter._tcp., commissionable devices as
 * _matterc._udp.) becomes the DNS records a responder would have sent -
 * PTR (the subtypes a commissionable device would be found under too), SRV,
 * TXT, A, AAAA - and goes to matter.js's own DnssdNames as a received mDNS
 * message. A query matter.js sends starts the lookup of that type (once;
 * kept running) and gets the records already found again. Announcements
 * matter.js sends (the controller's own) go nowhere: nobody looks for a
 * panel. The socket stands in for matter.js's MdnsSocket, the service for
 * its MdnsService, so its scanners and peers work unchanged.
 */

import {
  AAAARecord, ARecord, Construction, Crypto, Diagnostic, DnsMessageType, DnssdNames, Entropy, Environment, Minutes, Observable, PtrRecord, SrvRecord, TxtRecord,
  type Constructable, type DnsMessage, type DnsRecord, type MdnsSocket, type Network,
} from '@matter/general';
import { MdnsServer, MdnsService } from '@matter/protocol';
import type { CF, FoundService } from './cf.js';

export const OPERATIONAL = '_matter._tcp.';
export const COMMISSIONABLE = '_matterc._udp.';
const SUFFIX: Record<string, string> = { [OPERATIONAL]: '_matter._tcp.local', [COMMISSIONABLE]: '_matterc._udp.local' };
const TTL = Minutes(30);

export interface Found {
  kind: 'operational' | 'commissionable';
  name: string;
  hostname: string;
  addresses: string[];
  port: number;
  data: Record<string, string>;
}

/** the lookup type a DNS-SD name belongs to */
export function typeOf(qname: string): string | undefined {
  const lower = qname.toLowerCase();
  for (const [type, suffix] of Object.entries(SUFFIX)) if (lower === suffix || lower.endsWith(`.${suffix}`)) return type;
  return undefined;
}

/** TXT data as iViewer gives it: an empty record comes as { "": null } */
export function txtOf(data: FoundService['data']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data ?? {})) if (k) out[k] = v === null || v === undefined ? '' : String(v);
  return out;
}

/** a found service's host name (iViewer may give it with a dot at the end, or not at all) */
function hostOf(s: FoundService): string {
  const h = (s.hostname ?? '').replace(/\.$/, '');
  return h || `${s.name.replace(/[^\w-]/g, '')}.local`;
}

export function foundOf(kind: Found['kind'], s: FoundService): Found {
  return { kind, name: s.name, hostname: hostOf(s), addresses: s.addresses ?? [], port: s.port, data: txtOf(s.data) };
}

/** the records a responder announces a service with (ttl 0: gone) */
export function recordsOf(f: Found, ipv6: boolean, ttl = TTL): { answers: DnsRecord<unknown>[]; additional: DnsRecord<unknown>[] } {
  const base = SUFFIX[f.kind === 'operational' ? OPERATIONAL : COMMISSIONABLE];
  const instance = `${f.name}.${base}`;
  const answers: DnsRecord<unknown>[] = [PtrRecord(base, instance, ttl)];
  if (f.kind === 'commissionable') {
    // the subtypes a commissionable device is found under: its discriminator (long and short), vendor, commissioning mode, device type
    const subs: string[] = [];
    const d = Number(f.data.D);
    if (Number.isFinite(d)) subs.push(`_L${d}`, `_S${d >> 8}`);
    if (f.data.VP) subs.push(`_V${f.data.VP.split('+')[0]}`);
    if (f.data.CM && f.data.CM !== '0') subs.push('_CM');
    if (f.data.DT) subs.push(`_T${f.data.DT}`);
    for (const sub of subs) answers.push(PtrRecord(`${sub}._sub.${base}`, instance, ttl));
  }
  answers.push(SrvRecord(instance, { priority: 0, weight: 0, port: f.port, target: f.hostname }, ttl));
  answers.push(TxtRecord(instance, Object.entries(f.data).map(([k, v]) => (v === '' ? k : `${k}=${v}`)), ttl));
  const additional: DnsRecord<unknown>[] = [];
  // IPv4 first: what a panel reaches; IPv6 only where the systems take it
  for (const a of f.addresses) {
    if (a.includes(':')) {
      if (ipv6) additional.push(AAAARecord(f.hostname, a.replace(/%.*$/, ''), ttl));
    } else additional.push(ARecord(f.hostname, a, ttl));
  }
  return { answers, additional };
}

export interface CfMdnsOptions {
  ipv6: boolean;
  log?: (m: string) => void;
}

/** stands in for matter.js's MdnsSocket: records from CF's lookups in, queries out as lookups */
export class CfMdnsSocket {
  readonly receipt = Observable<[message: MdnsSocket.Message], void>();
  /** emits when what's found changes */
  readonly changed = Observable<[], void>();
  readonly supportsIpv4 = true;
  readonly netInterface: string | undefined = undefined;
  private lookups = new Map<string, Map<string, Found>>();
  /** devices known by address (app.jsx), announced as found */
  private known = new Map<string, Found>();
  private closed = false;

  constructor(private cf: CF, readonly network: Network, private options: CfMdnsOptions) {}

  registerRelevantNames(): void {}
  addRelevantName(): void {}
  removeRelevantName(): void {}
  unregisterRelevantNames(): void {}

  /** a query: the lookup of its type started (once), what's found of it told again; a response (ours): dropped */
  async send(message: Partial<DnsMessage> & { messageType: DnsMessageType }): Promise<void> {
    if (!DnsMessageType.isQuery(message.messageType)) return;
    const types = new Set<string>();
    let hosts = false;
    for (const q of message.queries ?? []) {
      const type = typeOf(q.name);
      if (type) types.add(type);
      else hosts = true;
    }
    for (const type of types) {
      this.lookup(type);
      for (const f of this.lookups.get(type)!.values()) this.emit(f);
    }
    // a host's addresses (A / AAAA): everything known again - its records are among them
    if (hosts) for (const f of this.all()) this.emit(f);
    for (const f of this.known.values()) if (!types.size || types.has(f.kind === 'operational' ? OPERATIONAL : COMMISSIONABLE)) this.emit(f);
  }

  /** the lookup of a type, started once and kept running */
  lookup(type: string): void {
    if (this.lookups.has(type) || this.closed) return;
    const found = new Map<string, Found>();
    this.lookups.set(type, found);
    const kind: Found['kind'] = type === OPERATIONAL ? 'operational' : 'commissionable';
    this.options.log?.(`looking up ${type}`);
    this.cf.startLookup(type, '', (added, removed, error) => {
      if (error) {
        this.options.log?.(`lookup ${type}: ${error}`);
        return;
      }
      for (const s of removed ?? []) {
        const f = found.get(s.name);
        if (!f) continue;
        found.delete(s.name);
        this.emit(f, 0);
      }
      for (const s of added ?? []) {
        const f = foundOf(kind, s);
        found.set(s.name, f);
        this.options.log?.(`found ${kind} ${f.name} at ${f.addresses.join(', ') || f.hostname}:${f.port}${Object.keys(f.data).length ? ' ' + JSON.stringify(f.data) : ''}`);
        this.emit(f);
      }
      this.changed.emit();
    });
  }

  /** a device known by address: as if Bonjour found it */
  announce(f: Found): void {
    this.known.set(`${f.kind}/${f.name}`, f);
    this.emit(f);
    this.changed.emit();
  }

  /** everything found (and known) */
  all(): Found[] {
    const out: Found[] = [];
    for (const m of this.lookups.values()) out.push(...m.values());
    out.push(...this.known.values());
    return out;
  }

  private emit(f: Found, ttl?: number): void {
    const { answers, additional } = recordsOf(f, this.options.ipv6, ttl === undefined ? undefined : (ttl as unknown as typeof TTL));
    const message: MdnsSocket.Message = {
      transactionId: 0, messageType: DnsMessageType.Response, queries: [], answers, authorities: [], additionalRecords: additional,
      sourceIp: f.addresses.find((a) => !a.includes(':')) ?? f.addresses[0] ?? '0.0.0.0', sourceIntf: 'cf',
    };
    this.receipt.emit(message);
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const type of this.lookups.keys()) this.cf.stopLookup(type, '');
    this.lookups.clear();
  }
}

const MATTER_SUFFIXES = ['._matter._tcp.local', '._matterc._udp.local', '._matterd._udp.local'];

/** stands in for matter.js's MdnsService (its names and server over the CF socket), set in the environment */
export class CfMdnsService implements Constructable<CfMdnsService> {
  readonly limitedToNetInterface: string | undefined = undefined;
  readonly enableIpv4 = true;
  #construction: Construction<CfMdnsService>;
  #server?: MdnsServer;
  #names?: DnssdNames;

  constructor(private env: Environment, readonly socket: CfMdnsSocket) {
    env.root.set(MdnsService, this as unknown as MdnsService);
    this.#construction = Construction(this, async () => {
      this.#server = new MdnsServer(socket as unknown as MdnsSocket, this.#construction);
    });
  }

  get server(): MdnsServer {
    return this.#construction.assert('MDNS service', this.#server);
  }

  get names(): DnssdNames {
    if (this.#names === undefined) {
      this.#names = new DnssdNames({
        socket: this.socket as unknown as MdnsSocket,
        lifetime: this.#construction,
        // (the node's environment sets Entropy; a bare one has the Crypto, which is one)
        entropy: this.env.has(Entropy) ? this.env.get(Entropy) : this.env.get(Crypto),
        filter: ({ name }) => {
          const lower = name.toLowerCase();
          return MATTER_SUFFIXES.some((suffix) => lower.endsWith(suffix));
        },
        filterNames: MATTER_SUFFIXES.map((suffix) => suffix.slice(1)),
      });
    }
    return this.#names;
  }

  get construction(): Construction<CfMdnsService> {
    return this.#construction;
  }

  get [Diagnostic.value](): string {
    return 'MDNS';
  }

  async close(): Promise<void> {
    await this.#construction.close(async () => {
      await this.#server?.close();
      await this.#names?.close();
      await this.socket.close();
      this.#server = this.#names = undefined;
    });
  }
}

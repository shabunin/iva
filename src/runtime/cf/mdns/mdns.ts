/**
 * Bonjour (mDNS, DNS-SD) as iViewer's CF.startLookup / CF.startPublishing do
 * it, on the runtime's own UDP sockets (the panel's, the preview's): queries
 * and answers on 224.0.0.251:5353 (RFC 6762, 6763), shared with the OS's own
 * responder (the port reused). The callbacks as CommandFusion's docs have
 * them: a lookup's (added, removed, error), a publication's (type, name,
 * port, published, error).
 */
import { dgram } from '../../stdlib/dgram';
import type { IUdpSocket } from '../../stdlib/net/types';
import { TYPE, encode, decode, sameName, labels, joinLabels, txtData, txtStrings, type DnsRecord, type Message, type Question, type Srv } from './dns';

const GROUP = '224.0.0.251';
const PORT = 5353;
/** RFC 6762 §10: records naming a host 120 s, the others 75 min */
const TTL_HOST = 120;
const TTL_OTHER = 4500;
const ENUM = '_services._dns-sd._udp.local';
/** after a wake: a service not heard again in this long is gone */
const RECHECK_MS = 5000;

/** A service a lookup found, as CF.startLookup's callback gets it. */
export interface FoundService {
  name: string;
  type: string;
  addresses: string[];
  hostname: string;
  port: number;
  data: Record<string, string>;
}
/** A service gone: its name and type only. */
export interface GoneService {
  name: string;
  type: string;
}
export type LookupCallback = (added: FoundService[], removed: GoneService[], error: string | null) => void;
export type PublishCallback = (serviceType: string, serviceName: string, port: number, published: boolean, error: string | null) => void;

/** What the engine asks of the device around it. */
export interface MdnsHost {
  /** the device's IPv4 address and netmask (the subnet a found service's addresses are kept to; our A record) */
  network(): { ipv4address?: string; ipv4netmask?: string };
  /** a published service's name when none is given: the device's */
  deviceName(): string;
  /** a few letters of the device's id: the host name it publishes, iva-<id>.local */
  deviceId(): string;
  /** a UDP socket (default: the runtime's dgram) */
  createSocket?(): IUdpSocket;
  log?(message: string): void;
}

/** "_http._tcp." (a script's) → "_http._tcp.local" (the wire's) */
export function fqType(type: string): string {
  const ls = labels(type);
  if (ls.length && ls[ls.length - 1].toLowerCase() !== 'local') ls.push('local');
  return joinLabels(ls);
}
/** an instance's full name: "Living room._http._tcp.local" */
const instanceName = (name: string, fq: string) => `${joinLabels([name])}.${fq}`;
/** an instance's own name, from its full one under a type */
function ownName(full: string, fq: string): string {
  const ls = labels(full);
  return ls.slice(0, Math.max(1, ls.length - labels(fq).length)).join('.');
}

function onSubnet(addr: string, ip?: string, mask?: string): boolean {
  if (!ip || !mask || ip === '0.0.0.0') return true;
  const n = (s: string) => s.split('.').reduce((acc, p) => ((acc << 8) | (Number(p) & 255)) >>> 0, 0);
  return ((n(addr) & n(mask)) >>> 0) === ((n(ip) & n(mask)) >>> 0);
}

interface Instance {
  full: string;
  name: string;
  ptrExpires: number;
  srv?: Srv;
  srvExpires?: number;
  txt?: Record<string, string>;
  reported: boolean;
  /** last time any record of it came */
  heardAt: number;
  /** last time it was asked about (its SRV, TXT, address) */
  askedAt: number;
}

interface Lookup {
  type: string;
  fq: string;
  name: string;
  callbacks: LookupCallback[];
  instances: Map<string, Instance>;
  timer?: ReturnType<typeof setTimeout>;
  /** queries so far: the next comes later each time (1 s, 2 s ... 60 s) */
  sent: number;
}

interface Published {
  type: string;
  fq: string;
  name: string;
  full: string;
  port: number;
  txt: string[];
  callback?: PublishCallback;
  state: 'probing' | 'published' | 'asleep';
  timers: ReturnType<typeof setTimeout>[];
}

export class Mdns {
  private socket: IUdpSocket | null = null;
  /** bound to 5353 (else a port of its own: it asks, it can't answer) */
  private shared = false;
  private ready: Promise<boolean> | null = null;
  private lookups: Lookup[] = [];
  private published: Published[] = [];
  /** host name → its addresses, until when */
  private hosts = new Map<string, Map<string, number>>();
  private ticker: ReturnType<typeof setInterval> | null = null;
  private asleep = false;
  /** a close after a goodbye: a moment later, so the goodbye goes out first */
  private closing: ReturnType<typeof setTimeout> | null = null;
  /** when a record was last sent by multicast (not again within a second) */
  private lastSent = new Map<string, number>();

  constructor(private host: MdnsHost) {}

  private log(m: string) {
    this.host.log?.(`mDNS: ${m}`);
  }

  /** our host name: iva-<id>.local */
  private hostName() {
    return `iva-${this.host.deviceId().replace(/[^a-z0-9-]/gi, '').slice(0, 8).toLowerCase() || 'panel'}.local`;
  }

  // ── the socket ─────────────────────────────────────────────────

  private open(): Promise<boolean> {
    // closing: kept
    if (this.closing) clearTimeout(this.closing);
    this.closing = null;
    if (this.ready) return this.ready;
    this.ready = new Promise<boolean>((resolve) => {
      const make = () => this.host.createSocket?.() ?? dgram.createSocket({ type: 'udp4', reuseAddr: true, reusePort: true } as any);
      const start = (sock: IUdpSocket, port: number) => {
        let done = false;
        sock.on('message', (msg: Uint8Array, rinfo: { address: string; port: number }) => this.receive(msg, rinfo));
        sock.on('error', (e: any) => {
          if (!done && port === PORT) {
            // 5353 taken (the OS's responder doesn't share it): asking only, answers by unicast
            done = true;
            this.log(`port ${PORT} is taken (${e?.message ?? e}): lookups only`);
            try {
              sock.close();
            } catch {
              // closed
            }
            start(make(), 0);
            return;
          }
          this.log(`socket: ${e?.message ?? e}`);
        });
        sock.bind(port, () => {
          done = true;
          this.socket = sock;
          this.shared = port === PORT;
          if (this.shared) {
            const ip = this.host.network().ipv4address;
            try {
              sock.addMembership(GROUP, ip && ip !== '0.0.0.0' ? ip : undefined);
            } catch {
              try {
                sock.addMembership(GROUP);
              } catch (e: any) {
                this.log(`joining ${GROUP}: ${e?.message ?? e}`);
              }
            }
          }
          try {
            sock.setMulticastTTL?.(255);
            // our own services found by our own lookups too
            sock.setMulticastLoopback?.(true);
          } catch {
            // not on this host
          }
          const ip = this.host.network().ipv4address;
          this.log(`on ${this.shared ? `${GROUP}:${PORT}` : 'a port of its own (asking only)'}${ip ? `, this device ${ip}` : ''}`);
          resolve(true);
        });
      };
      try {
        start(make(), PORT);
      } catch (e: any) {
        this.log(`no UDP here: ${e?.message ?? e}`);
        resolve(false);
      }
    });
    return this.ready;
  }

  private close() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    const sock = this.socket;
    this.socket = null;
    this.ready = null;
    this.shared = false;
    if (sock) {
      try {
        sock.close();
      } catch {
        // closed
      }
    }
  }

  /** nothing looked up or published: the socket goes */
  private idle() {
    if (!this.lookups.length && !this.published.length) this.closeSoon();
  }

  /** the socket closed a moment from now (what was just sent goes out first), unless it's wanted again */
  private closeSoon() {
    if (this.closing) clearTimeout(this.closing);
    this.closing = setTimeout(() => {
      this.closing = null;
      if (this.asleep || (!this.lookups.length && !this.published.length)) this.close();
    }, 300);
  }

  private send(m: Message, to?: { address: string; port: number }) {
    const sock = this.socket;
    if (!sock) return;
    const bytes = encode(m);
    try {
      sock.send(bytes, 0, bytes.length, to?.port ?? PORT, to?.address ?? GROUP);
    } catch (e: any) {
      this.log(`send: ${e?.message ?? e}`);
    }
  }

  private tick() {
    if (this.ticker) return;
    this.ticker = setInterval(() => this.expire(), 1000);
  }

  // ── lookups ────────────────────────────────────────────────────

  /** CF.startLookup: services of a type (named so, if a name is given), as they come and go. */
  async lookup(type: string, name: string, callback: LookupCallback) {
    const fq = fqType(type);
    let l = this.lookups.find((x) => sameName(x.fq, fq) && x.name === (name || ''));
    if (l) {
      l.callbacks.push(callback);
      // what it knows already, for the new one
      const known = [...l.instances.values()].filter((i) => i.reported).map((i) => this.found(l!, i));
      if (known.length) this.call(callback, known, []);
      return;
    }
    l = { type, fq, name: name || '', callbacks: [callback], instances: new Map(), sent: 0 };
    this.lookups.push(l);
    this.log(`looking up ${fq}${name ? ` named "${name}"` : ''}`);
    if (!(await this.open())) {
      this.call(callback, [], [], 'Bonjour needs UDP sockets: none here');
      return;
    }
    this.tick();
    this.query(l);
  }

  /** CF.stopLookup: every lookup of that type and name ends. */
  stopLookup(type: string, name: string) {
    const fq = fqType(type);
    for (const l of this.lookups.filter((x) => sameName(x.fq, fq) && x.name === (name || ''))) clearTimeout(l.timer);
    this.lookups = this.lookups.filter((x) => !(sameName(x.fq, fq) && x.name === (name || '')));
    this.idle();
  }

  /** a browse query now, the next later each time (1, 2, 4 ... 60 s) */
  private query(l: Lookup) {
    clearTimeout(l.timer);
    if (this.asleep || !this.lookups.includes(l)) return;
    const now = Date.now();
    // known answers: what we have, not to be told again (RFC 6762 §7.1)
    const known: DnsRecord[] = [...l.instances.values()]
      .filter((i) => i.ptrExpires - now > (TTL_OTHER * 1000) / 2)
      .map((i) => ({ name: l.fq, type: TYPE.PTR, ttl: Math.round((i.ptrExpires - now) / 1000), data: i.full }));
    this.send({ id: 0, response: false, questions: [{ name: l.fq, type: TYPE.PTR, unicast: !this.shared && l.sent === 0 }], answers: known, authorities: [], additionals: [] },
      this.shared ? undefined : { address: GROUP, port: PORT });
    l.sent++;
    l.timer = setTimeout(() => this.query(l), Math.min(60000, 1000 * 2 ** Math.min(l.sent - 1, 6)));
  }

  /** what we don't know yet of an instance (its SRV, TXT; its host's address) */
  private resolve(i: Instance) {
    const now = Date.now();
    if (now - i.askedAt < 1000) return;
    i.askedAt = now;
    const qs: Question[] = [];
    if (!i.srv) qs.push({ name: i.full, type: TYPE.SRV });
    if (!i.txt) qs.push({ name: i.full, type: TYPE.TXT });
    if (i.srv && !this.addressesOf(i.srv.target).length) qs.push({ name: i.srv.target, type: TYPE.A });
    if (qs.length) this.send({ id: 0, response: false, questions: qs, answers: [], authorities: [], additionals: [] });
  }

  private addressesOf(host: string): string[] {
    const now = Date.now();
    const known = this.hosts.get(host.toLowerCase());
    return known ? [...known].filter(([, until]) => until > now).map(([a]) => a) : [];
  }

  /** a found instance as the callback gets it: IPv4 first, those not on our subnet left out (if any are on it) */
  private found(l: Lookup, i: Instance): FoundService {
    const { ipv4address, ipv4netmask } = this.host.network();
    const all = i.srv ? this.addressesOf(i.srv.target) : [];
    const v4 = all.filter((a) => !a.includes(':'));
    const near = v4.filter((a) => onSubnet(a, ipv4address, ipv4netmask));
    const v6 = all.filter((a) => a.includes(':'));
    return {
      name: i.name,
      type: l.type,
      addresses: [...(near.length ? near : v4), ...v6],
      hostname: i.srv ? i.srv.target : '',
      port: i.srv ? i.srv.port : 0,
      data: i.txt ?? {},
    };
  }

  private call(cb: LookupCallback, added: FoundService[], removed: GoneService[], error: string | null = null) {
    try {
      cb(added, removed, error);
    } catch (e: any) {
      this.log(`a lookup's callback: ${e?.message ?? e}`);
    }
  }

  /** what changed for each lookup, to its callbacks at once */
  private report(changes: Map<Lookup, { added: FoundService[]; removed: GoneService[] }>) {
    for (const [l, { added, removed }] of changes) {
      if (!added.length && !removed.length) continue;
      for (const f of added) this.log(`found "${f.name}" (${l.fq}) at ${f.hostname}:${f.port} [${f.addresses.join(', ')}]${Object.keys(f.data).length ? ` ${JSON.stringify(f.data)}` : ''}`);
      for (const g of removed) this.log(`gone "${g.name}" (${l.fq})`);
      for (const cb of [...l.callbacks]) this.call(cb, added, removed);
    }
  }

  /** gone: TTLs run out, or not heard again after a wake */
  private expire() {
    const now = Date.now();
    const changes = new Map<Lookup, { added: FoundService[]; removed: GoneService[] }>();
    for (const l of this.lookups) {
      for (const [key, i] of l.instances) {
        if (i.ptrExpires > now) continue;
        l.instances.delete(key);
        if (i.reported) {
          const c = changes.get(l) ?? { added: [], removed: [] };
          c.removed.push({ name: i.name, type: l.type });
          changes.set(l, c);
        }
      }
    }
    for (const [host, addrs] of this.hosts) {
      for (const [a, until] of addrs) if (until <= now) addrs.delete(a);
      if (!addrs.size) this.hosts.delete(host);
    }
    this.report(changes);
  }

  /** records an answer brings: the hosts' addresses, then each lookup's instances */
  private learn(records: DnsRecord[]) {
    const now = Date.now();
    for (const r of records) {
      if (r.type !== TYPE.A && r.type !== TYPE.AAAA) continue;
      const key = r.name.toLowerCase();
      const addrs = this.hosts.get(key) ?? new Map<string, number>();
      if (r.flush) for (const [a] of addrs) if (a.includes(':') === (r.type === TYPE.AAAA) && a !== r.data) addrs.set(a, Math.min(addrs.get(a)!, now + 1000));
      if (r.ttl === 0) addrs.set(String(r.data), now + 1000);
      else addrs.set(String(r.data), now + r.ttl * 1000);
      this.hosts.set(key, addrs);
    }
    const changes = new Map<Lookup, { added: FoundService[]; removed: GoneService[] }>();
    const change = (l: Lookup) => {
      const c = changes.get(l) ?? { added: [], removed: [] };
      changes.set(l, c);
      return c;
    };
    for (const l of this.lookups) {
      for (const r of records) {
        if (r.type === TYPE.PTR && sameName(r.name, l.fq)) {
          const full = String(r.data);
          const name = ownName(full, l.fq);
          if (l.name && name.toLowerCase() !== l.name.toLowerCase()) continue;
          const key = full.toLowerCase();
          const i = l.instances.get(key);
          if (r.ttl === 0) {
            // goodbye
            if (i) {
              l.instances.delete(key);
              if (i.reported) change(l).removed.push({ name: i.name, type: l.type });
            }
            continue;
          }
          if (i) {
            i.ptrExpires = now + r.ttl * 1000;
            i.heardAt = now;
          } else l.instances.set(key, { full, name, ptrExpires: now + r.ttl * 1000, reported: false, heardAt: now, askedAt: -Infinity });
        }
      }
      for (const r of records) {
        const i = l.instances.get(r.name.toLowerCase());
        if (!i) continue;
        if (r.type === TYPE.SRV) {
          i.srv = r.ttl === 0 ? undefined : (r.data as Srv);
          i.srvExpires = now + r.ttl * 1000;
          i.heardAt = now;
        } else if (r.type === TYPE.TXT) {
          i.txt = txtData(r.data as string[]);
          i.heardAt = now;
        }
      }
      for (const i of l.instances.values()) {
        if (i.reported) continue;
        if (i.srv && this.addressesOf(i.srv.target).length) {
          i.reported = true;
          change(l).added.push(this.found(l, i));
        } else this.resolve(i);
      }
    }
    this.report(changes);
  }

  // ── publishing ────────────────────────────────────────────────

  /** CF.startPublishing: a service of ours, answered for while it's published. */
  async publish(type: string, name: string | null | undefined, port: number, data: Record<string, unknown> | null | undefined, callback?: PublishCallback) {
    const fq = fqType(type);
    const own = name || this.host.deviceName() || 'iva panel';
    const answer = (published: boolean, error: string | null) => {
      try {
        callback?.(type, name ?? '', port, published, error);
      } catch (e: any) {
        this.log(`a publication's callback: ${e?.message ?? e}`);
      }
    };
    if (this.published.some((p) => sameName(p.fq, fq) && p.name.toLowerCase() === own.toLowerCase() && p.port === port)) {
      answer(false, 'Duplicate service');
      return;
    }
    const p: Published = { type, fq, name: own, full: instanceName(own, fq), port, txt: txtStrings(data), callback, state: 'probing', timers: [] };
    this.published.push(p);
    this.log(`publishing "${own}" (${fq}) on port ${port} as ${this.hostName()}`);
    if (!(await this.open()) || !this.shared) {
      this.published = this.published.filter((x) => x !== p);
      answer(false, `Bonjour can't publish here: port ${PORT} is taken`);
      this.idle();
      return;
    }
    this.tick();
    this.announce(p, answer);
  }

  /** probe for the name twice (anyone else's answer: a conflict), then announce it twice, a second apart */
  private announce(p: Published, answer: (published: boolean, error: string | null) => void) {
    p.state = 'probing';
    const probe = () => this.send({
      id: 0, response: false, questions: [{ name: p.full, type: TYPE.ANY, unicast: true }],
      answers: [], authorities: this.records(p).filter((r) => sameName(r.name, p.full)), additionals: [],
    });
    probe();
    p.timers.push(setTimeout(probe, 250));
    p.timers.push(setTimeout(() => {
      if (p.state !== 'probing' || !this.published.includes(p)) return;
      p.state = 'published';
      this.log(`published "${p.name}" (${p.fq})`);
      const all = this.records(p);
      this.send({ id: 0, response: true, authoritative: true, questions: [], answers: all, authorities: [], additionals: [] });
      p.timers.push(setTimeout(() => {
        if (p.state === 'published') this.send({ id: 0, response: true, authoritative: true, questions: [], answers: this.records(p), authorities: [], additionals: [] });
      }, 1000));
      answer(true, null);
    }, 500));
  }

  /** CF.stopPublishing: a goodbye (its records' TTLs 0), and its callback told once: not published, no error. */
  stopPublishing(type: string, name: string | null | undefined, port: number) {
    const fq = fqType(type);
    const own = name || this.host.deviceName() || 'iva panel';
    const p = this.published.find((x) => sameName(x.fq, fq) && x.name.toLowerCase() === own.toLowerCase() && x.port === port);
    if (!p) return;
    this.published = this.published.filter((x) => x !== p);
    p.timers.forEach(clearTimeout);
    if (p.state === 'published') this.goodbye(p);
    this.log(`stopped publishing "${p.name}" (${p.fq})`);
    try {
      p.callback?.(type, name ?? '', port, false, null);
    } catch (e: any) {
      this.log(`a publication's callback: ${e?.message ?? e}`);
    }
    this.idle();
  }

  private goodbye(p: Published) {
    this.send({ id: 0, response: true, authoritative: true, questions: [], answers: this.records(p).map((r) => ({ ...r, ttl: 0 })), authorities: [], additionals: [] });
  }

  /** a published service's records: PTR (shared), SRV, TXT, its host's A (ours, cache-flush) */
  private records(p: Published, ttlCap?: number): DnsRecord[] {
    const host = this.hostName();
    const ip = this.host.network().ipv4address;
    const ttl = (t: number) => (ttlCap === undefined ? t : Math.min(t, ttlCap));
    const out: DnsRecord[] = [
      { name: p.fq, type: TYPE.PTR, ttl: ttl(TTL_OTHER), data: p.full },
      { name: p.full, type: TYPE.SRV, ttl: ttl(TTL_HOST), flush: ttlCap === undefined, data: { priority: 0, weight: 0, port: p.port, target: host } },
      { name: p.full, type: TYPE.TXT, ttl: ttl(TTL_OTHER), flush: ttlCap === undefined, data: p.txt },
    ];
    if (ip && ip !== '0.0.0.0') out.push({ name: host, type: TYPE.A, ttl: ttl(TTL_HOST), flush: ttlCap === undefined, data: ip });
    return out;
  }

  /** a query: what of ours it asks about, answered (by unicast if it wants it so, or it's not an mDNS querier) */
  private answer(m: Message, from: { address: string; port: number }) {
    const live = this.published.filter((p) => p.state === 'published');
    if (!live.length) return;
    const legacy = from.port !== PORT;
    const unicast = legacy || m.questions.some((q) => q.unicast);
    const cap = legacy ? 10 : undefined;
    const answers: DnsRecord[] = [];
    const extra: DnsRecord[] = [];
    const has = (list: DnsRecord[], r: DnsRecord) => list.some((x) => x.type === r.type && sameName(x.name, r.name) && JSON.stringify(x.data) === JSON.stringify(r.data));
    const add = (list: DnsRecord[], r: DnsRecord) => {
      if (!has(answers, r) && !has(extra, r)) list.push(r);
    };
    // what the asker says it knows already (with at least half its TTL left) isn't sent again
    const known = (r: DnsRecord) => m.answers.some((k) => k.type === r.type && sameName(k.name, r.name) && JSON.stringify(k.data) === JSON.stringify(r.data) && k.ttl * 2 >= r.ttl);
    for (const q of m.questions) {
      const any = q.type === TYPE.ANY;
      if ((q.type === TYPE.PTR || any) && sameName(q.name, ENUM)) {
        for (const p of live) add(answers, { name: ENUM, type: TYPE.PTR, ttl: cap ?? TTL_OTHER, data: p.fq });
      }
      for (const p of live) {
        const [ptr, srv, txt, a] = this.records(p, cap);
        if ((q.type === TYPE.PTR || any) && sameName(q.name, p.fq) && !known(ptr)) {
          add(answers, ptr);
          add(extra, srv);
          add(extra, txt);
          if (a) add(extra, a);
        }
        if ((q.type === TYPE.SRV || any) && sameName(q.name, p.full)) {
          add(answers, srv);
          if (a) add(extra, a);
        }
        if ((q.type === TYPE.TXT || any) && sameName(q.name, p.full)) add(answers, txt);
        if ((q.type === TYPE.A || any) && a && sameName(q.name, a.name)) add(answers, a);
      }
    }
    if (!answers.length) return;
    if (unicast) {
      this.send({ id: legacy ? m.id : 0, response: true, authoritative: true, questions: legacy ? m.questions : [], answers, authorities: [], additionals: extra }, from);
      return;
    }
    // not the same records by multicast more than once a second
    const now = Date.now();
    const fresh = answers.filter((r) => now - (this.lastSent.get(`${r.type} ${r.name}`.toLowerCase()) ?? -Infinity) >= 1000);
    if (!fresh.length) return;
    for (const r of fresh) this.lastSent.set(`${r.type} ${r.name}`.toLowerCase(), now);
    // shared records after a moment (20..120 ms), as RFC 6762 §6 asks
    const delay = fresh.some((r) => r.type === TYPE.PTR) ? 20 + Math.random() * 100 : 0;
    setTimeout(() => this.send({ id: 0, response: true, authoritative: true, questions: [], answers: fresh, authorities: [], additionals: extra }), delay);
  }

  /** an answer while we probe naming our instance (someone else's): a conflict */
  private conflicts(m: Message) {
    for (const p of this.published.filter((x) => x.state === 'probing')) {
      const theirs = [...m.answers, ...m.additionals].find((r) => r.type === TYPE.SRV && sameName(r.name, p.full));
      if (!theirs) continue;
      const s = theirs.data as Srv;
      if (s.port === p.port && sameName(s.target, this.hostName())) continue;
      p.timers.forEach(clearTimeout);
      this.published = this.published.filter((x) => x !== p);
      this.log(`"${p.name}" (${p.fq}) is published by ${s.target}:${s.port} already: not published`);
      try {
        p.callback?.(p.type, p.name, p.port, false, `Name conflict: "${p.name}" is published on the network already`);
      } catch {
        // its own error
      }
    }
  }

  private receive(msg: Uint8Array, rinfo: { address: string; port: number }) {
    if (this.asleep) return;
    let m: Message;
    try {
      m = decode(msg);
    } catch {
      return;
    }
    if (m.response) {
      this.conflicts(m);
      this.learn([...m.answers, ...m.additionals]);
    } else this.answer(m, rinfo);
  }

  // ── asleep and awake (the app in the background) ─────────────────

  /** Asleep: our services said goodbye (to come back on waking), lookups paused, the socket closed. */
  suspend() {
    if (this.asleep) return;
    for (const p of this.published) {
      p.timers.forEach(clearTimeout);
      p.timers = [];
      if (p.state === 'published') this.goodbye(p);
      p.state = 'asleep';
    }
    for (const l of this.lookups) clearTimeout(l.timer);
    this.asleep = true;
    if (this.published.length || this.lookups.length) this.log(`asleep: ${this.published.length} service(s) said goodbye, ${this.lookups.length} lookup(s) paused`);
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.closeSoon();
  }

  /**
   * Awake: our services announced again (a failure to their callbacks), the
   * lookups asking again - a service not heard of in a few seconds is gone,
   * as iViewer checks them after a resume.
   */
  async resume() {
    if (!this.asleep) return;
    this.asleep = false;
    if (!this.lookups.length && !this.published.length) return;
    this.log('awake: publishing and looking up again');
    const ok = await this.open();
    if (ok) this.tick();
    for (const p of this.published) {
      const cb = p.callback;
      const answer = (published: boolean, error: string | null) => {
        // back as it was: only a failure is news
        if (!published) {
          this.published = this.published.filter((x) => x !== p);
          try {
            cb?.(p.type, p.name, p.port, false, error);
          } catch {
            // its own error
          }
        }
      };
      if (ok && this.shared) this.announce(p, answer);
      else answer(false, `Bonjour can't publish here: port ${PORT} is taken`);
    }
    const since = Date.now();
    for (const l of this.lookups) {
      l.sent = 0;
      this.query(l);
    }
    setTimeout(() => {
      const changes = new Map<Lookup, { added: FoundService[]; removed: GoneService[] }>();
      for (const l of this.lookups) {
        for (const [key, i] of l.instances) {
          if (i.heardAt >= since) continue;
          l.instances.delete(key);
          if (!i.reported) continue;
          const c = changes.get(l) ?? { added: [], removed: [] };
          c.removed.push({ name: i.name, type: l.type });
          changes.set(l, c);
        }
      }
      this.report(changes);
    }, RECHECK_MS);
  }

  /** Everything stopped (a new GUI): no goodbyes kept for later. */
  dispose() {
    for (const p of this.published) {
      p.timers.forEach(clearTimeout);
      if (p.state === 'published') this.goodbye(p);
    }
    for (const l of this.lookups) clearTimeout(l.timer);
    this.published = [];
    this.lookups = [];
    this.closeSoon();
  }
}

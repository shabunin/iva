/**
 * iva serve on the network: what it serves advertised by mDNS / DNS-SD - an
 * `_iva._tcp` service named after the project, one for each of its sizes when
 * it has several - so the iva panel's settings list them ("Found on the
 * network") and load the one tapped.
 *
 * CF Bonjour's engine (src/runtime/cf/mdns), on Node's sockets: one per
 * address iva serve prints (a LAN, a VPN), pinned to that network, so each
 * answers there with that network's address (RFC 6762 §14) - port 5353
 * shared with the OS's responder (avahi, mDNSResponder) and other iva
 * serves. A one-shot query (the panel's, from a port of its own) is answered
 * by unicast, so the answer gets back over a VPN that carries a multicast
 * query one way only. Its name taken on the network: "Name (2)" on all of
 * them. Goodbyes when it stops.
 */
import dgram from 'node:dgram';
import { Mdns } from '../runtime/cf/mdns/mdns.js';
import { IVA_TYPE } from '../runtime/cf/mdns/served.js';
import type { IUdpSocket } from '../runtime/stdlib/net/types.js';

/** A network it's advertised on: an IPv4 address of this machine and its netmask. */
export interface MdnsNetwork {
  address: string;
  netmask: string;
}

/** A service iva serve advertises: a GUI it serves (a project's size), at its path. */
export interface AdvertisedService {
  /** what tells it from the others: the path it loads ('/', '/1400w1400h/') */
  key: string;
  /** the instance's name: the project's, with its size when it has several ("Name (2)" if it's taken) */
  name: string;
  /** the TXT record's pairs */
  txt: Record<string, string>;
}

export interface AdvertiseOptions {
  services: AdvertisedService[];
  port: number;
  networks: MdnsNetwork[];
  /** this machine's name: the records' host name is <host>-iva-<port>.local */
  host: string;
  /** a UDP socket (default: Node's, port 5353 shared) - a fake network's in the tests */
  createSocket?: () => IUdpSocket;
  log?: (msg: string) => void;
}

export interface Advertised {
  /** a service's instance name now (the next one after a conflict); null: not advertised */
  nameOf(key: string): string | null;
  /**
   * The services now: a new one published, one gone said goodbye to, one
   * changed (its name, its TXT: another build's) published again. Resolves
   * once they're published (or why not is logged).
   */
  set(services: AdvertisedService[]): Promise<void>;
  /** goodbyes sent (TTL 0), the sockets closed */
  close(): Promise<void>;
}

/** a label for a host name: letters, digits and '-' */
export const hostLabel = (s: string) => s.toLowerCase().replace(/\.local\.?$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'iva';

/** how long the engine takes to let go of its socket once the goodbyes are out (its closeSoon) */
const CLOSE_MS = 400;

/** A service as published: its name now ("Name (2)" after a conflict: n 2), whether it's been withdrawn since. */
interface Publication {
  s: AdvertisedService;
  n: number;
  gone: boolean;
}

/**
 * Advertise services on each network while iva serve runs - on one engine a
 * network, their host name and address shared. Resolves once they're
 * published (or why not is logged: no port 5353 to be had, a name that
 * stays taken) - iva serve serves on either way.
 */
export async function advertise(opts: AdvertiseOptions): Promise<Advertised> {
  const log = opts.log ?? (() => {});
  const make = opts.createSocket ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: true }) as unknown as IUdpSocket);
  const hostName = `${hostLabel(opts.host)}-iva-${opts.port}.local`;
  const engines = opts.networks.map((n) => new Mdns({
    network: () => ({ ipv4address: n.address, ipv4netmask: n.netmask }),
    deviceName: () => opts.services[0]?.name ?? 'iva',
    deviceId: () => '',
    hostName: () => hostName,
    pinned: true,
    createSocket: make,
    // its routine (bound, probing, published) said once below for every network
    log: (m) => {
      if (!/^mDNS: (on |publishing |published |stopped publishing )/.test(m)) log(m);
    },
  }));
  /** what's published, by key */
  const live = new Map<string, Publication>();
  let closed = false;
  const own = (p: Publication) => (p.n === 1 ? p.s.name : `${p.s.name} (${p.n})`);

  /** published on every network, or the name's taken on one: the next name, on them all */
  const publish = async (p: Publication): Promise<void> => {
    const name = own(p);
    const results = await Promise.all(engines.map((e) => new Promise<string | null>((resolve) => {
      void e.publish(IVA_TYPE, name, opts.port, p.s.txt, (_t, _n, _p, published, error) => resolve(published ? null : error ?? 'not published'));
    })));
    if (closed || p.gone) return;
    const taken = results.find((r) => r && /conflict/i.test(r));
    if (taken && p.n < 10) {
      for (const e of engines) e.stopPublishing(IVA_TYPE, name, opts.port);
      p.n++;
      log(`mDNS: "${name}" is taken on the network: "${own(p)}"`);
      return publish(p);
    }
    const up = opts.networks.filter((_, i) => !results[i]);
    if (up.length) log(`mDNS: "${name}" (_iva._tcp) on ${up.map((x) => `${x.address}:${opts.port}`).join(', ')}`);
    opts.networks.forEach((x, i) => {
      if (results[i]) log(`mDNS: not on ${x.address}: ${results[i]}`);
    });
  };
  /** a goodbye on every network */
  const withdraw = (p: Publication) => {
    p.gone = true;
    for (const e of engines) e.stopPublishing(IVA_TYPE, own(p), opts.port);
  };
  const set = async (services: AdvertisedService[]) => {
    if (closed) return;
    const keys = new Set(services.map((s) => s.key));
    for (const [key, p] of live) {
      if (keys.has(key)) continue;
      withdraw(p);
      live.delete(key);
    }
    const work: Promise<void>[] = [];
    for (const s of services) {
      const was = live.get(s.key);
      if (was && was.s.name === s.name && JSON.stringify(was.s.txt) === JSON.stringify(s.txt)) continue;
      // the same service another way (another build's sizes): a goodbye, a probe, an announcement - under the name it had
      if (was) withdraw(was);
      const p: Publication = { s, n: was && was.s.name === s.name ? was.n : 1, gone: false };
      live.set(s.key, p);
      work.push(publish(p));
    }
    await Promise.all(work);
  };
  await set(opts.services);

  return {
    nameOf(key) {
      const p = live.get(key);
      return p ? own(p) : null;
    },
    set,
    async close() {
      if (closed) return;
      closed = true;
      for (const e of engines) e.dispose();
      await new Promise((r) => setTimeout(r, CLOSE_MS));
    },
  };
}

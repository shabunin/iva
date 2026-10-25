/**
 * iva serve on the network: what it serves advertised by mDNS / DNS-SD - an
 * `_iva._tcp` service named after the project - so the iva panel's settings
 * list it ("Found on the network") and load it with a tap.
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

export interface AdvertiseOptions {
  /** the instance's name: the project's ("Name (2)" if it's taken) */
  name: string;
  port: number;
  networks: MdnsNetwork[];
  /** the TXT record's pairs */
  txt: Record<string, string>;
  /** this machine's name: the records' host name is <host>-iva-<port>.local */
  host: string;
  /** a UDP socket (default: Node's, port 5353 shared) - a fake network's in the tests */
  createSocket?: () => IUdpSocket;
  log?: (msg: string) => void;
}

export interface Advertised {
  /** the instance's name now (the next one after a conflict) */
  readonly name: string;
  /** the TXT record changed (another build's sizes): published again */
  update(txt: Record<string, string>): void;
  /** goodbyes sent (TTL 0), the sockets closed */
  close(): Promise<void>;
}

/** a label for a host name: letters, digits and '-' */
export const hostLabel = (s: string) => s.toLowerCase().replace(/\.local\.?$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'iva';

/** how long the engine takes to let go of its socket once the goodbyes are out (its closeSoon) */
const CLOSE_MS = 400;

/**
 * Advertise a service on each network while iva serve runs. Resolves once
 * the name is published (or why not is logged: no port 5353 to be had, a
 * name that stays taken) - iva serve serves on either way.
 */
export async function advertise(opts: AdvertiseOptions): Promise<Advertised> {
  const log = opts.log ?? (() => {});
  const make = opts.createSocket ?? (() => dgram.createSocket({ type: 'udp4', reuseAddr: true }) as unknown as IUdpSocket);
  const hostName = `${hostLabel(opts.host)}-iva-${opts.port}.local`;
  const engines = opts.networks.map((n) => new Mdns({
    network: () => ({ ipv4address: n.address, ipv4netmask: n.netmask }),
    deviceName: () => opts.name,
    deviceId: () => '',
    hostName: () => hostName,
    pinned: true,
    createSocket: make,
    // its routine (bound, probing, published) said once below for every network
    log: (m) => {
      if (!/^mDNS: (on |publishing |published |stopped publishing )/.test(m)) log(m);
    },
  }));
  let n = 1;
  let txt = opts.txt;
  let closed = false;
  const own = () => (n === 1 ? opts.name : `${opts.name} (${n})`);

  /** published on every network, or the name's taken on one: the next name, on them all */
  const publish = async (): Promise<void> => {
    const name = own();
    const results = await Promise.all(engines.map((e) => new Promise<string | null>((resolve) => {
      void e.publish(IVA_TYPE, name, opts.port, txt, (_t, _n, _p, published, error) => resolve(published ? null : error ?? 'not published'));
    })));
    if (closed) return;
    const taken = results.find((r) => r && /conflict/i.test(r));
    if (taken && n < 10) {
      for (const e of engines) e.stopPublishing(IVA_TYPE, name, opts.port);
      n++;
      log(`mDNS: "${name}" is taken on the network: "${own()}"`);
      return publish();
    }
    const up = opts.networks.filter((_, i) => !results[i]);
    if (up.length) log(`mDNS: "${name}" (_iva._tcp) on ${up.map((x) => `${x.address}:${opts.port}`).join(', ')}`);
    opts.networks.forEach((x, i) => {
      if (results[i]) log(`mDNS: not on ${x.address}: ${results[i]}`);
    });
  };
  await publish();

  return {
    get name() {
      return own();
    },
    update(next) {
      if (closed || JSON.stringify(next) === JSON.stringify(txt)) return;
      // the same name published again with the new TXT: a goodbye, a probe, an announcement
      for (const e of engines) e.stopPublishing(IVA_TYPE, own(), opts.port);
      txt = next;
      void publish();
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const e of engines) e.dispose();
      await new Promise((r) => setTimeout(r, CLOSE_MS));
    },
  };
}

/**
 * The settings' "Found on the network": the iva serves this device reaches
 * (_iva._tcp, DNS-SD), looked up while the settings are open.
 *
 * CF Bonjour's engine (src/runtime/cf/mdns), one per network of the
 * device's, pinned to it and asking only: one-shot queries from a port of
 * its own on that network's address (RFC 6762 §5.1), which a responder
 * answers by unicast, straight back to that port - over a VPN that takes
 * the query's multicast out (ZeroTier's app on Android does) even where it
 * brings none in. Nothing on port 5353 here, so nothing shared with the
 * GUI's own Bonjour (CF.startLookup) or the OS's responder.
 */
import { Mdns, type FoundService } from '../src/runtime/cf/mdns/mdns';
import { IVA_TYPE, servedInfo, type ServedInfo } from '../src/runtime/cf/mdns/served';
import type { IUdpSocket } from '../src/runtime/stdlib/net/types';

/** A network of the device's to look on: its IPv4 address and netmask (the main one first). */
export interface Network {
  address: string;
  netmask: string;
  name?: string;
}

/** An iva serve found, however many of the device's networks it's found on. */
export interface Served extends ServedInfo {
  /** its host name and port: one iva serve */
  key: string;
  /** the instance's name ("neomorph", "neomorph (2)") */
  name: string;
  /** its host name on the network ("studio-iva-8020.local") */
  hostname: string;
  port: number;
  /** its addresses, those of the device's main network first */
  addresses: string[];
  /** what each address loads (http://<address>:<port><path>), as `addresses` */
  urls: string[];
}

export interface BrowseOptions {
  networks: Network[];
  createSocket(): IUdpSocket;
  /** the list now (found, gone, another address) */
  onChange(list: Served[]): void;
  log?(m: string): void;
}

/** The URL a found iva serve loads at an address of its. */
export const servedUrl = (s: { port: number; path: string }, address: string) => `http://${address}:${s.port}${s.path || '/'}`;

/** Look for iva serves on the device's networks until stop(); onChange has the list each time it changes. */
export function browse(o: BrowseOptions): { stop(): void; list(): Served[] } {
  /** what each network's engine has found, by instance name */
  const found = o.networks.map(() => new Map<string, FoundService>());
  const list = (): Served[] => {
    const all = new Map<string, Served>();
    found.forEach((byName) => {
      for (const f of byName.values()) {
        const key = `${f.hostname.toLowerCase()}:${f.port}`;
        const s = all.get(key) ?? { ...servedInfo(f.data), key, name: f.name, hostname: f.hostname, port: f.port, addresses: [], urls: [] };
        for (const a of f.addresses.filter((x) => !x.includes(':'))) {
          if (s.addresses.includes(a)) continue;
          s.addresses.push(a);
          s.urls.push(servedUrl(s, a));
        }
        all.set(key, s);
      }
    });
    return [...all.values()].filter((s) => s.addresses.length).sort((a, b) => a.name.localeCompare(b.name) || a.host.localeCompare(b.host) || a.port - b.port);
  };
  let last = '';
  const changed = () => {
    const now = list();
    const text = JSON.stringify(now);
    if (text === last) return;
    last = text;
    o.onChange(now);
  };
  const engines = o.networks.map((n, i) => {
    const e = new Mdns({
      network: () => ({ ipv4address: n.address, ipv4netmask: n.netmask }),
      deviceName: () => '',
      deviceId: () => '',
      pinned: true,
      askOnly: true,
      createSocket: o.createSocket,
      log: (m) => o.log?.(`${n.name ?? n.address}: ${m}`),
    });
    void e.lookup(IVA_TYPE, '', (added, removed, error) => {
      if (error) o.log?.(`${n.name ?? n.address}: ${error}`);
      for (const g of removed) found[i].delete(g.name);
      for (const f of added) found[i].set(f.name, f);
      changed();
    });
    return e;
  });
  return {
    list,
    stop() {
      for (const e of engines) e.dispose();
    },
  };
}

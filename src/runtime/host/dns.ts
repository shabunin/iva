import { invoke } from './bridge/tauri-core';
import type { DnsHost, DnsLookupAddress, DnsLookupOptions } from '../stdlib/host';
import { mapHostError } from '../stdlib/errors';

interface DnsAddressWire {
  address: string;
  family: number;
}

export class TauriDnsHost implements DnsHost {
  name = 'TauriDnsHost';

  async lookup(
    hostname: string,
    options: DnsLookupOptions = {}
  ): Promise<DnsLookupAddress | DnsLookupAddress[]> {
    try {
      const result = await invoke<DnsAddressWire | DnsAddressWire[]>('dns_lookup', {
        hostname,
        family: options.family ?? null,
        all: options.all ?? null,
      });

      if (options.all) {
        const list = Array.isArray(result) ? result : [result];
        return list.map((a) => ({ address: a.address, family: a.family }));
      }

      const one = Array.isArray(result) ? result[0] : result;
      return { address: one.address, family: one.family };
    } catch (err) {
      throw mapHostError(err, { syscall: 'getaddrinfo', address: hostname });
    }
  }
}

export function createDnsHost(): DnsHost {
  return new TauriDnsHost();
}

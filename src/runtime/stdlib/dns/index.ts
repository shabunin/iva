import { getHost } from '../host';
import type { DnsLookupAddress, DnsLookupOptions } from '../host';
import { mapHostError } from '../errors';

export type { DnsLookupAddress, DnsLookupOptions };

export type DnsLookupCallback = (
  err: Error | null,
  address: string | DnsLookupAddress[],
  family?: number
) => void;

/**
 * Node-shaped dns.lookup(hostname[, options], callback)
 *
 * - lookup(hostname, callback)
 * - lookup(hostname, family, callback)
 * - lookup(hostname, options, callback)
 */
export function lookup(
  hostname: string,
  optionsOrFamilyOrCb?: DnsLookupOptions | number | DnsLookupCallback,
  maybeCb?: DnsLookupCallback
): void {
  let options: DnsLookupOptions = {};
  let callback: DnsLookupCallback | undefined;

  if (typeof optionsOrFamilyOrCb === 'function') {
    callback = optionsOrFamilyOrCb;
  } else if (typeof optionsOrFamilyOrCb === 'number') {
    options = { family: optionsOrFamilyOrCb };
    callback = maybeCb;
  } else if (optionsOrFamilyOrCb && typeof optionsOrFamilyOrCb === 'object') {
    options = optionsOrFamilyOrCb;
    callback = maybeCb;
  } else {
    callback = maybeCb;
  }

  if (!callback) {
    throw new TypeError('dns.lookup requires a callback');
  }

  const host = getHost();
  if (!host?.dns) {
    queueMicrotask(() => {
      const err = mapHostError(
        'dns.lookup: no DnsHost installed (need installStdlib with Tauri host)',
        { syscall: 'getaddrinfo', address: hostname }
      );
      err.code = 'ENOTFOUND';
      callback!(err, '', 0);
    });
    return;
  }

  host.dns
    .lookup(hostname, options)
    .then((result) => {
      if (options.all) {
        const list = Array.isArray(result) ? result : [result];
        callback!(null, list);
      } else {
        const one = Array.isArray(result) ? result[0] : result;
        callback!(null, one.address, one.family);
      }
    })
    .catch((err) => {
      const mapped = mapHostError(err, { syscall: 'getaddrinfo', address: hostname });
      if (!mapped.code) mapped.code = 'ENOTFOUND';
      callback!(mapped, options.all ? [] : '', 0);
    });
}

/** Promise helper (convenience; not classic Node dns). */
export function lookupAsync(
  hostname: string,
  options: DnsLookupOptions = {}
): Promise<DnsLookupAddress | DnsLookupAddress[]> {
  return new Promise((resolve, reject) => {
    lookup(hostname, options, (err, address, family) => {
      if (err) reject(err);
      else if (options.all) resolve(address as DnsLookupAddress[]);
      else resolve({ address: address as string, family: family ?? 0 });
    });
  });
}

const dns = {
  lookup,
  lookupAsync,
};

export default dns;

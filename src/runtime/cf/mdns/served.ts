/**
 * iva serve on the network: the DNS-SD service (RFC 6763) it advertises so
 * the iva panel's settings find it - `_iva._tcp`, an instance per GUI it
 * serves, named after the project (and the size, for a project in several:
 * each size at a path of its own), its TXT record what the panel shows and
 * loads.
 * Both ends run the Bonjour engine (mdns.ts): iva serve publishes it
 * (src/server/mdns.ts), the panel's settings look it up (panel/discover.ts).
 */

/** iva serve's service type, as a script names one */
export const IVA_TYPE = '_iva._tcp.';

/** What iva serve says of what it serves (its TXT record). */
export interface ServedInfo {
  /** the path to load: '/', another size's '/1400w1400h/' */
  path: string;
  /** iva's version */
  version: string;
  /** the project's name (the instance's own, before a name taken made it "Name (2)") */
  project: string;
  /** a JSX project, a .gui, a folder of GUIs (its '/' a page listing them) */
  kind: 'project' | 'gui' | 'folder';
  /** the size at that path ('1400x1400@3x'); an older iva serve's: every size, the one at '/' first */
  sizes: string[];
  /** the machine's host name */
  host: string;
}

/** A value no longer than a TXT string holds with its key (255 bytes), cut at a character. */
function short(key: string, value: string): string {
  const room = 255 - key.length - 1;
  const enc = new TextEncoder();
  if (enc.encode(value).length <= room) return value;
  let out = '';
  for (const ch of value) {
    if (enc.encode(out + ch).length > room) break;
    out += ch;
  }
  return out;
}

/** The TXT record's pairs: txtvers first (RFC 6763 §6.7), keys of nine letters at most, an empty value left out. */
export function servedTxt(i: ServedInfo): Record<string, string> {
  const pairs: [string, string][] = [
    ['txtvers', '1'],
    ['path', i.path || '/'],
    ['iva', i.version],
    ['name', i.project],
    ['kind', i.kind],
    ['sizes', i.sizes.join(',')],
    ['host', i.host],
  ];
  return Object.fromEntries(pairs.filter(([, v]) => v).map(([k, v]) => [k, short(k, v)]));
}

/** A found service's TXT data as ServedInfo; what's missing: '/' for the path, '' else. */
export function servedInfo(d: Record<string, string>): ServedInfo {
  const kind = d.kind === 'gui' || d.kind === 'folder' ? d.kind : 'project';
  return {
    path: d.path?.startsWith('/') ? d.path : `/${d.path ?? ''}`,
    version: d.iva ?? '',
    project: d.name ?? '',
    kind,
    sizes: (d.sizes ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    host: d.host ?? '',
  };
}

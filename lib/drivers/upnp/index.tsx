/**
 * iva/drivers/upnp - a UPnP AV control point for iViewer panels.
 *
 *   import { Upnp } from 'iva/drivers/upnp';
 *   <Upnp servers={{ list: l('servers') }} renderers={{ list: l('renderers') }}
 *         browse={{ list: l('browse'), path: s('path'), up: d('up') }}
 *         transport={{ play: d('play'), pause: d('pause'), stop: d('stop'), state: s('state'), title: s('title') }}
 *         volume={{ level: a('volume'), mute: d('mute') }} status={s('upnpStatus')} />
 *
 * The component brings what it needs: a UDP <System> for SSDP (M-SEARCH
 * out, replies and NOTIFYs in through one catch-all <Feedback>), a second
 * one listening on port 1900 for the NOTIFYs devices multicast, the panel
 * script (iva-upnp.js, once) and its <OnStart> line. Media servers and
 * renderers found go into the two lists; a tap on a server browses its
 * root into the browse list (folders and tracks), a tap on a folder goes
 * in, a tap on a track plays it on the selected renderer (and queues the
 * next one). Descriptions and SOAP actions go over CF.request. The
 * renderer's state is polled while one is selected. A modern take on
 * cf-upnp-cp (2013, iViewer 4).
 */

import { Feedback, OnStart, Script, System, a, d, l, s, type Join, type JoinRef, type JoinType, type VNode } from 'iva';
import { UPNP_RUNTIME } from './runtime.js';

/** A list of devices (servers or renderers). Row joins: s1 name, s2 model, s3 icon URL, d1 selected. */
export interface UpnpDeviceList {
  /** list join */
  list: Join;
  /** serial join: the selected device's name */
  selected?: Join;
  /** the row subpage CF.listAdd names (default: the list's own item subpage) */
  row?: string;
}
/** The browse list. Row joins: s1 title, s2 subtitle (items: artist - album, or the duration; folders: the count), s3 art or icon, d1 the item playing. */
export interface UpnpBrowse {
  /** list join */
  list: Join;
  /** serial join: where we are ("Server / Music / Albums") */
  path?: Join;
  /** digital join: a level up */
  up?: Join;
  /** digital join: the folder browsed again */
  refresh?: Join;
  /** row subpages: one for folders, one for items (default: the list's own item subpage) */
  rows?: { container?: string; item?: string };
  /** what s3 shows for an item without album art, by kind: an image file (in assets) or URL */
  icons?: { container?: string; audio?: string; video?: string; image?: string; other?: string };
  /** items a Browse asks for at a time (default 100; the rest follow) */
  pageSize?: number;
}
/** The transport: digital joins for the buttons, serial / analog joins the driver fills. */
export interface UpnpTransport {
  play?: Join;
  pause?: Join;
  stop?: Join;
  next?: Join;
  previous?: Join;
  /** serial: Playing, Paused, Stopped, Loading, No media, No renderer, Unreachable */
  state?: Join;
  title?: Join;
  artist?: Join;
  album?: Join;
  /** serial: the album art's URL (an <Image join>) */
  art?: Join;
  /** analog: 0..65535 over the track (a slider: dragged, it seeks) */
  position?: Join;
  /** serial: m:ss */
  elapsed?: Join;
  duration?: Join;
}
export interface UpnpVolume {
  /** analog: 0..65535 for 0..100 (a slider: dragged, SetVolume) */
  level?: Join;
  /** digital: a toggle, SetMute */
  mute?: Join;
}
export interface UpnpProps {
  /** names the driver's systems (default 'upnp': upnp_ssdp, upnp_notify) */
  name?: string;
  /** devices given by their description URL, for networks where multicast fails */
  devices?: string[];
  /**
   * SSDP: the multicast address and port (239.255.255.250:1900), the search
   * socket's own port (localPort, default 4023, as cf-upnp-cp had it: M-SEARCH
   * replies come back to it) and whether a second system listens on 1900 for
   * NOTIFYs (default true; iva's runtime joins the group there), mx seconds.
   */
  ssdp?: { host?: string; port?: number; localPort?: number; notify?: boolean; mx?: number };
  /** M-SEARCH ssdp:all (everything on the network, filtered here) instead of MediaServer:1 and MediaRenderer:1 */
  searchAll?: boolean;
  /** seconds between searches (default 300; 0: at the start only, and on the search join) */
  searchEvery?: number;
  /** digital join: search again */
  search?: Join;
  /** ms between polls of the renderer's state while one is selected (default 1000) */
  pollEvery?: number;
  servers?: UpnpDeviceList;
  renderers?: UpnpDeviceList;
  browse?: UpnpBrowse;
  transport?: UpnpTransport;
  volume?: UpnpVolume;
  /** serial join: what's going on (how many devices, errors) */
  status?: Join;
}

export const SSDP_HOST = '239.255.255.250';
export const SSDP_PORT = 1900;
/** the search socket's own port, as the old project had it */
export const SEARCH_PORT = 4023;

/** A join as a JavaScript expression ("d12", or Joins.d.name for a named one). */
function jsJoin(type: JoinType, j: Join): string {
  if (typeof j === 'number') return JSON.stringify(type + j);
  if (typeof j === 'string') return /^\d+$/.test(j) ? JSON.stringify(type + j) : `Joins.${type}[${JSON.stringify(j)}]`;
  return typeof j.id === 'number' ? JSON.stringify(`${j.type}${j.id}`) : `Joins.${j.type}[${JSON.stringify(j.id)}]`;
}
/** a join as a reference the build numbers (a name of that type) */
function ref(type: JoinType, j: Join): JoinRef | null {
  if (typeof j === 'object') return j;
  if (typeof j === 'number' || /^\d+$/.test(j)) return null;
  return { d, a, s, l }[type](j);
}

/** the types of the joins the driver takes, by the prop they're under */
const TYPES = {
  servers: { list: 'l', selected: 's' },
  renderers: { list: 'l', selected: 's' },
  browse: { list: 'l', path: 's', up: 'd', refresh: 'd' },
  transport: { play: 'd', pause: 'd', stop: 'd', next: 'd', previous: 'd', state: 's', title: 's', artist: 's', album: 's', art: 's', position: 'a', elapsed: 's', duration: 's' },
  volume: { level: 'a', mute: 'd' },
} as const satisfies Record<string, Record<string, JoinType>>;

/**
 * The setup line's argument: joins as JavaScript expressions, the rest as
 * JSON; and the joins given, for <OnStart joins> (so a join no element has
 * still gets a number).
 */
function setup(p: UpnpProps, system: string, feedback: string, host: string, port: number, mx: number): { js: string; joins: JoinRef[] } {
  const joins: JoinRef[] = [];
  const join = (type: JoinType, j: Join | undefined): string | undefined => {
    if (j === undefined) return undefined;
    const r = ref(type, j);
    if (r) joins.push(r);
    return jsJoin(type, j);
  };
  const section = <K extends keyof typeof TYPES>(key: K, given: object | undefined): string | undefined => {
    if (!given) return undefined;
    const parts: string[] = [];
    for (const [k, type] of Object.entries(TYPES[key]) as [string, JoinType][]) {
      const expr = join(type, (given as Record<string, Join | undefined>)[k]);
      if (expr !== undefined) parts.push(`${k}: ${expr}`);
    }
    return `{ ${parts.join(', ')} }`;
  };
  const b = p.browse;
  const rows = { server: p.servers?.row, renderer: p.renderers?.row, container: b?.rows?.container, item: b?.rows?.item };
  const fields: [string, string | undefined][] = [
    ['system', JSON.stringify(system)],
    ['feedback', JSON.stringify(feedback)],
    ['host', JSON.stringify(host)],
    ['port', String(port)],
    ['mx', String(mx)],
    ['devices', JSON.stringify(p.devices ?? [])],
    ['searchAll', p.searchAll ? 'true' : undefined],
    ['searchEvery', String(p.searchEvery ?? 300)],
    ['pageSize', b?.pageSize !== undefined ? String(b.pageSize) : undefined],
    ['pollEvery', p.pollEvery !== undefined ? String(p.pollEvery) : undefined],
    ['search', join('d', p.search)],
    ['status', join('s', p.status)],
    ['rows', JSON.stringify(Object.fromEntries(Object.entries(rows).filter(([, v]) => v !== undefined)))],
    ['icons', JSON.stringify(b?.icons ?? {})],
    ['servers', section('servers', p.servers)],
    ['renderers', section('renderers', p.renderers)],
    ['browse', section('browse', p.browse)],
    ['transport', section('transport', p.transport)],
    ['volume', section('volume', p.volume)],
  ];
  return { js: `{ ${fields.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}: ${v}`).join(', ')} }`, joins };
}

/** the UPnP driver's script, as a <Script> (once in a build) */
export const runtime: VNode = <Script name="iva-upnp.js" code={UPNP_RUNTIME} />;

export function Upnp(p: UpnpProps): VNode {
  const name = p.name ?? 'upnp';
  if (!/^[A-Za-z_]\w*$/.test(name)) throw new Error(`Upnp: name "${name}" - letters, digits and _ (it names the systems)`);
  for (const key of ['servers', 'renderers', 'browse'] as const) {
    if (p[key] && p[key]!.list === undefined) throw new Error(`Upnp: ${key} needs a list join`);
  }
  for (const url of p.devices ?? []) {
    if (!/^https?:\/\//i.test(url)) throw new Error(`Upnp: devices: "${url}" isn't a description URL (http://host:port/desc.xml)`);
  }
  const host = p.ssdp?.host ?? SSDP_HOST;
  const port = p.ssdp?.port ?? SSDP_PORT;
  const localPort = p.ssdp?.localPort ?? SEARCH_PORT;
  const notify = p.ssdp?.notify ?? true;
  const mx = p.ssdp?.mx ?? 2;
  const system = `${name}_ssdp`;
  const { js, joins } = setup(p, system, 'ssdp', host, port, mx);
  return (
    <>
      {/* M-SEARCH goes out of here; replies come back to its port. The feedback hands every packet to the script. */}
      <System name={system} host={host} port={port} protocol="udp" localPort={localPort} accept acceptBroadcasts offlineQueue>
        <Feedback name="ssdp" regex="(.*)" />
      </System>
      {/* NOTIFYs are multicast to port 1900: a socket there hears alive / byebye (iva's runtime joins the group; official iViewer isn't known to) */}
      {notify && (
        <System name={`${name}_notify`} host={host} port={port} protocol="udp" localPort={port} accept acceptBroadcasts>
          <Feedback name="ssdp" regex="(.*)" />
        </System>
      )}
      {runtime}
      <OnStart js={`IvaUpnp.start(${js});${notify ? ` IvaUpnp.listen(${JSON.stringify(`${name}_notify`)}, "ssdp");` : ''}`} joins={joins} />
    </>
  );
}

export default Upnp;

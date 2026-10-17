/**
 * iva/drivers/matter - Matter devices from the panel, with matter.js over a
 * pool of UDP systems. Works in official iViewer as well as in iva's own
 * runtime: a <System protocol="udp"> a peer (Matter sessions are per peer,
 * and a node answers to the address and port a request came from),
 * retargeted with CF.setSystemProperties before any session exists;
 * CF.send with a byte a char; a catch-all <Feedback> for what comes;
 * CF.startLookup for DNS-SD; persisted tokens for what the controller
 * keeps (its fabric, the nodes). The component brings it all: the systems,
 * the tokens, the script (matter.js and the adapter, bundled by iva -
 * iva-matter.js, once) and the <OnStart> that starts it.
 *
 *   import { Matter } from 'iva/drivers/matter';
 *   <Matter slots={10} devices={{ lamp: { node: '1', cluster: 'OnOff', join: d('lamp') } }}
 *           commission={{ code: s('setupCode'), go: d('commission'), status: s('matterStatus') }} found={s('matterFound')} />
 *
 * Docs: docs/drivers.md.
 */

import { Feedback, OnStart, Script, System, Token, a, d, s, type Join, type JoinRef, type VNode } from 'iva';
import { jsJoin } from '../../ui/index.js';

export type MatterCluster = 'OnOff' | 'LevelControl' | 'ColorControl';

export interface MatterDevice {
  /** where the node is, when Bonjour can't find it (its operational address; port default 5540) */
  address?: string;
  port?: number;
  /** the node id the controller gave it when commissioning (the status join shows it) */
  node: number | string;
  /** the endpoint the cluster is on (default 1) */
  endpoint?: number;
  cluster: MatterCluster;
  /** OnOff: a digital join (on / off, both ways); LevelControl: an analog one (0..65535 for level 0..254) */
  join?: Join;
  /** ColorControl: analog joins, 0..65535 for 0..254 */
  hue?: Join;
  saturation?: Join;
}

export interface MatterProps {
  /** UDP systems in the pool: a peer each (default 10) */
  slots?: number;
  /** the first slot's local port; the next ones follow (default 5550) */
  port?: number;
  /** the devices, by name */
  devices?: Record<string, MatterDevice>;
  /** commissioning: the setup code (serial), Go (digital, momentary), what the controller says (serial); `address` (serial): where the device is, when Bonjour can't find it */
  commission?: { code: Join; go: Join; status?: Join; address?: Join };
  /** serial join: the devices Bonjour finds, as JSON rows { name, kind, where, info, slot } for a DataTable */
  found?: Join;
  /** the controller's name in the devices' fabrics (default 'iva') */
  label?: string;
  /** IPv6 addresses too (default false: a UDP system to an IPv6 address is the probe's to tell) */
  ipv6?: boolean;
  /** matter.js's log level in CF.log: debug, info (default), notice, warn, error */
  log?: string;
  /** the persisted tokens the controller's storage goes to: <prefix>0..<chunks-1>, `size` chars each (default matter_store_, 8, 32768) */
  store?: { prefix?: string; chunks?: number; size?: number };
  /** the systems' text encoding: a byte a char (default iso-8859-1, GUI Designer's; '' for none) */
  textEncoding?: string;
}

const ref = (type: 'd' | 'a' | 's', j: Join): JoinRef => (typeof j === 'object' ? j : type === 'd' ? d(j) : type === 'a' ? a(j) : s(j));

/** the start line's device: a JS object literal with its joins as Joins.* references */
function deviceJs(dv: MatterDevice, joins: JoinRef[]): string {
  const parts: string[] = [];
  if (dv.address !== undefined) parts.push(`address: ${JSON.stringify(dv.address)}`);
  if (dv.port !== undefined) parts.push(`port: ${dv.port}`);
  parts.push(`node: ${JSON.stringify(String(dv.node))}`);
  if (dv.endpoint !== undefined) parts.push(`endpoint: ${dv.endpoint}`);
  parts.push(`cluster: ${JSON.stringify(dv.cluster)}`);
  const joinType = dv.cluster === 'OnOff' ? 'd' : 'a';
  if (dv.join !== undefined) {
    parts.push(`join: ${jsJoin(joinType, dv.join)}`);
    joins.push(ref(joinType, dv.join));
  }
  if (dv.hue !== undefined) {
    parts.push(`hue: ${jsJoin('a', dv.hue)}`);
    joins.push(ref('a', dv.hue));
  }
  if (dv.saturation !== undefined) {
    parts.push(`saturation: ${jsJoin('a', dv.saturation)}`);
    joins.push(ref('a', dv.saturation));
  }
  return `{ ${parts.join(', ')} }`;
}

/** The Matter driver: its systems, tokens, script and start, from where it's placed (a page, a component). */
export function Matter({ slots = 10, port = 5550, devices = {}, commission, found, label = 'iva', ipv6 = false, log, store = {}, textEncoding = 'iso-8859-1' }: MatterProps): VNode {
  if (!Number.isInteger(slots) || slots < 1 || slots > 64) throw new Error(`<Matter slots>: 1 to 64 (got ${slots})`);
  const names = Array.from({ length: slots }, (_, i) => `matter${i}`);
  const prefix = store.prefix ?? 'matter_store_';
  const chunks = store.chunks ?? 8;
  const size = store.size ?? 32768;
  const joins: JoinRef[] = [];
  const devJs = Object.entries(devices).map(([name, dv]) => `${JSON.stringify(name)}: ${deviceJs(dv, joins)}`);
  const parts = [`slots: ${slots}`, `port: ${port}`, `label: ${JSON.stringify(label)}`, `ipv6: ${ipv6}`];
  if (log) parts.push(`log: ${JSON.stringify(log)}`);
  parts.push(`store: { prefix: ${JSON.stringify(prefix)}, chunks: ${chunks}, size: ${size} }`);
  parts.push(`devices: { ${devJs.join(', ')} }`);
  if (commission) {
    const c = [`code: ${jsJoin('s', commission.code)}`, `go: ${jsJoin('d', commission.go)}`];
    joins.push(ref('s', commission.code), ref('d', commission.go));
    if (commission.status !== undefined) {
      c.push(`status: ${jsJoin('s', commission.status)}`);
      joins.push(ref('s', commission.status));
    }
    if (commission.address !== undefined) {
      c.push(`address: ${jsJoin('s', commission.address)}`);
      joins.push(ref('s', commission.address));
    }
    parts.push(`commission: { ${c.join(', ')} }`);
  }
  if (found !== undefined) {
    parts.push(`found: ${jsJoin('s', found)}`);
    joins.push(ref('s', found));
  }
  return (
    <>
      {/* the pool: a peer each, retargeted by the driver; till then nobody (the device itself, a port nobody answers on).
          offlineQueue: what's sent while a retargeted system binds its socket again waits for it */}
      {names.map((name, i) => (
        <System name={name} protocol="udp" host="127.0.0.2" port={5540} localPort={port + i} accept offlineQueue textEncoding={textEncoding}>
          <Feedback name="frame" regex="(?s)(.+)" />
        </System>
      ))}
      {Array.from({ length: chunks }, (_, i) => <Token name={`${prefix}${i}`} persist />)}
      <Script name="iva-matter.js" entry="./runtime/main.ts" />
      <OnStart js={`IvaMatter.start({ ${parts.join(', ')} });`} joins={joins} />
    </>
  );
}

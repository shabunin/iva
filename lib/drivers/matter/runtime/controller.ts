/**
 * The driver: a matter.js CommissioningController on the panel's environment,
 * the devices of app.jsx bound to joins (a subscription sets the join; the
 * join's change sends the command), commissioning from a setup code, what
 * Bonjour finds in a serial join as JSON for a table.
 */

import { Seconds, type Environment } from '@matter/general';
import { getOperationalDeviceQname } from '@matter/protocol';
import { ManualPairingCodeCodec, NodeId, QrPairingCodeCodec } from '@matter/types';
import { ColorControl, GeneralCommissioning, LevelControl, OnOff } from '@matter/types/clusters';
import { CommissioningController } from '@project-chip/matter.js';
import type { PairedNode } from '@project-chip/matter.js/device';
import type { CF } from './cf.js';
import { createEnvironment, type MatterEnvironment } from './environment.js';
import type { Found } from './mdns.js';
import type { TokenStoreOptions } from './storage.js';

export type Cluster = 'OnOff' | 'LevelControl' | 'ColorControl';

export interface DeviceSpec {
  /** where the node is, when Bonjour can't tell (its operational address) */
  address?: string;
  port?: number;
  /** the node id the controller gave it when commissioning (the status line shows it) */
  node: number | string;
  /** the endpoint (default 1) */
  endpoint?: number;
  cluster: Cluster;
  /** OnOff: a digital join; LevelControl: an analog one (0..65535 for 0..254) */
  join?: string;
  /** ColorControl: analog joins (0..65535 for 0..254) */
  hue?: string;
  saturation?: string;
}

export interface StartOptions {
  slots?: number;
  /** the first slot's local port (the next ones follow) */
  port?: number;
  /** the controller's name in the fabric */
  label?: string;
  ipv6?: boolean;
  log?: string;
  devices?: Record<string, DeviceSpec>;
  commission?: { code: string; go: string; status?: string };
  /** serial join: the devices found, as JSON rows */
  found?: string;
  store?: Partial<TokenStoreOptions>;
}

export interface FoundRow {
  name: string;
  kind: string;
  where: string;
  info: string;
  slot: string;
}

const NODE_LABEL = 32;

/** a join's analog value (0..65535) as a cluster's 0..254, and back */
const toLevel = (v: number): number => Math.max(0, Math.min(254, Math.round((v / 65535) * 254)));
const fromLevel = (level: number): number => Math.round((Math.max(0, Math.min(254, level)) / 254) * 65535);

export class MatterDriver {
  readonly options: Required<Pick<StartOptions, 'slots' | 'port' | 'label' | 'ipv6'>> & StartOptions;
  readonly me: MatterEnvironment;
  controller?: CommissioningController;
  /** what the joins were last set to by the driver: the change event that echoes it isn't a command */
  private written = new Map<string, string>();
  private nodes = new Map<string, PairedNode>();
  private stopped = false;

  constructor(private cf: CF, options: StartOptions) {
    const slots = options.slots ?? 10;
    const port = options.port ?? 5550;
    this.options = { ...options, slots, port, label: (options.label ?? 'iva').slice(0, NODE_LABEL), ipv6: options.ipv6 ?? false };
    const names = Array.from({ length: slots }, (_, i) => `matter${i}`);
    this.me = createEnvironment(cf, {
      slots: names, localPorts: names.map((_, i) => port + i), ipv6: this.options.ipv6, log: options.log,
      store: { prefix: options.store?.prefix ?? 'matter_store_', chunks: options.store?.chunks ?? 8, size: options.store?.size ?? 32768 },
    });
  }

  get env(): Environment {
    return this.me.env;
  }

  status(text: string): void {
    this.me.log(text);
    if (this.options.commission?.status) this.setJoin(this.options.commission.status, text);
  }

  private setJoin(join: string, value: string | number): void {
    this.written.set(join, String(value));
    this.cf.setJoin(join, value);
  }

  /** the controller up (its storage read), the devices bound, the found table kept */
  async start(): Promise<void> {
    this.me.mdns.changed.on(() => this.foundTable());
    if (this.options.found) this.foundTable();
    // what Bonjour finds, from the start
    this.me.mdns.lookup('_matter._tcp.');
    this.me.mdns.lookup('_matterc._udp.');
    this.status('Starting the controller…');
    try {
      this.controller = new CommissioningController({
        environment: { environment: this.env, id: 'iva' },
        adminFabricLabel: this.options.label,
        autoConnect: false,
        localPort: this.options.port,
      });
      await this.controller.start();
    } catch (e) {
      this.status(`The controller failed to start: ${(e as Error)?.message ?? e}`);
      this.me.log(String((e as Error)?.stack ?? e));
      return;
    }
    const nodes = this.controller.getCommissionedNodes();
    this.status(`Controller up: ${nodes.length} node(s) commissioned${nodes.length ? ' (' + nodes.map((n) => n.toString()).join(', ') + ')' : ''}`);
    if (this.options.commission) this.watchCommission(this.options.commission);
    for (const [name, spec] of Object.entries(this.options.devices ?? {})) {
      void this.bindDevice(name, spec).catch((e) => this.me.log(`${name}: ${(e as Error)?.message ?? e}`));
    }
    this.foundTable();
  }

  /** the node of a device (connected once), its cluster on the device's joins */
  private async bindDevice(name: string, spec: DeviceSpec): Promise<void> {
    const controller = this.controller!;
    const nodeId = NodeId(BigInt(spec.node));
    if (!controller.isNodeCommissioned(nodeId)) {
      this.me.log(`${name}: node ${spec.node} is not commissioned here (Commission it, then put the node id the status shows in app.jsx)`);
      return;
    }
    if (spec.address) {
      // known by address: as Bonjour would have found it (its name is the fabric's id and its own)
      const qname = getOperationalDeviceQname(controller.fabric.globalId, nodeId);
      const instance = qname.replace(/\._matter\._tcp\.local$/i, '');
      const f: Found = { kind: 'operational', name: instance, hostname: `${instance}.local`, addresses: [spec.address], port: spec.port ?? 5540, data: {} };
      this.me.mdns.announce(f);
    }
    const key = String(nodeId);
    let node = this.nodes.get(key);
    if (!node) {
      node = await controller.getNode(nodeId);
      this.nodes.set(key, node);
      node.events.stateChanged.on((state) => this.me.log(`node ${spec.node}: ${['connected', 'disconnected', 'reconnecting', 'waiting for device', 'structure changed', 'decommissioned'][state] ?? state}`));
      node.connect();
    }
    const bind = () => {
      try {
        this.bindCluster(name, spec, node!);
      } catch (e) {
        this.me.log(`${name}: ${(e as Error)?.message ?? e}`);
      }
    };
    if (node.initialized) bind();
    else node.events.initialized.once(() => bind());
  }

  private bindCluster(name: string, spec: DeviceSpec, node: PairedNode): void {
    const endpoint = node.getDeviceById(spec.endpoint ?? 1);
    if (!endpoint) throw new Error(`no endpoint ${spec.endpoint ?? 1} on node ${spec.node}`);
    const say = (what: string) => this.me.log(`${name}: ${what}`);
    const watch = (join: string | undefined, onChange: (value: number) => Promise<unknown>) => {
      if (!join) return;
      this.cf.watch(this.cf.JoinChangeEvent, join, (j: string, v: string) => {
        if (this.written.get(j) === String(v)) return;
        onChange(Number(v) || 0).catch((e) => say(`command failed: ${(e as Error)?.message ?? e}`));
      });
    };
    if (spec.cluster === 'OnOff') {
      const c = endpoint.getClusterClient(OnOff.Complete);
      if (!c) throw new Error(`no OnOff cluster on endpoint ${spec.endpoint ?? 1}`);
      c.addOnOffAttributeListener((on) => this.setJoin(spec.join!, on ? 1 : 0));
      void c.getOnOffAttribute().then((on) => this.setJoin(spec.join!, on ? 1 : 0)).catch(() => {});
      watch(spec.join, (v) => (v ? c.on() : c.off()));
      say('OnOff bound');
    } else if (spec.cluster === 'LevelControl') {
      const c = endpoint.getClusterClient(LevelControl.Complete);
      if (!c) throw new Error(`no LevelControl cluster on endpoint ${spec.endpoint ?? 1}`);
      c.addCurrentLevelAttributeListener((level) => level !== null && this.setJoin(spec.join!, fromLevel(level)));
      void c.getCurrentLevelAttribute().then((level) => level !== null && level !== undefined && this.setJoin(spec.join!, fromLevel(level))).catch(() => {});
      watch(spec.join, (v) => c.moveToLevelWithOnOff({ level: toLevel(v), transitionTime: 0, optionsMask: {}, optionsOverride: {} }));
      say('LevelControl bound');
    } else if (spec.cluster === 'ColorControl') {
      const c = endpoint.getClusterClient(ColorControl.Complete);
      if (!c) throw new Error(`no ColorControl cluster on endpoint ${spec.endpoint ?? 1}`);
      let hue = 0;
      let sat = 0;
      c.addCurrentHueAttributeListener((h) => {
        hue = h;
        if (spec.hue) this.setJoin(spec.hue, fromLevel(h));
      });
      c.addCurrentSaturationAttributeListener((s) => {
        sat = s;
        if (spec.saturation) this.setJoin(spec.saturation, fromLevel(s));
      });
      const move = () => c.moveToHueAndSaturation({ hue, saturation: sat, transitionTime: 0, optionsMask: {}, optionsOverride: {} });
      watch(spec.hue, (v) => {
        hue = toLevel(v);
        return move();
      });
      watch(spec.saturation, (v) => {
        sat = toLevel(v);
        return move();
      });
      say('ColorControl bound');
    } else {
      throw new Error(`cluster ${String(spec.cluster)}: OnOff, LevelControl or ColorControl`);
    }
  }

  private watchCommission(c: NonNullable<StartOptions['commission']>): void {
    this.cf.watch(this.cf.JoinChangeEvent, c.go, (_j: string, v: string) => {
      if (String(v) !== '1') return;
      this.cf.getJoin(c.code, (_jj, code) => {
        void this.commission(String(code ?? '').trim());
      });
    });
  }

  /** a device commissioned from its setup code: the 11 (or 21) digits, or the QR code's MT: text */
  async commission(code: string): Promise<NodeId | undefined> {
    if (!this.controller) {
      this.status('The controller is not up');
      return undefined;
    }
    let passcode: number;
    let identifierData: { longDiscriminator: number } | { shortDiscriminator: number } | Record<string, never>;
    try {
      if (/^MT:/i.test(code)) {
        const qr = QrPairingCodeCodec.decode(code)[0];
        passcode = qr.passcode;
        identifierData = { longDiscriminator: qr.discriminator };
      } else {
        const digits = code.replace(/[^\d]/g, '');
        if (digits.length !== 11 && digits.length !== 21) throw new Error('a setup code has 11 digits (or 21), or starts with MT:');
        const m = ManualPairingCodeCodec.decode(digits);
        passcode = m.passcode;
        identifierData = m.discriminator !== undefined ? { longDiscriminator: m.discriminator } : m.shortDiscriminator !== undefined ? { shortDiscriminator: m.shortDiscriminator } : {};
      }
    } catch (e) {
      this.status(`Not a setup code: ${(e as Error)?.message ?? e}`);
      return undefined;
    }
    this.status(`Looking for the device (${'longDiscriminator' in identifierData ? `discriminator ${identifierData.longDiscriminator}` : 'shortDiscriminator' in identifierData ? `short discriminator ${identifierData.shortDiscriminator}` : 'any'})…`);
    try {
      const nodeId = await this.controller.commissionNode({
        commissioning: { regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor, regulatoryCountryCode: 'XX' },
        discovery: { identifierData, discoveryCapabilities: { onIpNetwork: true }, timeout: Seconds(90) },
        passcode,
      }, { connectNodeAfterCommissioning: false });
      this.status(`Commissioned: node ${nodeId.toString()} - put node: "${nodeId.toString()}" in <Matter devices> (app.jsx)`);
      this.foundTable();
      return nodeId;
    } catch (e) {
      this.status(`Commissioning failed: ${(e as Error)?.message ?? e}`);
      this.me.log(String((e as Error)?.stack ?? e));
      return undefined;
    }
  }

  /** what Bonjour found, each with its slot, as rows for a table */
  foundRows(): FoundRow[] {
    const commissioned = new Set((this.controller?.getCommissionedNodes() ?? []).map((n) => n.toString(16).toUpperCase().padStart(16, '0')));
    return this.me.mdns.all().map((f) => {
      const ip = f.addresses.find((a) => !a.includes(':')) ?? f.addresses[0] ?? f.hostname;
      const slot = this.me.pool.slotOf(ip, f.port);
      const mine = f.kind === 'operational' && commissioned.has(f.name.split('-')[1] ?? '');
      const info = Object.entries(f.data).map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join(' ');
      return { name: f.data.DN ? `${f.data.DN} (${f.name})` : f.name, kind: f.kind === 'operational' ? (mine ? 'node of ours' : 'operational') : 'commissionable', where: `${ip}:${f.port}`, info, slot: slot ? slot.name : '' };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  foundTable(): void {
    if (this.options.found) this.setJoin(this.options.found, JSON.stringify(this.foundRows()));
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await this.controller?.close();
    this.controller = undefined;
  }
}

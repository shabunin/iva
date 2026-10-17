/**
 * matter.js's Network over the slot pool: one virtual UDP socket (two, as
 * matter.js opens one for IPv6 and one for IPv4 - both the same pool), no
 * multicast (DNS-SD comes from CF.startLookup, mdns.ts), the device's
 * address and MAC from CF.
 */

import {
  Bytes, ChannelType, InterfaceType, MAX_UDP_MESSAGE_SIZE, Network, NetworkError,
  type NetworkInterface, type NetworkInterfaceDetails, type Transport, type UdpSocket, type UdpSocketOptions,
} from '@matter/general';
import type { CF } from './cf.js';
import type { SlotPool } from './slots.js';

export const INTERFACE = 'cf';

export class CfUdpSocket implements UdpSocket {
  readonly maxPayloadSize = MAX_UDP_MESSAGE_SIZE;

  constructor(private pool: SlotPool, private type: UdpSocketOptions['type'], private ipv6: boolean, private listeningPort: number) {}

  get port(): number {
    return this.listeningPort;
  }

  supports(type: ChannelType, address?: string): boolean {
    if (type !== ChannelType.UDP) return false;
    if (address === undefined) return true;
    const v6 = address.includes(':');
    if (this.type === 'udp6') return v6 && this.ipv6;
    if (this.type === 'udp4') return !v6;
    return !v6 || this.ipv6;
  }

  addMembership(): void {}

  dropMembership(): void {}

  onData(listener: UdpSocket.Callback): Transport.Listener {
    const off = this.pool.onFrame((slot, bytes) => {
      const v6 = slot.host!.includes(':');
      // each socket its family: a frame reaches one listener
      if (this.type === 'udp6' ? !v6 : this.type === 'udp4' ? v6 : false) return;
      listener(INTERFACE, slot.host!, slot.port!, bytes);
    });
    return { close: async () => off() };
  }

  async send(host: string, port: number, data: Bytes): Promise<void> {
    if (host.includes(':') && !this.ipv6) throw new NetworkError(`IPv6 is off here: ${host}`);
    this.pool.send(host, port, Bytes.of(data));
  }

  async close(): Promise<void> {}
}

/** a MAC as GeneralDiagnostics wants one (six bytes): CF's when it's one, else made from the address (locally administered) */
export function macOf(cf: CF): string {
  const mac = (cf.MACaddress ?? '').trim().toLowerCase();
  if (/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(mac) && mac !== '00:00:00:00:00:00') return mac;
  const seed = `${cf.ipv4address}|${cf.device?.name ?? ''}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  const b = [(h1 >>> 24) & 0xfc | 0x02, (h1 >>> 16) & 0xff, (h1 >>> 8) & 0xff, h1 & 0xff, (h2 >>> 8) & 0xff, h2 & 0xff];
  return b.map((x) => x.toString(16).padStart(2, '0')).join(':');
}

export class CfNetwork extends Network {
  constructor(private cf: CF, readonly pool: SlotPool, readonly ipv6: boolean) {
    super();
  }

  getNetInterfaces(): NetworkInterface[] {
    return [{ name: INTERFACE, type: InterfaceType.WiFi }];
  }

  getIpMac(netInterface: string): NetworkInterfaceDetails | undefined {
    if (netInterface !== INTERFACE) return undefined;
    const v4 = this.cf.ipv4address && this.cf.ipv4address !== '0.0.0.0' ? [this.cf.ipv4address] : [];
    const v6 = this.ipv6 && this.cf.ipv6address ? [this.cf.ipv6address] : [];
    return { mac: macOf(this.cf), ipV4: v4, ipV6: v6 };
  }

  async createUdpSocket(options: UdpSocketOptions): Promise<UdpSocket> {
    return new CfUdpSocket(this.pool, options.type, this.ipv6, options.listeningPort || this.pool.slots[0].localPort);
  }
}

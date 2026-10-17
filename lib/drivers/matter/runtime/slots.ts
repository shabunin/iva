/**
 * The pool of UDP systems (matter0 ... matterN): a slot each, targeted at
 * one peer (host:port) at a time with CF.setSystemProperties - before any
 * Matter session exists over it. A Matter node answers to the address and
 * port a request came from, so a slot's frames are its peer's. A peer gets
 * a free slot, else the one longest unused. A retarget is the system off,
 * its address and port set, and on again: iViewer keeps sending to the old
 * address when only the address and port change (the probe showed). A restart binds the socket again, which takes a moment on a
 * phone; what's sent meanwhile goes at once all the same - iva's runtime
 * queues it till the socket is bound (offlineQueue), iViewer sends no
 * ConnectionStatusChangeEvent for a UDP system at all (seen 2026-10-18:
 * holding the first packets till a 1.5 s timeout cost matter.js its whole
 * retry budget), and Matter's own retransmissions cover a lost first packet.
 */

import { fromBinary, toBinary, type CF } from './cf.js';

export interface Slot {
  index: number;
  /** the system's name */
  name: string;
  localPort: number;
  host?: string;
  port?: number;
  /** targeted at its peer in the GUI itself (a device known by address): never retargeted, never given away */
  fixed?: boolean;
  /** when it last sent or received (a counter) */
  used: number;
  /** the last datagram sent (a panel that hands it back as a frame is caught by it) */
  sent?: string;
}

export type FrameListener = (slot: Slot, bytes: Uint8Array) => void;

/** the address a slot waits at till it's given a peer (the device itself, a port nobody answers on) */
export const PLACEHOLDER = '127.0.0.2';

export class SlotPool {
  readonly slots: Slot[];
  private listeners: FrameListener[] = [];
  private clock = 0;
  /** when a retargeted slot said it was bound again (a log line the first time: how long the phone takes) */
  private retargeted = new Map<number, number>();
  /** slots seen handing their own datagrams back (said once each) */
  private loopers = new Set<number>();

  constructor(private cf: CF, names: string[], localPorts: number[], private log: (m: string) => void = () => {}) {
    this.slots = names.map((name, i) => ({ index: i, name, localPort: localPorts[i], used: 0 }));
    for (const slot of this.slots) {
      // a system the GUI targets at a peer already (not the placeholder nobody): that peer's slot, as it is
      const sys = cf.systems?.[slot.name];
      if (sys && sys.address && sys.address !== PLACEHOLDER && sys.port) {
        slot.host = sys.address;
        slot.port = Number(sys.port);
        slot.fixed = true;
      }
      cf.watch(cf.FeedbackMatchedEvent, slot.name, 'frame', (_fb: unknown, data: unknown) => this.frame(slot, String(data)));
      // (one system a watch: iViewer takes no array here)
      cf.watch(cf.ConnectionStatusChangeEvent, slot.name, (_system: string, connected: boolean) => {
        const since = this.retargeted.get(slot.index);
        if (connected && since !== undefined) {
          this.retargeted.delete(slot.index);
          this.log(`slot ${slot.name}: bound again after ${Date.now() - since} ms`);
        }
      });
    }
  }

  /** the slot targeted at host:port: the one there, else a free one, else the longest unused (retargeted) */
  slotFor(host: string, port: number): Slot {
    let slot = this.slots.find((s) => s.host === host && s.port === port);
    if (!slot) {
      const free = this.slots.filter((s) => !s.fixed);
      if (!free.length) throw new Error(`no slot for ${host}:${port}: every slot is a device's own (more <Matter slots>)`);
      slot = free.find((s) => s.host === undefined) ?? free.reduce((a, b) => (a.used <= b.used ? a : b));
      if (slot.host !== undefined) this.log(`slot ${slot.name}: ${slot.host}:${slot.port} -> ${host}:${port} (all ${free.length} free slots in use)`);
      slot.host = host;
      slot.port = port;
      this.retargeted.set(slot.index, Date.now());
      const target = slot;
      this.tell(target, 'retarget', () => {
        this.cf.setSystemProperties(target.name, { enabled: false });
        // (the GUI's localPort stays: setting it again was one of the probe's retarget ways that only looked right on iViewer)
        this.cf.setSystemProperties(target.name, { address: host, port });
        this.cf.setSystemProperties(target.name, { enabled: true });
      });
    }
    slot.used = ++this.clock;
    return slot;
  }

  /** the slot targeted at host:port, if any */
  slotOf(host: string, port: number): Slot | undefined {
    return this.slots.find((s) => s.host === host && s.port === port);
  }

  send(host: string, port: number, bytes: Uint8Array): void {
    const slot = this.slotFor(host, port);
    const data = toBinary(bytes);
    slot.sent = data;
    this.tell(slot, `send ${bytes.length} B`, () => this.cf.send(slot.name, data));
  }

  /** a CF call on a slot: what it throws (a panel's API refusing something) said in the log, then thrown on */
  private tell(slot: Slot, what: string, call: () => void): void {
    try {
      call();
    } catch (e) {
      this.log(`slot ${slot.name}: ${what} failed: ${(e as Error)?.message ?? e}`);
      throw e;
    }
  }

  /** frames as they come, with the slot (its peer) they came on; returns what stops listening */
  onFrame(listener: FrameListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private frame(slot: Slot, data: string): void {
    // a slot targeted at nobody: what comes is nobody's
    if (slot.host === undefined) return;
    // the datagram just sent, back as a frame: the panel looped it (official iViewer 5.0.7 does, for a UDP system
    // retargeted at runtime: nothing reaches the network) - not the peer's, dropped
    if (data === slot.sent) {
      if (!this.loopers.has(slot.index)) {
        this.loopers.add(slot.index);
        this.log(`slot ${slot.name}: its own datagram came back as a frame (${data.length} B to ${slot.host}:${slot.port}) - this panel loops a retargeted UDP system's sends; the peer gets nothing`);
      }
      return;
    }
    slot.used = ++this.clock;
    const bytes = fromBinary(data);
    for (const l of this.listeners) l(slot, bytes);
  }
}

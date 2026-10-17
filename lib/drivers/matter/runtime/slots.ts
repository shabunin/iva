/**
 * The pool of UDP systems (matter0 ... matterN): a slot each, targeted at
 * one peer (host:port) at a time with CF.setSystemProperties - before any
 * Matter session exists over it. A Matter node answers to the address and
 * port a request came from, so a slot's frames are its peer's. A peer gets
 * a free slot, else the one longest unused. A retargeted system binds its
 * socket again, which takes a moment (longer on a phone): what's sent
 * meanwhile waits for its ConnectionStatusChangeEvent (or READY_MS).
 */

import { fromBinary, toBinary, type CF } from './cf.js';

export interface Slot {
  index: number;
  /** the system's name */
  name: string;
  localPort: number;
  host?: string;
  port?: number;
  /** when it last sent or received (a counter) */
  used: number;
}

export type FrameListener = (slot: Slot, bytes: Uint8Array) => void;

/** how long a retargeted system gets to say it's connected before what waits goes anyway */
export const READY_MS = 1500;

export class SlotPool {
  readonly slots: Slot[];
  private listeners: FrameListener[] = [];
  private clock = 0;
  /** what waits for a retargeted slot's socket, by slot */
  private pending = new Map<number, { queue: Uint8Array[]; timer: ReturnType<typeof setTimeout> }>();

  constructor(private cf: CF, names: string[], localPorts: number[], private log: (m: string) => void = () => {}) {
    this.slots = names.map((name, i) => ({ index: i, name, localPort: localPorts[i], used: 0 }));
    for (const slot of this.slots) {
      cf.watch(cf.FeedbackMatchedEvent, slot.name, 'frame', (_fb: unknown, data: unknown) => this.frame(slot, String(data)));
      // (one system a watch: iViewer takes no array here)
      cf.watch(cf.ConnectionStatusChangeEvent, slot.name, (_system: string, connected: boolean) => {
        if (connected) this.ready(slot);
      });
    }
  }

  /** the slot targeted at host:port: the one there, else a free one, else the longest unused (retargeted) */
  slotFor(host: string, port: number): Slot {
    let slot = this.slots.find((s) => s.host === host && s.port === port);
    if (!slot) {
      slot = this.slots.find((s) => s.host === undefined) ?? this.slots.reduce((a, b) => (a.used <= b.used ? a : b));
      if (slot.host !== undefined) this.log(`slot ${slot.name}: ${slot.host}:${slot.port} -> ${host}:${port} (all ${this.slots.length} slots in use)`);
      slot.host = host;
      slot.port = port;
      const old = this.pending.get(slot.index);
      if (old) clearTimeout(old.timer);
      const index = slot.index;
      this.pending.set(index, { queue: [], timer: setTimeout(() => this.ready(this.slots[index], true), READY_MS) });
      this.cf.setSystemProperties(slot.name, { address: host, port, enabled: true });
    }
    slot.used = ++this.clock;
    return slot;
  }

  /** a retargeted slot's socket is bound: what waited goes */
  private ready(slot: Slot, timedOut = false): void {
    const p = this.pending.get(slot.index);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(slot.index);
    if (timedOut && p.queue.length) this.log(`slot ${slot.name}: no connection event in ${READY_MS} ms, sending anyway`);
    for (const bytes of p.queue) this.cf.send(slot.name, toBinary(bytes));
  }

  /** the slot targeted at host:port, if any */
  slotOf(host: string, port: number): Slot | undefined {
    return this.slots.find((s) => s.host === host && s.port === port);
  }

  send(host: string, port: number, bytes: Uint8Array): void {
    const slot = this.slotFor(host, port);
    const p = this.pending.get(slot.index);
    if (p) p.queue.push(bytes);
    else this.cf.send(slot.name, toBinary(bytes));
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
    slot.used = ++this.clock;
    const bytes = fromBinary(data);
    for (const l of this.listeners) l(slot, bytes);
  }
}

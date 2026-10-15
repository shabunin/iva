/**
 * Joins: numbers as given, or names that get numbers at the end of the build
 * (from joinBase up, per join type, skipping every number used explicitly),
 * so a project can say join="volume" and scripts read the map.
 */

import type { JoinRef, JoinType } from './components.js';

const TYPES = new Set(['d', 'a', 's', 'l']);

export function isJoinRef(v: unknown): v is JoinRef {
  return !!v && typeof v === 'object' && (v as JoinRef).$$join === 1;
}

/** A join whose number may not be known yet. */
export class JoinSlot {
  constructor(public type: JoinType, public id: number | string) {}
}

/** Parse a join value whose type the element decides. */
export function fixedJoin(type: JoinType, v: unknown): JoinSlot | undefined {
  if (v === undefined || v === null || v === 0 || v === '0' || v === '') return undefined;
  if (isJoinRef(v)) {
    if (v.type !== type) throw new Error(`expects a ${NAMES[type]} join, got ${v.type}(${JSON.stringify(v.id)})`);
    return new JoinSlot(type, v.id);
  }
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0) throw new Error(`join numbers are whole numbers >= 1, got ${v}`);
    return new JoinSlot(type, v);
  }
  if (typeof v === 'string') return /^\d+$/.test(v) ? new JoinSlot(type, Number(v)) : new JoinSlot(type, v);
  throw new Error(`invalid join: ${JSON.stringify(v)}`);
}

/** Parse a join that names its type: d(5), 'd5', 'd:power'. */
export function typedJoin(v: unknown): JoinSlot | string {
  if (isJoinRef(v)) return new JoinSlot(v.type, v.id);
  if (typeof v !== 'string') throw new Error(`invalid join: ${JSON.stringify(v)} (use d(5), 's12' or 'd:name')`);
  const m = /^([dasl])(?::(.+)|(\d+))$/.exec(v);
  if (m && TYPES.has(m[1])) return new JoinSlot(m[1] as JoinType, m[3] !== undefined ? Number(m[3]) : m[2]);
  return v; // something iViewer understands that iva doesn't model (e0, a$ch$, ...) - kept as is
}

export const NAMES: Record<JoinType, string> = { d: 'digital', a: 'analog', s: 'serial', l: 'list' };

export class JoinAllocator {
  private used: Record<JoinType, Set<number>> = { d: new Set(), a: new Set(), s: new Set(), l: new Set() };
  private named: Record<JoinType, Map<string, number>> = { d: new Map(), a: new Map(), s: new Map(), l: new Map() };
  private slots: { slot: JoinSlot; set: (n: number) => void }[] = [];

  constructor(private base = 1000) {}

  /** Register a slot; `set` receives its number once allocate() runs. */
  use(slot: JoinSlot, set: (n: number) => void) {
    if (typeof slot.id === 'number') {
      this.used[slot.type].add(slot.id);
      set(slot.id);
    } else {
      if (!this.named[slot.type].has(slot.id)) this.named[slot.type].set(slot.id, 0);
      this.slots.push({ slot, set });
    }
  }

  allocate() {
    for (const type of ['d', 'a', 's', 'l'] as JoinType[]) {
      let next = this.base;
      for (const name of this.named[type].keys()) {
        while (this.used[type].has(next)) next++;
        this.named[type].set(name, next);
        this.used[type].add(next);
      }
    }
    for (const { slot, set } of this.slots) set(this.named[slot.type].get(slot.id as string)!);
  }

  /** The named joins so far, by type (before allocate: what to give numbers to). */
  names(): { type: JoinType; name: string }[] {
    return (['d', 'a', 's', 'l'] as JoinType[]).flatMap((type) => [...this.named[type].keys()].map((name) => ({ type, name })));
  }

  /** name -> number, per type (after allocate) */
  map() {
    const out: Record<string, Record<string, number>> = {};
    for (const type of ['d', 'a', 's', 'l'] as JoinType[]) {
      if (this.named[type].size) out[NAMES[type]] = Object.fromEntries(this.named[type]);
    }
    return out;
  }
}

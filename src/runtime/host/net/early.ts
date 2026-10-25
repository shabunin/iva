import type { NetEventPayload } from '../../stdlib/net';

/** how long, and how many, events for ids not known yet are kept */
const KEEP_MS = 10000;
const KEEP_MAX = 64;

/**
 * What the host told of ids the page doesn't know yet, kept a while for
 * them: it sends a connection's first bytes (a device's banner, a client's
 * request) as they come, which can be before the page has the answer that
 * gives it the id - the connect's, the listen's. An id never known (a socket
 * the page let go of): its events go in a few seconds, a few dozen kept at most.
 */
export class EarlyEvents {
    private kept: { at: number; payload: NetEventPayload }[] = [];

    keep(payload: NetEventPayload) {
        const now = Date.now();
        this.kept = this.kept.filter((k) => now - k.at < KEEP_MS);
        if (this.kept.length >= KEEP_MAX) this.kept.shift();
        this.kept.push({ at: now, payload });
    }

    /** `id`'s, in the order they came - no longer kept */
    take(id: string): NetEventPayload[] {
        const now = Date.now();
        const its: NetEventPayload[] = [];
        this.kept = this.kept.filter((k) => {
            if (now - k.at >= KEEP_MS) return false;
            if (k.payload.id !== id) return true;
            its.push(k.payload);
            return false;
        });
        return its;
    }
}

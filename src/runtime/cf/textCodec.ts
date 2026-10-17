/**
 * A system's text and its bytes - GUI Designer's Text Encoding: a name as
 * the web's encodings go (utf-8, windows-1251, iso-8859-1, koi8-r, utf-16le
 * ...). None set: a char a byte (CF.BINARY), but UTF-8 where the bytes are
 * that (a server's Russian text), and text that a byte a char can't carry
 * sent as UTF-8.
 */

const latin1 = (bytes: Uint8Array) => {
    let s = '';
    for (let i = 0; i < bytes.length; i += 4096) s += String.fromCharCode(...bytes.subarray(i, i + 4096));
    return s;
};

const UTF8 = new Set(['utf-8', 'utf8', 'unicode-1-1-utf-8']);
/**
 * ISO-8859-1 as IANA has it: a byte a char, every byte (the web's decoder
 * gives windows-1252 for these names, a different thing for 0x80-0x9F) -
 * what a binary protocol over a system wants, in and out, with no UTF-8
 * read into it (iva/drivers/mqtt sets it).
 */
const LATIN1 = new Set(['iso-8859-1', 'iso_8859-1', 'iso8859-1', 'iso-ir-100', 'latin1', 'l1', 'cp819', 'ibm819', 'csisolatin1', 'binary']);
const named = (encoding?: string) => (encoding ?? '').trim().toLowerCase();

/** how many bytes at the end start a UTF-8 character that isn't all there */
function cut(bytes: Uint8Array): number {
    for (let back = 1; back <= Math.min(3, bytes.length); back++) {
        const b = bytes[bytes.length - back];
        if ((b & 0xc0) === 0x80) continue; // a continuation: look further back
        const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
        return need > back ? back : 0;
    }
    return 0;
}

/** Incoming bytes as text, packet by packet: a character cut between two waits for its end. */
export class TextIn {
    private decoder: TextDecoder | null = null;
    private rest: Uint8Array | null = null;
    private readonly fatal = new TextDecoder('utf-8', { fatal: true });
    /** ISO-8859-1: a byte a char, whatever the bytes */
    private readonly latin1: boolean = false;

    constructor(encoding?: string) {
        const name = named(encoding);
        if (!name) return;
        if (LATIN1.has(name)) {
            this.latin1 = true;
            return;
        }
        try {
            this.decoder = new TextDecoder(name);
        } catch {
            console.warn(`[system] no text encoding "${encoding}": a char a byte`);
        }
    }

    decode(data: Uint8Array | string): string {
        if (typeof data === 'string') return data;
        if (this.latin1) return latin1(data);
        if (this.decoder) return this.decoder.decode(data, { stream: true });
        let bytes = data;
        if (this.rest) {
            bytes = new Uint8Array(this.rest.length + data.length);
            bytes.set(this.rest);
            bytes.set(data, this.rest.length);
            this.rest = null;
        }
        if (!bytes.some((b) => b >= 0x80)) return latin1(bytes);
        const tail = cut(bytes);
        const body = bytes.subarray(0, bytes.length - tail);
        try {
            const text = this.fatal.decode(body);
            // UTF-8 text going on: its cut character waits for the next packet
            if (tail && body.some((b) => b >= 0x80)) {
                this.rest = bytes.slice(bytes.length - tail);
                return text;
            }
            if (!tail) return text;
        } catch {
            // not UTF-8: binary
        }
        return latin1(bytes);
    }
}

/** the single-byte encodings' bytes by char (windows-1251: А -> 0xC0) */
const tables = new Map<string, Map<string, number> | null>();
function table(name: string): Map<string, number> | null {
    if (tables.has(name)) return tables.get(name)!;
    let map: Map<string, number> | null = null;
    try {
        const all = new Uint8Array(256).map((_, i) => i);
        const chars = [...new TextDecoder(name).decode(all)];
        if (chars.length === 256) map = new Map(chars.map((c, i) => [c, i] as [string, number]).reverse());
    } catch {
        // no such encoding
    }
    tables.set(name, map);
    return map;
}

/** Text to send as bytes in the encoding (none: a byte a char, UTF-8 if any char is past a byte). */
export function encodeText(text: string, encoding?: string): Uint8Array {
    const name = named(encoding);
    if (!name) {
        let wide = false;
        for (let i = 0; i < text.length && !wide; i++) wide = text.charCodeAt(i) > 0xff;
        if (wide) return new TextEncoder().encode(text);
        return Uint8Array.from(text, (c) => c.charCodeAt(0));
    }
    if (UTF8.has(name)) return new TextEncoder().encode(text);
    // a char a byte; one past a byte: '?'
    if (LATIN1.has(name)) return Uint8Array.from(text, (c) => (c.charCodeAt(0) > 0xff ? 0x3f : c.charCodeAt(0)));
    if (name === 'utf-16le' || name === 'utf-16' || name === 'utf-16be') {
        const out = new Uint8Array(text.length * 2);
        const view = new DataView(out.buffer);
        for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), name !== 'utf-16be');
        return out;
    }
    const map = table(name);
    if (!map) return new TextEncoder().encode(text);
    return Uint8Array.from([...text].map((c) => map.get(c) ?? 0x3f));
}

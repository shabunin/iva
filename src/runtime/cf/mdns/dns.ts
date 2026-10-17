/**
 * DNS messages as mDNS / DNS-SD uses them (RFC 1035, 6762, 6763): the
 * questions and the records Bonjour needs - PTR, SRV, TXT, A, AAAA - others
 * kept as their bytes. Names are dotted strings ("Living room._http._tcp.local");
 * a dot inside a label (an instance name may have one) is "\.".
 */

export const TYPE = { A: 1, PTR: 12, TXT: 16, AAAA: 28, SRV: 33, NSEC: 47, ANY: 255 } as const;
const CLASS_IN = 1;
/** a question's top bit: answer me by unicast (QU); a record's: flush what's cached for it */
const TOP = 0x8000;

export interface Question {
  name: string;
  type: number;
  /** QU: the answer by unicast */
  unicast?: boolean;
}

export interface Srv {
  priority: number;
  weight: number;
  port: number;
  target: string;
}

export interface DnsRecord {
  name: string;
  type: number;
  ttl: number;
  /** cache-flush: this record replaces what's cached for its name and type */
  flush?: boolean;
  /** PTR: the name it points at; A / AAAA: the address; SRV: priority, weight, port, target; TXT: its strings; else: the bytes */
  data: string | Srv | string[] | Uint8Array;
}

export interface Message {
  id: number;
  response: boolean;
  authoritative?: boolean;
  questions: Question[];
  answers: DnsRecord[];
  authorities: DnsRecord[];
  additionals: DnsRecord[];
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

/** a name's labels: split at the dots that aren't "\." */
export function labels(name: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < name.length; i++) {
    const c = name[i];
    if (c === '\\' && i + 1 < name.length) cur += name[++i];
    else if (c === '.') {
      if (cur) out.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}
const escapeLabel = (l: string) => l.replace(/\\/g, '\\\\').replace(/\./g, '\\.');
/** labels as a name ("\." for a dot in one) */
export const joinLabels = (ls: string[]) => ls.map(escapeLabel).join('.');
/** DNS names are compared without case */
export const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

class Writer {
  private buf = new Uint8Array(512);
  private len = 0;
  private names = new Map<string, number>();
  private room(n: number) {
    if (this.len + n <= this.buf.length) return;
    const next = new Uint8Array(Math.max(this.buf.length * 2, this.len + n));
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }
  u8(v: number) {
    this.room(1);
    this.buf[this.len++] = v & 0xff;
  }
  u16(v: number) {
    this.u8(v >> 8);
    this.u8(v);
  }
  u32(v: number) {
    this.u16((v >>> 16) & 0xffff);
    this.u16(v & 0xffff);
  }
  bytes(b: Uint8Array) {
    this.room(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
  }
  /** a name, its known tail as a pointer (compression) */
  name(name: string) {
    const ls = labels(name);
    for (let i = 0; i < ls.length; i++) {
      const key = joinLabels(ls.slice(i)).toLowerCase();
      const at = this.names.get(key);
      if (at !== undefined) {
        this.u16(0xc000 | at);
        return;
      }
      if (this.len < 0x3fff) this.names.set(key, this.len);
      const b = utf8.encode(ls[i]).subarray(0, 63);
      this.u8(b.length);
      this.bytes(b);
    }
    this.u8(0);
  }
  at() {
    return this.len;
  }
  set16(at: number, v: number) {
    this.buf[at] = (v >> 8) & 0xff;
    this.buf[at + 1] = v & 0xff;
  }
  done() {
    return this.buf.slice(0, this.len);
  }
}

function ipv4(addr: string): Uint8Array {
  const p = addr.split('.').map(Number);
  return new Uint8Array(p.length === 4 && p.every((n) => n >= 0 && n <= 255) ? p : [0, 0, 0, 0]);
}

function ipv6(addr: string): Uint8Array {
  const out = new Uint8Array(16);
  const [head, tail] = addr.split('%')[0].split('::');
  const part = (s: string | undefined) => (s ? s.split(':').filter(Boolean).map((h) => parseInt(h, 16) || 0) : []);
  const a = part(head);
  const b = tail === undefined ? [] : part(tail);
  const words = tail === undefined ? a : [...a, ...new Array(Math.max(0, 8 - a.length - b.length)).fill(0), ...b];
  words.slice(0, 8).forEach((w, i) => {
    out[i * 2] = w >> 8;
    out[i * 2 + 1] = w & 0xff;
  });
  return out;
}

function ipv6Text(b: Uint8Array): string {
  const words: number[] = [];
  for (let i = 0; i < 16; i += 2) words.push((b[i] << 8) | b[i + 1]);
  // the longest run of zero words as "::"
  let best = -1, bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (words[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && words[j] === 0) j++;
    if (j - i > bestLen && j - i > 1) {
      best = i;
      bestLen = j - i;
    }
    i = j;
  }
  const hex = (ws: number[]) => ws.map((w) => w.toString(16)).join(':');
  return best < 0 ? hex(words) : `${hex(words.slice(0, best))}::${hex(words.slice(best + bestLen))}`;
}

function writeRecord(w: Writer, r: DnsRecord) {
  w.name(r.name);
  w.u16(r.type);
  w.u16(CLASS_IN | (r.flush ? TOP : 0));
  w.u32(Math.max(0, Math.round(r.ttl)));
  const lenAt = w.at();
  w.u16(0);
  const start = w.at();
  const d = r.data;
  if (r.type === TYPE.PTR) w.name(String(d));
  else if (r.type === TYPE.A) w.bytes(ipv4(String(d)));
  else if (r.type === TYPE.AAAA) w.bytes(ipv6(String(d)));
  else if (r.type === TYPE.SRV) {
    const s = d as Srv;
    w.u16(s.priority);
    w.u16(s.weight);
    w.u16(s.port);
    w.name(s.target);
  } else if (r.type === TYPE.TXT) {
    const strings = (d as string[]).length ? (d as string[]) : [''];
    for (const s of strings) {
      const b = utf8.encode(s).subarray(0, 255);
      w.u8(b.length);
      w.bytes(b);
    }
  } else if (d instanceof Uint8Array) w.bytes(d);
  w.set16(lenAt, w.at() - start);
}

/** A message as bytes for the wire. */
export function encode(m: Message): Uint8Array {
  const w = new Writer();
  w.u16(m.id);
  w.u16((m.response ? 0x8000 : 0) | (m.authoritative ? 0x0400 : 0));
  w.u16(m.questions.length);
  w.u16(m.answers.length);
  w.u16(m.authorities.length);
  w.u16(m.additionals.length);
  for (const q of m.questions) {
    w.name(q.name);
    w.u16(q.type);
    w.u16(CLASS_IN | (q.unicast ? TOP : 0));
  }
  for (const r of [...m.answers, ...m.authorities, ...m.additionals]) writeRecord(w, r);
  return w.done();
}

class Reader {
  pos = 0;
  constructor(private b: Uint8Array) {}
  need(n: number) {
    if (this.pos + n > this.b.length) throw new Error('DNS message cut short');
  }
  u8() {
    this.need(1);
    return this.b[this.pos++];
  }
  u16() {
    this.need(2);
    const v = (this.b[this.pos] << 8) | this.b[this.pos + 1];
    this.pos += 2;
    return v;
  }
  u32() {
    return ((this.u16() << 16) >>> 0) + this.u16();
  }
  bytes(n: number) {
    this.need(n);
    const out = this.b.slice(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  /** a name, following compression pointers (never in a loop) */
  name(): string {
    const ls: string[] = [];
    let pos = this.pos;
    let jumped = false;
    for (let hops = 0; hops < 64; hops++) {
      if (pos >= this.b.length) throw new Error('DNS name past the end');
      const len = this.b[pos];
      if (len === 0) {
        if (!jumped) this.pos = pos + 1;
        return joinLabels(ls);
      }
      if ((len & 0xc0) === 0xc0) {
        if (pos + 1 >= this.b.length) throw new Error('DNS pointer past the end');
        const to = ((len & 0x3f) << 8) | this.b[pos + 1];
        if (!jumped) this.pos = pos + 2;
        jumped = true;
        pos = to;
        continue;
      }
      if (pos + 1 + len > this.b.length) throw new Error('DNS label past the end');
      ls.push(fromUtf8.decode(this.b.subarray(pos + 1, pos + 1 + len)));
      pos += 1 + len;
    }
    throw new Error('DNS name pointers in a loop');
  }
  record(): DnsRecord {
    const name = this.name();
    const type = this.u16();
    const cls = this.u16();
    const ttl = this.u32();
    const len = this.u16();
    this.need(len);
    const end = this.pos + len;
    let data: DnsRecord['data'];
    if (type === TYPE.PTR) data = this.name();
    else if (type === TYPE.A && len === 4) data = Array.from(this.bytes(4)).join('.');
    else if (type === TYPE.AAAA && len === 16) data = ipv6Text(this.bytes(16));
    else if (type === TYPE.SRV) data = { priority: this.u16(), weight: this.u16(), port: this.u16(), target: this.name() };
    else if (type === TYPE.TXT) {
      const strings: string[] = [];
      while (this.pos < end) {
        const n = this.u8();
        strings.push(fromUtf8.decode(this.bytes(Math.min(n, end - this.pos))));
      }
      data = strings;
    } else data = this.bytes(len);
    this.pos = end;
    return { name, type, ttl, flush: (cls & TOP) !== 0, data };
  }
}

/** A message from the wire; one that isn't (cut short, a pointer loop) throws. */
export function decode(b: Uint8Array): Message {
  const r = new Reader(b);
  const id = r.u16();
  const flags = r.u16();
  const qd = r.u16(), an = r.u16(), ns = r.u16(), ar = r.u16();
  const questions: Question[] = [];
  for (let i = 0; i < qd; i++) {
    const name = r.name();
    const type = r.u16();
    const cls = r.u16();
    questions.push({ name, type, unicast: (cls & TOP) !== 0 });
  }
  const records = (n: number) => Array.from({ length: n }, () => r.record());
  return {
    id,
    response: (flags & 0x8000) !== 0,
    authoritative: (flags & 0x0400) !== 0,
    questions,
    answers: records(an),
    authorities: records(ns),
    additionals: records(ar),
  };
}

/** A TXT record's strings as DNS-SD's key / value pairs ("key=value"; a key alone: ""). The first of a key wins. */
export function txtData(strings: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of strings) {
    if (!s) continue;
    const at = s.indexOf('=');
    const key = at < 0 ? s : s.slice(0, at);
    if (!key || Object.keys(out).some((k) => k.toLowerCase() === key.toLowerCase())) continue;
    out[key] = at < 0 ? '' : s.slice(at + 1);
  }
  return out;
}

/** Key / value pairs as a TXT record's strings. */
export const txtStrings = (data: Record<string, unknown> | null | undefined) =>
  Object.entries(data ?? {}).map(([k, v]) => `${k}=${v === undefined || v === null ? '' : String(v)}`);

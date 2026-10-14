/**
 * Minimal Node.js-compatible Buffer for webview runtimes.
 * Implemented as Uint8Array + prototype (avoids TS static `from` clash with Uint8Array).
 */

export type BufferEncoding = 'utf8' | 'utf-8' | 'hex' | 'base64' | 'binary' | 'latin1';

export interface Buffer extends Uint8Array {
  readonly _isBuffer: true;
  toString(encoding?: BufferEncoding, start?: number, end?: number): string;
  equals(other: Uint8Array): boolean;
  /** Return a Buffer view/copy (Node-compatible name). */
  slice(start?: number, end?: number): Buffer;
}

function encodeString(str: string, encoding: BufferEncoding = 'utf8'): Uint8Array {
  switch (encoding) {
    case 'hex': {
      const clean = str.replace(/[^0-9a-fA-F]/g, '');
      const out = new Uint8Array(Math.floor(clean.length / 2));
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
      }
      return out;
    }
    case 'base64': {
      const bin = atob(str);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    case 'binary':
    case 'latin1': {
      const out = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
      return out;
    }
    default:
      return new TextEncoder().encode(str);
  }
}

function decodeBytes(bytes: Uint8Array, encoding: BufferEncoding = 'utf8'): string {
  switch (encoding) {
    case 'hex': {
      let s = '';
      for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).padStart(2, '0');
      }
      return s;
    }
    case 'base64': {
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
    case 'binary':
    case 'latin1': {
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return s;
    }
    default:
      return new TextDecoder().decode(bytes);
  }
}

const bufferPrototype = {
  _isBuffer: true as const,

  toString(this: Uint8Array, encoding: BufferEncoding = 'utf8', start = 0, end?: number): string {
    const slice = this.subarray(start, end ?? this.length);
    return decodeBytes(slice, encoding);
  },

  equals(this: Uint8Array, other: Uint8Array): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i++) {
      if (this[i] !== other[i]) return false;
    }
    return true;
  },

  slice(this: Uint8Array, start?: number, end?: number): Buffer {
    return wrap(this.subarray(start, end));
  },
};

function wrap(u8: Uint8Array): Buffer {
  // Copy into a fresh Uint8Array so we own the buffer, then attach methods.
  const copy = u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
    ? u8
    : new Uint8Array(u8);
  // If already a plain view on a shared buffer, clone for safety when needed
  const owned = copy instanceof Uint8Array ? new Uint8Array(copy) : new Uint8Array(0);
  Object.setPrototypeOf(owned, Object.create(Uint8Array.prototype, {
    toString: { value: bufferPrototype.toString, writable: true, configurable: true },
    equals: { value: bufferPrototype.equals, writable: true, configurable: true },
    slice: { value: bufferPrototype.slice, writable: true, configurable: true },
    _isBuffer: { value: true, writable: false, configurable: true },
  }));
  return owned as Buffer;
}

function wrapInPlace(u8: Uint8Array): Buffer {
  Object.setPrototypeOf(u8, Object.create(Uint8Array.prototype, {
    toString: { value: bufferPrototype.toString, writable: true, configurable: true },
    equals: { value: bufferPrototype.equals, writable: true, configurable: true },
    slice: { value: bufferPrototype.slice, writable: true, configurable: true },
    _isBuffer: { value: true, writable: false, configurable: true },
  }));
  return u8 as Buffer;
}

export const Buffer = {
  isBuffer(obj: unknown): obj is Buffer {
    return (
      !!obj &&
      typeof obj === 'object' &&
      ((obj as any)._isBuffer === true ||
        Object.prototype.toString.call(obj) === '[object Uint8Array]' &&
          typeof (obj as any).equals === 'function')
    );
  },

  alloc(size: number, fill: number | string = 0, encoding: BufferEncoding = 'utf8'): Buffer {
    const u8 = new Uint8Array(size);
    if (typeof fill === 'number') {
      u8.fill(fill & 0xff);
    } else if (fill !== '') {
      const bytes = encodeString(String(fill), encoding);
      for (let i = 0; i < size; i++) u8[i] = bytes[i % bytes.length];
    }
    return wrapInPlace(u8);
  },

  allocUnsafe(size: number): Buffer {
    return wrapInPlace(new Uint8Array(size));
  },

  from(
    data: string | ArrayBuffer | ArrayBufferView | number[] | Buffer,
    encodingOrOffset?: BufferEncoding | number,
    length?: number
  ): Buffer {
    if (typeof data === 'string') {
      const enc = (typeof encodingOrOffset === 'string' ? encodingOrOffset : 'utf8') as BufferEncoding;
      return wrap(encodeString(data, enc));
    }
    if (data instanceof ArrayBuffer) {
      const offset = typeof encodingOrOffset === 'number' ? encodingOrOffset : 0;
      const len = length ?? data.byteLength - offset;
      return wrap(new Uint8Array(data, offset, len));
    }
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      return wrap(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    }
    if (Array.isArray(data)) {
      return wrap(Uint8Array.from(data));
    }
    // Array-like objects (some IPC bridges deliver number sequences this way)
    if (data && typeof data === 'object' && typeof (data as any).length === 'number') {
      return wrap(Uint8Array.from(data as ArrayLike<number>));
    }
    return wrap(new Uint8Array(0));
  },

  concat(list: Array<Uint8Array | Buffer>, totalLength?: number): Buffer {
    const len = totalLength ?? list.reduce((acc, b) => acc + (b?.byteLength ?? 0), 0);
    const out = new Uint8Array(len);
    let offset = 0;
    for (const item of list) {
      if (!item) continue;
      out.set(item, offset);
      offset += item.byteLength;
      if (offset >= len) break;
    }
    return wrapInPlace(out);
  },

  byteLength(
    string: string | ArrayBufferView,
    encoding: BufferEncoding = 'utf8'
  ): number {
    if (typeof string !== 'string') {
      return (string as ArrayBufferView).byteLength;
    }
    return encodeString(string, encoding).byteLength;
  },
};

/** Normalize string | Buffer | Uint8Array | number[] → Uint8Array for host IPC. */
export function toUint8Array(
  data: string | Uint8Array | number[] | ArrayBufferView,
  encoding: BufferEncoding = 'utf8'
): Uint8Array {
  if (typeof data === 'string') return encodeString(data, encoding);
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return new Uint8Array(0);
}

export function installBufferGlobal(target: typeof globalThis = globalThis): void {
  const g = target as any;
  if (!g.Buffer) g.Buffer = Buffer;
}

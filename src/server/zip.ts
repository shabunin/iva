/**
 * ZIP archives: a zipped GUI (the .gui and its images and scripts, as
 * iViewer loads one from a URL) read, and written (iva build --zip). Stored
 * and deflated entries - what GUI Designer and zip tools write; no ZIP64, no
 * encryption.
 */

import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** The archive's files by their path in it ('scripts/main.js'); folders left out. */
export function readZip(zip: Buffer): Map<string, Buffer> {
  // the end of the central directory: in the last 64 KiB + 22 bytes (after it, a comment)
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('not a zip archive');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== CENTRAL) throw new Error('a broken zip archive (central directory)');
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const packed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    // UTF-8 names when flagged (bit 11), else the old DOS code page - ASCII names read the same
    const name = zip.subarray(at + 46, at + 46 + nameLen).toString(flags & 0x800 ? 'utf8' : 'latin1').replace(/\\/g, '/');
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || name.startsWith('__MACOSX/')) continue;
    if (flags & 1) throw new Error(`${name}: encrypted - not something iva reads`);
    if (zip.readUInt32LE(local) !== LOCAL) throw new Error(`${name}: a broken zip archive (local header)`);
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataAt, dataAt + packed);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`${name}: compression method ${method} - iva reads stored and deflated files`);
    if (data.length !== size) throw new Error(`${name}: ${data.length} bytes, the archive says ${size}`);
    files.set(name, data);
  }
  return files;
}

/** Whether the archive holds a .gui (a zipped GUI, not a zip of data), from its directory alone. */
export function zipHasGui(zip: Buffer): boolean {
  try {
    for (const name of zipNames(zip)) if (/\.gui$/i.test(name)) return true;
  } catch {
    return false;
  }
  return false;
}

function zipNames(zip: Buffer): string[] {
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const names: string[] = [];
  let at = zip.readUInt32LE(end + 16);
  for (let n = zip.readUInt16LE(end + 10); n > 0; n--) {
    if (zip.readUInt32LE(at) !== CENTRAL) break;
    const nameLen = zip.readUInt16LE(at + 28);
    names.push(zip.subarray(at + 46, at + 46 + nameLen).toString('latin1'));
    at += 46 + nameLen + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return names;
}

/** An archive of these files (path in it -> bytes): deflated, unless that's no smaller. */
export function writeZip(files: Iterable<[string, Buffer]>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  let count = 0;
  // 1980-01-01 00:00: the same archive for the same files
  const [time, date] = [0, (0 << 9) | (1 << 5) | 1];
  for (const [name, data] of files) {
    const packed = deflateRawSync(data);
    const store = packed.length >= data.length;
    const body = store ? data : packed;
    const nameBytes = Buffer.from(name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(LOCAL, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x800, 6);
    head.writeUInt16LE(store ? 0 : 8, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(CENTRAL, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    head.copy(entry, 8, 6, 30);
    entry.writeUInt32LE(offset, 42);
    parts.push(head, nameBytes, body);
    central.push(entry, nameBytes);
    offset += head.length + nameBytes.length + body.length;
    count++;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

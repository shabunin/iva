import { CFContext, CFCallback } from './types';

export function log(
    ctx: CFContext,
    message: string
) {
    console.log(`[CF API Log]: ${message}`);
}

export function logObject(
    ctx: CFContext,
    object: any
) {
    console.dir(object);
}

/** The CRCs iViewer names (CF.CRC_*): width, polynomial, initial value, reflected (LSB first), final xor */
const CRCS: Record<string, { width: number; poly: number; init: number; refl: boolean; xorout: number }> = {
    CRC_8: { width: 8, poly: 0x07, init: 0x00, refl: false, xorout: 0x00 },                  // CRC-8 (SMBus)
    CRC_16: { width: 16, poly: 0x8005, init: 0x0000, refl: true, xorout: 0x0000 },           // CRC-16 (ARC)
    CRC_16_CCITT: { width: 16, poly: 0x1021, init: 0xffff, refl: false, xorout: 0x0000 },    // CRC-16/CCITT-FALSE
    CRC_16_MODBUS: { width: 16, poly: 0x8005, init: 0xffff, refl: true, xorout: 0x0000 },
    CRC_32: { width: 32, poly: 0x04c11db7, init: 0xffffffff, refl: true, xorout: 0xffffffff },
    CRC_32C: { width: 32, poly: 0x1edc6f41, init: 0xffffffff, refl: true, xorout: 0xffffffff }, // Castagnoli
};

function reflectBits(v: number, bits: number): number {
    let r = 0;
    for (let i = 0; i < bits; i++) {
        r = ((r << 1) | (v & 1)) >>> 0;
        v >>>= 1;
    }
    return r;
}

/** A CRC of a string's bytes - a char a byte, as CF.send's binary strings: its value and width, or null (an unknown type). */
export function crcOf(crcType: string, str: string): { value: number; width: number } | null {
    const p = CRCS[String(crcType).toUpperCase()];
    if (!p) return null;
    const { width } = p;
    const mask = width === 32 ? 0xffffffff : (1 << width) - 1;
    let crc: number;
    if (p.refl) {
        const poly = reflectBits(p.poly, width);
        crc = reflectBits(p.init, width);
        for (let i = 0; i < str.length; i++) {
            crc = (crc ^ (str.charCodeAt(i) & 0xff)) >>> 0;
            for (let k = 0; k < 8; k++) crc = crc & 1 ? ((crc >>> 1) ^ poly) >>> 0 : crc >>> 1;
        }
    } else {
        const top = 2 ** (width - 1);
        crc = p.init;
        for (let i = 0; i < str.length; i++) {
            crc = (crc ^ ((str.charCodeAt(i) & 0xff) * 2 ** (width - 8))) >>> 0;
            for (let k = 0; k < 8; k++) crc = (crc >= top ? ((crc * 2) ^ p.poly) : crc * 2) & mask;
        }
    }
    return { value: ((crc ^ p.xorout) & mask) >>> 0, width };
}

/**
 * CF.crc: the CRC of a string (its bytes) to `callback`, as CF.OUTPUT_NUMBER
 * (a number), CF.OUTPUT_STRING (hex), CF.OUTPUT_BINARY (bytes, big-endian:
 * network order) or CF.OUTPUT_BINARY_LE (little-endian).
 */
export function crc(
    ctx: CFContext,
    crcType: string,
    str: string,
    outputFormat: number,
    callback?: CFCallback
) {
    const r = crcOf(crcType, String(str ?? ''));
    if (!r) {
        console.warn(`CF.crc: unknown CRC type "${crcType}"`);
        callback?.(null);
        return;
    }
    const bytes = r.width / 8;
    const be = Array.from({ length: bytes }, (_, i) => String.fromCharCode((r.value >>> (8 * (bytes - 1 - i))) & 0xff)).join('');
    const out = Number(outputFormat) === 1 ? r.value.toString(16).toUpperCase().padStart(bytes * 2, '0')
        : Number(outputFormat) === 2 ? be
        : Number(outputFormat) === 3 ? be.split('').reverse().join('')
        : r.value;
    callback?.(out);
}

// ── Pure-JS MD5 (MD5 is not available in Web Crypto API) ──────────────────
function _md5(str: string): string {
    function safeAdd(x: number, y: number) {
        const lsw = (x & 0xffff) + (y & 0xffff);
        return (((x >> 16) + (y >> 16) + (lsw >> 16)) << 16) | (lsw & 0xffff);
    }
    function bitRotateLeft(num: number, cnt: number) { return (num << cnt) | (num >>> (32 - cnt)); }
    function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
        return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
    }
    function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return md5cmn((b & c) | (~b & d), a, b, x, s, t);
    }
    function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
    }
    function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return md5cmn(b ^ c ^ d, a, b, x, s, t);
    }
    function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
        return md5cmn(c ^ (b | ~d), a, b, x, s, t);
    }
    // Encode string as UTF-8 bytes then into 32-bit words
    const utf8 = unescape(encodeURIComponent(str));
    const msgLen = utf8.length;
    const numWords = ((msgLen + 64) >> 6) * 16;
    const M: number[] = new Array(numWords).fill(0);
    for (let i = 0; i < msgLen; i++) {
        M[i >> 2] |= utf8.charCodeAt(i) << ((i % 4) * 8);
    }
    M[msgLen >> 2] |= 0x80 << ((msgLen % 4) * 8);
    M[numWords - 2] = msgLen * 8;

    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < M.length; i += 16) {
        const [oa, ob, oc, od] = [a, b, c, d];
        a = md5ff(a, b, c, d, M[i], 7, -680876936); d = md5ff(d, a, b, c, M[i + 1], 12, -389564586);
        c = md5ff(c, d, a, b, M[i + 2], 17, 606105819); b = md5ff(b, c, d, a, M[i + 3], 22, -1044525330);
        a = md5ff(a, b, c, d, M[i + 4], 7, -176418897); d = md5ff(d, a, b, c, M[i + 5], 12, 1200080426);
        c = md5ff(c, d, a, b, M[i + 6], 17, -1473231341); b = md5ff(b, c, d, a, M[i + 7], 22, -45705983);
        a = md5ff(a, b, c, d, M[i + 8], 7, 1770035416); d = md5ff(d, a, b, c, M[i + 9], 12, -1958414417);
        c = md5ff(c, d, a, b, M[i + 10], 17, -42063); b = md5ff(b, c, d, a, M[i + 11], 22, -1990404162);
        a = md5ff(a, b, c, d, M[i + 12], 7, 1804603682); d = md5ff(d, a, b, c, M[i + 13], 12, -40341101);
        c = md5ff(c, d, a, b, M[i + 14], 17, -1502002290); b = md5ff(b, c, d, a, M[i + 15], 22, 1236535329);
        a = md5gg(a, b, c, d, M[i + 1], 5, -165796510); d = md5gg(d, a, b, c, M[i + 6], 9, -1069501632);
        c = md5gg(c, d, a, b, M[i + 11], 14, 643717713); b = md5gg(b, c, d, a, M[i], 20, -373897302);
        a = md5gg(a, b, c, d, M[i + 5], 5, -701558691); d = md5gg(d, a, b, c, M[i + 10], 9, 38016083);
        c = md5gg(c, d, a, b, M[i + 15], 14, -660478335); b = md5gg(b, c, d, a, M[i + 4], 20, -405537848);
        a = md5gg(a, b, c, d, M[i + 9], 5, 568446438); d = md5gg(d, a, b, c, M[i + 14], 9, -1019803690);
        c = md5gg(c, d, a, b, M[i + 3], 14, -187363961); b = md5gg(b, c, d, a, M[i + 8], 20, 1163531501);
        a = md5gg(a, b, c, d, M[i + 13], 5, -1444681467); d = md5gg(d, a, b, c, M[i + 2], 9, -51403784);
        c = md5gg(c, d, a, b, M[i + 7], 14, 1735328473); b = md5gg(b, c, d, a, M[i + 12], 20, -1926607734);
        a = md5hh(a, b, c, d, M[i + 5], 4, -378558); d = md5hh(d, a, b, c, M[i + 8], 11, -2022574463);
        c = md5hh(c, d, a, b, M[i + 11], 16, 1839030562); b = md5hh(b, c, d, a, M[i + 14], 23, -35309556);
        a = md5hh(a, b, c, d, M[i + 1], 4, -1530992060); d = md5hh(d, a, b, c, M[i + 4], 11, 1272893353);
        c = md5hh(c, d, a, b, M[i + 7], 16, -155497632); b = md5hh(b, c, d, a, M[i + 10], 23, -1094730640);
        a = md5hh(a, b, c, d, M[i + 13], 4, 681279174); d = md5hh(d, a, b, c, M[i], 11, -358537222);
        c = md5hh(c, d, a, b, M[i + 3], 16, -722521979); b = md5hh(b, c, d, a, M[i + 6], 23, 76029189);
        a = md5hh(a, b, c, d, M[i + 9], 4, -640364487); d = md5hh(d, a, b, c, M[i + 12], 11, -421815835);
        c = md5hh(c, d, a, b, M[i + 15], 16, 530742520); b = md5hh(b, c, d, a, M[i + 2], 23, -995338651);
        a = md5ii(a, b, c, d, M[i], 6, -198630844); d = md5ii(d, a, b, c, M[i + 7], 10, 1126891415);
        c = md5ii(c, d, a, b, M[i + 14], 15, -1416354905); b = md5ii(b, c, d, a, M[i + 5], 21, -57434055);
        a = md5ii(a, b, c, d, M[i + 12], 6, 1700485571); d = md5ii(d, a, b, c, M[i + 3], 10, -1894986606);
        c = md5ii(c, d, a, b, M[i + 10], 15, -1051523); b = md5ii(b, c, d, a, M[i + 1], 21, -2054922799);
        a = md5ii(a, b, c, d, M[i + 8], 6, 1873313359); d = md5ii(d, a, b, c, M[i + 15], 10, -30611744);
        c = md5ii(c, d, a, b, M[i + 6], 15, -1560198380); b = md5ii(b, c, d, a, M[i + 13], 21, 1309151649);
        a = md5ii(a, b, c, d, M[i + 4], 6, -145523070); d = md5ii(d, a, b, c, M[i + 11], 10, -1120210379);
        c = md5ii(c, d, a, b, M[i + 2], 15, 718787259); b = md5ii(b, c, d, a, M[i + 9], 21, -343485551);
        a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
    }
    const words = [a, b, c, d];
    return words.map(w => {
        let hex = '';
        for (let j = 0; j < 4; j++) {
            hex += ('0' + ((w >> (j * 8)) & 0xff).toString(16)).slice(-2);
        }
        return hex;
    }).join('');
}

export function hash(
    ctx: CFContext,
    hashType: string,
    str: string,
    callback?: CFCallback
) {
    // CF.Hash_MD5 ... are "HASH_MD5" ...: md5, sha1, sha256, sha384, sha512
    hashType = String(hashType).toLowerCase().replace(/^hash_/, '');
    if (hashType === 'md5') {
        // MD5 is not in Web Crypto — use pure-JS implementation
        const result = _md5(str);
        if (callback) callback(result);
        return;
    }

    // SHA variants via Web Crypto API
    const algoMap: Record<string, string> = {
        'sha1':   'SHA-1',
        'sha256': 'SHA-256',
        'sha384': 'SHA-384',
        'sha512': 'SHA-512',
    };
    const algo = algoMap[hashType];
    if (!algo) {
        console.warn(`CF.hash: Unknown hash type "${hashType}"`);
        if (callback) callback('');
        return;
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    crypto.subtle.digest(algo, data).then(buf => {
        const hex = Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        if (callback) callback(hex);
    }).catch(err => {
        console.error('CF.hash error:', err);
        if (callback) callback('');
    });
}

/** A URL: cf://host/file.gui loads that GUI (as iViewer does), anything else opens outside. */
export function openURL(
    ctx: CFContext,
    url: string
) {
    if (/^cf:\/\//i.test(String(url))) return loadGUI(ctx, url, {});
    window.open(url, "_blank");
}

/**
 * Another GUI - a URL, cf://host/file.gui, a name next to this one - or
 * this one again ('' / null), with CF.loadGUI's settings (startPage...).
 * The host does it (the preview: a new page with that GUI).
 */
export function loadGUI(
    ctx: CFContext,
    url: string,
    settings: any
) {
    const renderer = (ctx as any).renderer;
    if (/^profile:/i.test(String(url ?? ''))) {
        console.warn(`CF.loadGUI(${url}): iViewer 5 profiles are the device's own - not something the preview has`);
        return;
    }
    if (renderer?.loadGui) renderer.loadGui(String(url ?? ''), settings && typeof settings === 'object' ? settings : {});
    else console.log(`CF.loadGUI(${url}, ${JSON.stringify(settings)}): nothing here to load it`);
}

/**
 * A project file (an image the GUI uses, a page next to it): fetched from the
 * host, handed to `callback(data)` as text (CF.UTF8) or as a binary string,
 * one char per byte (CF.BINARY). Not found: `callback(null)`.
 */
export function loadAsset(
    ctx: CFContext,
    assetName: string,
    dataEncoding: string,
    callback?: CFCallback,
    cache?: string
) {
    const renderer = (ctx as any).renderer;
    const url: string = renderer?.resolveUrl ? renderer.resolveUrl(assetName) : assetName;
    fetch(url, cache === 'NOCACHE' ? { cache: 'no-store' } : undefined)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((buf) => {
            const bytes = new Uint8Array(buf);
            let data: string;
            if (dataEncoding === 'BINARY') {
                data = '';
                for (let i = 0; i < bytes.length; i += 0x8000) {
                    data += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000) as unknown as number[]);
                }
            } else {
                data = new TextDecoder().decode(bytes);
            }
            callback?.(data);
        })
        .catch((e) => {
            console.warn(`CF.loadAsset(${assetName}): ${e?.message ?? e}`);
            callback?.(null);
        });
}

export function setDeviceProperty(
    ctx: CFContext,
    property: string,
    value: any
) {
    console.log(`CF STUB: setDeviceProperty(${property}, ${value})`);
    ctx.dispatchEvent(ctx.DevicePropertyChangedEvent, property, value);
}

export function interceptHardwareKey(
    ctx: CFContext,
    key: string,
    intercept: boolean
) {
    console.log(`CF STUB: interceptHardwareKey(${key}, ${intercept})`);
}

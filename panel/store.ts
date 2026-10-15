/**
 * The GUIs kept on this device (IndexedDB), by the URL each came from: what
 * starts one without its server - a zipped GUI's archive, or a .gui's files -
 * and what tells the server's next version from it (its ETag, Last-Modified,
 * the .gui's text). The ones used last are kept (KEEP).
 */
export interface SavedGui {
  url: string;
  /** a zip archive: a zipped GUI as it came, iva serve's whole build ... */
  zip?: Uint8Array<ArrayBuffer>;
  /** ... or the files a .gui names, by their path beside it (the .gui among them) */
  files?: Record<string, Uint8Array<ArrayBuffer>>;
  /** a .gui's text as its server gave it: another text, another version */
  gui?: string;
  etag?: string;
  lastModified?: string;
  savedAt: number;
  bytes: number;
}

/** what's kept, without the files: for the settings page and to let the oldest go */
interface Kept {
  url: string;
  savedAt: number;
  usedAt: number;
  bytes: number;
}

const DB = 'iva-panel';
const GUIS = 'guis';
const KEPT = 'kept';
const KEEP = 4;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(GUIS, { keyPath: 'url' });
      req.result.createObjectStore(KEPT, { keyPath: 'url' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** one transaction over both stores: what `work` asks, once it's done */
async function run<T>(mode: IDBTransactionMode, work: (guis: IDBObjectStore, kept: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction([GUIS, KEPT], mode);
      const req = work(tx.objectStore(GUIS), tx.objectStore(KEPT));
      tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('aborted'));
    });
  } finally {
    db.close();
  }
}

export const savedGui = (url: string) => run<SavedGui | undefined>('readonly', (guis) => guis.get(url));

/** when it was saved and how large, if it is */
export const keptGui = (url: string) => run<Kept | undefined>('readonly', (_, kept) => kept.get(url));

/** keep it (the one before for its URL goes); the ones used longest ago beyond KEEP go too */
export async function saveGui(g: SavedGui) {
  const before = await keptGui(g.url);
  await run('readwrite', (guis, kept) => {
    guis.put(g);
    kept.put({ url: g.url, savedAt: g.savedAt, usedAt: before?.usedAt ?? Date.now(), bytes: g.bytes } satisfies Kept);
  });
  const all = await run<Kept[]>('readonly', (_, kept) => kept.getAll());
  const old = all.sort((a, b) => b.usedAt - a.usedAt).slice(KEEP);
  if (old.length) await run('readwrite', (guis, kept) => old.forEach((k) => (guis.delete(k.url), kept.delete(k.url))));
}

/** started from it (the ones used last are the ones kept) */
export async function usedGui(url: string) {
  const k = await keptGui(url);
  if (k) await run('readwrite', (_, kept) => void kept.put({ ...k, usedAt: Date.now() }));
}

export const forgetGui = (url: string) => run('readwrite', (guis, kept) => void (guis.delete(url), kept.delete(url)));

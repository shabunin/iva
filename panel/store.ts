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
export interface Kept {
  url: string;
  savedAt: number;
  usedAt: number;
  bytes: number;
}

/**
 * A GUI's files unpacked from its archive - the size this screen runs, as
 * Blobs - so the next start doesn't unzip it again: none of the archive in
 * the page's memory, each file read when something asks for it.
 */
export interface Unpacked {
  url: string;
  /** what it was unpacked from (the archive's version) and for which screen: another, unpacked again */
  key: string;
  title: string;
  guiXml: string;
  scriptMap: Record<string, string>;
  missingScripts: string[];
  /** where the .gui and its image folder are in the archive */
  dir: string;
  imageRoot: string;
  /** the images the .gui names: the file each is (a path in files) - '' for one only in a sheet */
  images: Record<string, string>;
  /** its images in sheets (iva-atlas/): the sheets' paths in files, each image's frame */
  atlas?: { files: string[]; frames: Record<string, [number, number, number, number, number]> };
  /** the size's files by their path in the archive */
  files: Record<string, Blob>;
  savedAt: number;
}

const DB = 'iva-panel';
const GUIS = 'guis';
const KEPT = 'kept';
const UNPACKED = 'unpacked';
const KEEP = 4;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const have = req.result.objectStoreNames;
      for (const name of [GUIS, KEPT, UNPACKED]) if (!have.contains(name)) req.result.createObjectStore(name, { keyPath: 'url' });
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

/** every GUI kept, the one used last first */
export const keptGuis = async () => (await run<Kept[]>('readonly', (_, kept) => kept.getAll())).sort((a, b) => b.usedAt - a.usedAt);

export const forgetGui = (url: string) => run('readwrite', (guis, kept) => void (guis.delete(url), kept.delete(url)));

export const forgetAllGuis = () => run('readwrite', (guis, kept) => void (guis.clear(), kept.clear()));

/** one transaction over the unpacked files */
async function unpackedStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(UNPACKED, mode);
      const req = work(tx.objectStore(UNPACKED));
      tx.oncomplete = () => resolve(req ? req.result : (undefined as T));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('aborted'));
    });
  } finally {
    db.close();
  }
}

/** a GUI's files unpacked, if they're the ones `key` names (that archive, this screen) */
export async function unpackedGui(url: string, key: string): Promise<Unpacked | undefined> {
  const u = await unpackedStore<Unpacked | undefined>('readonly', (s) => s.get(url));
  return u?.key === key ? u : undefined;
}

/** keep a GUI's files unpacked (the ones before for its URL go) */
export const saveUnpacked = (u: Unpacked) => unpackedStore('readwrite', (s) => void s.put(u));

export const forgetUnpacked = (url: string) => unpackedStore('readwrite', (s) => void s.delete(url));

export const forgetAllUnpacked = () => unpackedStore('readwrite', (s) => void s.clear());

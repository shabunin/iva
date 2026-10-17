/**
 * matter.js's storage on persisted tokens: everything it keeps (its
 * certificate authority, the fabric, the nodes it commissioned) as one
 * JSON, in memory while it runs and written a second after a change -
 * base64 (a token's value goes through iViewer's token and math substitution:
 * brackets and braces wouldn't come back as they went), split into chunks
 * of `size` chars over `chunks` tokens <prefix>0 ... (the project declares
 * them, persist="1"). Read back at the start from CF.getJoin's tokens.
 */

import { MemoryStorageDriver, Seconds, StorageDriver, StorageError, Time, fromJson, toJson, type DataNamespace, type SupportedStorageTypes } from '@matter/general';
import type { CF } from './cf.js';

export interface TokenStoreOptions {
  prefix: string;
  chunks: number;
  size: number;
}

type Data = Record<string, Record<string, SupportedStorageTypes>>;

const utf8 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (let i = 0; i < bytes.length; i += 4096) out += String.fromCharCode(...bytes.subarray(i, i + 4096));
  return out;
};
const fromUtf8 = (s: string): string => new TextDecoder().decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));

/** the whole store (every namespace) in the tokens */
export class TokenStore {
  /** namespace -> its data (the drivers write into these objects) */
  readonly all: Record<string, Data> = {};
  private loaded?: Promise<void>;
  /** the last text written: not written again */
  private written?: string;

  constructor(private cf: CF, readonly options: TokenStoreOptions, private log: (m: string) => void = () => {}) {}

  tokenName(i: number): string {
    return `[${this.options.prefix}${i}]`;
  }

  /** what the tokens hold, once */
  load(): Promise<void> {
    if (!this.loaded) {
      this.loaded = new Promise((resolve) => {
        this.cf.getJoin(this.cf.GlobalTokensJoin, (_j, _v, tokens) => {
          const t = tokens ?? {};
          let text = '';
          for (let i = 0; i < this.options.chunks; i++) {
            const chunk = t[this.tokenName(i)] ?? t[`${this.options.prefix}${i}`] ?? '';
            if (!chunk) break;
            text += chunk;
          }
          this.written = text;
          if (text) {
            try {
              const data = fromJson(fromUtf8(atob(text))) as Record<string, Data>;
              for (const [ns, d] of Object.entries(data)) this.all[ns] = d;
              this.log(`storage: ${text.length} chars read from ${Math.ceil(text.length / this.options.size)} token(s): ${Object.keys(data).join(', ')}`);
            } catch (e) {
              this.log(`storage: the tokens hold no store (${e}): starting empty`);
            }
          }
          resolve();
        });
      });
    }
    return this.loaded;
  }

  /** the namespace's data (loaded first) */
  async open(namespace: string): Promise<Data> {
    await this.load();
    return (this.all[namespace] ??= {});
  }

  /** everything to the tokens */
  save(): void {
    const text = btoa(utf8(toJson(this.all)));
    if (text === this.written) return;
    const { chunks, size } = this.options;
    if (text.length > chunks * size) {
      throw new StorageError(`storage: ${text.length} chars don't fit ${chunks} tokens of ${size} (<Matter store={{ chunks, size }}>)`);
    }
    for (let i = 0; i < chunks; i++) this.cf.setToken(this.cf.GlobalTokensJoin, this.tokenName(i), text.slice(i * size, (i + 1) * size));
    this.written = text;
    this.log(`storage: ${text.length} chars in ${Math.ceil(text.length / size)} token(s)`);
  }
}

/** a matter.js StorageDriver over the TokenStore: in memory, written a second after a change */
export class CfTokenStorageDriver extends StorageDriver {
  static readonly id = 'cf-tokens';
  /** the store the drivers share (set before the StorageService opens anything) */
  static store?: TokenStore;

  static async create(namespace: DataNamespace): Promise<CfTokenStorageDriver> {
    if (!CfTokenStorageDriver.store) throw new StorageError('no token store: CfTokenStorageDriver.store first');
    const driver = new CfTokenStorageDriver(CfTokenStorageDriver.store, namespace.namespace);
    await driver.initialize();
    return driver;
  }

  #store = new MemoryStorageDriver();
  #initialized = false;
  #closed = false;
  readonly #timer = Time.getTimer('cf-tokens storage commit', Seconds(1), () => this.commit());

  constructor(private tokens: TokenStore, readonly namespace: string) {
    super();
  }

  override get initialized(): boolean {
    return this.#initialized;
  }

  override async initialize(): Promise<void> {
    if (this.#initialized) throw new StorageError('Storage already initialized!');
    this.#store = new MemoryStorageDriver(await this.tokens.open(this.namespace));
    this.#store.initialize();
    this.#initialized = true;
  }

  private changed(): void {
    if (!this.#timer.isRunning) this.#timer.start();
  }

  override get(contexts: string[], key: string) {
    return this.#store.get(contexts, key);
  }

  override set(contexts: string[], values: Record<string, SupportedStorageTypes>): void;
  override set(contexts: string[], key: string, value: SupportedStorageTypes): void;
  override set(contexts: string[], keyOrValues: string | Record<string, SupportedStorageTypes>, value?: SupportedStorageTypes): void {
    this.#store.set(contexts, keyOrValues as string, value as SupportedStorageTypes);
    this.changed();
  }

  override delete(contexts: string[], key: string): void {
    this.#store.delete(contexts, key);
    this.changed();
  }

  override keys(contexts: string[]): string[] {
    return this.#store.keys(contexts);
  }

  override values(contexts: string[]): Record<string, SupportedStorageTypes> {
    return this.#store.values(contexts);
  }

  override contexts(contexts: string[]): string[] {
    return this.#store.contexts(contexts);
  }

  override clearAll(contexts: string[]): void {
    this.#store.clearAll(contexts);
    this.changed();
  }

  /** what changed, to the tokens (now) */
  commit(): void {
    if (this.#timer.isRunning) this.#timer.stop();
    if (!this.#initialized || this.#closed) return;
    try {
      this.tokens.save();
    } catch (e) {
      // (kept in memory: the next change tries again)
      (this.tokens as unknown as { log: (m: string) => void }).log(String(e));
    }
  }

  override async close(): Promise<void> {
    this.commit();
    await this.#store.close();
    this.#closed = true;
  }
}

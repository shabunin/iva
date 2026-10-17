/**
 * matter.js's Environment on the panel: the Network over the slot pool, DNS-SD
 * from CF.startLookup, storage on persisted tokens, its log to CF.log. Crypto
 * (StandardCrypto: Web Crypto plus matter.js's own AES-CCM) and Time
 * (StandardTime) install themselves where crypto.subtle exists.
 */

import './polyfills.js';
import { Crypto, Entropy, Environment, Logger, Network, StandardCrypto, StorageService } from '@matter/general';
import type { CF } from './cf.js';
import { CfMdnsService, CfMdnsSocket } from './mdns.js';
import { CfNetwork } from './network.js';
import { SlotPool } from './slots.js';
import { CfTokenStorageDriver, TokenStore, type TokenStoreOptions } from './storage.js';

export interface EnvironmentOptions {
  /** the pool's systems (matter0 ...) and their local ports */
  slots: string[];
  localPorts: number[];
  ipv6: boolean;
  store: TokenStoreOptions;
  /** matter.js's log level (default info) */
  log?: string;
}

export interface MatterEnvironment {
  env: Environment;
  pool: SlotPool;
  network: CfNetwork;
  mdns: CfMdnsSocket;
  store: TokenStore;
  log: (m: string) => void;
}

let logging = false;

/** matter.js's log through CF.log, once */
export function logToCf(cf: CF, level = 'info'): void {
  Logger.format = 'plain';
  Logger.level = level;
  if (logging) return;
  logging = true;
  const dest = Logger.destinations.default;
  dest.write = (text: string) => cf.log(text);
}

/**
 * Crypto and entropy for an environment, when it has none: matter.js's
 * StandardCrypto over Web Crypto (crypto.subtle: what the probe checks
 * first) with its own AES-CCM. (StandardTime installs itself.)
 */
export function installPlatform(env: Environment): void {
  if (!env.has(Crypto)) env.set(Crypto, new StandardCrypto());
  if (!env.has(Entropy)) env.set(Entropy, env.get(Crypto));
}

/** the driver's environment: the panel's default one, or the one given (a test's, beside a device's) */
export function createEnvironment(cf: CF, options: EnvironmentOptions, env: Environment = Environment.default): MatterEnvironment {
  const log = (m: string) => cf.log(`matter: ${m}`);
  logToCf(cf, options.log);
  installPlatform(env);
  const pool = new SlotPool(cf, options.slots, options.localPorts, log);
  const network = new CfNetwork(cf, pool, options.ipv6);
  env.set(Network, network);
  const mdns = new CfMdnsSocket(cf, network, { ipv6: options.ipv6, log });
  new CfMdnsService(env, mdns);
  const store = new TokenStore(cf, options.store, log);
  CfTokenStorageDriver.store = store;
  const storage = env.get(StorageService);
  storage.registerDriver(CfTokenStorageDriver);
  storage.defaultDriver = CfTokenStorageDriver.id;
  return { env, pool, network, mdns, store, log };
}

import { Address, MaybePromise } from '../types';

/**
 * @interface StaleCacheEntry
 * @description Entry returned by `Cache.getStale`, including staleness metadata.
 */
export interface StaleCacheEntry {
  value: Address;
  isStale: boolean;
  /** Age of the entry in milliseconds, when the cache implementation can compute it. */
  ageMs?: number;
}

/**
 * @interface Cache
 * @description Defines the contract for a cache implementation. Every method may be
 * implemented synchronously or asynchronously (returning a Promise) — `CepLookup`
 * awaits every call, so both styles are supported transparently.
 */
export interface Cache {
  get(key: string): MaybePromise<Address | undefined>;
  set(key: string, value: Address): MaybePromise<void>;
  clear(): MaybePromise<void>;
  delete?(key: string): MaybePromise<void>;
  has?(key: string): MaybePromise<boolean>;
  /**
   * Optional: returns the entry for `key` even if it has expired, along with
   * staleness metadata. Used to support the `staleIfError` option.
   */
  getStale?(key: string): MaybePromise<StaleCacheEntry | undefined>;
}

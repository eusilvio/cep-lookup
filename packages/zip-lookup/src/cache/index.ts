import { ZipAddress, MaybePromise } from '../types';

/**
 * @interface StaleCacheEntry
 * @description Entry returned by `ZipCache.getStale`, including staleness metadata.
 */
export interface StaleCacheEntry {
  value: ZipAddress;
  isStale: boolean;
  /** Age of the entry in milliseconds, when the cache implementation can compute it. */
  ageMs?: number;
}

/**
 * @interface ZipCache
 * @description Defines the contract for a cache implementation. Every method may be
 * implemented synchronously or asynchronously (returning a Promise) — `ZipLookup`
 * awaits every call, so both styles are supported transparently.
 */
export interface ZipCache {
  get(key: string): MaybePromise<ZipAddress | undefined>;
  set(key: string, value: ZipAddress): MaybePromise<void>;
  clear(): MaybePromise<void>;
  delete?(key: string): MaybePromise<void>;
  has?(key: string): MaybePromise<boolean>;
  /**
   * Optional: returns the entry for `key` even if it has expired, along with
   * staleness metadata. Used to support the `staleIfError` option.
   */
  getStale?(key: string): MaybePromise<StaleCacheEntry | undefined>;
}

interface CacheEntry {
  value: ZipAddress;
  timestamp: number;
}

export interface InMemoryCacheOptions {
  /** Time-to-live in milliseconds. Default: Infinity (no expiry) */
  ttl?: number;
  /** Maximum number of entries. Default: Infinity (no limit) */
  maxSize?: number;
}

export class InMemoryCache implements ZipCache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;
  private maxSize: number;

  constructor(options?: InMemoryCacheOptions) {
    this.ttl = options?.ttl ?? Infinity;
    this.maxSize = options?.maxSize ?? Infinity;
  }

  private isExpired(entry: CacheEntry): boolean {
    return this.ttl !== Infinity && Date.now() - entry.timestamp > this.ttl;
  }

  get(key: string): ZipAddress | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (this.isExpired(entry)) return undefined;
    return entry.value;
  }

  /**
   * Returns the entry for `key` even if expired, with `isStale` metadata.
   * Unlike `get()`, this never evicts the entry, so it keeps working as a
   * fallback source for `staleIfError`.
   */
  getStale(key: string): StaleCacheEntry | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    return {
      value: entry.value,
      isStale: this.isExpired(entry),
      ageMs: Date.now() - entry.timestamp,
    };
  }

  set(key: string, value: ZipAddress): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    return !this.isExpired(entry);
  }

  clear(): void {
    this.cache.clear();
  }
}

import { Address } from '../../types';
import { KeyValueCache, KeyValueCacheOptions, KeyValueDriver, decodeEntry } from '../kv';

/**
 * @interface WebStorageLike
 * @description Structural subset of the DOM `Storage` API used by this adapter.
 * Declared locally so the library keeps compiling without DOM lib types, and so
 * any compatible polyfill (or a fake in tests) can be injected.
 */
export interface WebStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebStorageCacheOptions extends KeyValueCacheOptions {
  /**
   * Storage to write to. Defaults to `globalThis.localStorage`; pass
   * `sessionStorage` for a per-tab cache, or a polyfill outside the browser.
   */
  storage?: WebStorageLike;
  /**
   * Maximum number of entries kept. The oldest entries are evicted first.
   * Default: 500 — Web Storage is a shared ~5 MB budget, so an unbounded cache
   * would eventually break unrelated code on the same origin.
   */
  maxSize?: number;
}

/** Fraction of entries dropped when the store rejects a write for lack of space. */
const QUOTA_EVICTION_RATIO = 0.2;

function detectStorage(): WebStorageLike | undefined {
  const candidate = (globalThis as { localStorage?: WebStorageLike }).localStorage;
  if (!candidate || typeof candidate.getItem !== 'function') return undefined;
  return candidate;
}

/**
 * @class WebStorageDriver
 * @description `KeyValueDriver` over a synchronous `Storage`. Knows how to free
 * space, because Web Storage is the one backend that answers "quota exceeded"
 * instead of evicting on its own.
 */
export class WebStorageDriver implements KeyValueDriver {
  constructor(private readonly storage: WebStorageLike, private readonly prefix: string) {}

  get(key: string): string | null {
    return this.storage.getItem(key);
  }

  set(key: string, value: string): void {
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      // Out of space: drop the oldest slice of our own entries and try once more.
      // Failing twice is a real error and propagates to the cache's onError hook.
      const owned = this.ownedEntries();
      const toDrop = Math.max(1, Math.ceil(owned.length * QUOTA_EVICTION_RATIO));
      this.evictOldest(owned, toDrop);
      if (owned.length === 0) throw error;
      this.storage.setItem(key, value);
    }
  }

  delete(key: string): void {
    this.storage.removeItem(key);
  }

  keys(): string[] {
    const found: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key !== null && key.startsWith(this.prefix)) found.push(key);
    }
    return found;
  }

  /** Owned entries paired with their write timestamp, oldest first. */
  ownedEntries(): Array<{ key: string; timestamp: number }> {
    const entries: Array<{ key: string; timestamp: number }> = [];
    for (const key of this.keys()) {
      const raw = this.storage.getItem(key);
      const decoded = raw === null ? undefined : decodeEntry(raw);
      // Undecodable payloads under our prefix are treated as ancient, so they
      // are the first thing evicted.
      entries.push({ key, timestamp: decoded?.timestamp ?? 0 });
    }
    return entries.sort((a, b) => a.timestamp - b.timestamp);
  }

  evictOldest(sortedEntries: Array<{ key: string; timestamp: number }>, count: number): void {
    for (const entry of sortedEntries.slice(0, count)) {
      this.storage.removeItem(entry.key);
    }
  }
}

/**
 * @class WebStorageCache
 * @description Cache backed by `localStorage`/`sessionStorage`, so a page reload
 * no longer throws away every resolved CEP. Survives quota pressure by evicting
 * its own oldest entries, and never touches keys outside its namespace.
 *
 * @example
 * const cep = new CepLookup({
 *   providers,
 *   cache: new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300 }),
 *   staleIfError: true,
 * });
 */
export class WebStorageCache extends KeyValueCache {
  private readonly webDriver: WebStorageDriver;
  private readonly maxSize: number;

  constructor(options?: WebStorageCacheOptions) {
    const storage = options?.storage ?? detectStorage();
    if (!storage) {
      throw new Error(
        'WebStorageCache: no Web Storage available. Pass `storage` explicitly (e.g. sessionStorage or a polyfill) when running outside the browser.'
      );
    }
    const namespace = options?.namespace ?? 'cep-lookup';
    const driver = new WebStorageDriver(storage, `${namespace}:`);
    super(driver, { ...options, namespace });
    this.webDriver = driver;
    this.maxSize = options?.maxSize ?? 500;
  }

  async set(key: string, value: Address): Promise<void> {
    await super.set(key, value);
    if (this.maxSize === Infinity) return;
    await this.guard('set', () => {
      const owned = this.webDriver.ownedEntries();
      if (owned.length <= this.maxSize) return;
      this.webDriver.evictOldest(owned, owned.length - this.maxSize);
    });
  }
}

import { Address, MaybePromise } from '../types';
import { Cache, StaleCacheEntry } from './types';

/**
 * Serialized envelope written to the underlying store. Versioned so a future
 * format change can be detected (and ignored) instead of crashing on old data.
 */
interface Envelope {
  /** Envelope version. */
  v: 1;
  /** Epoch millis when the entry was written. */
  t: number;
  /** The cached address. */
  a: Address;
}

/**
 * @function encodeEntry
 * @description Serializes an address plus its write timestamp into the string
 * form every key-value driver stores.
 */
export function encodeEntry(value: Address, timestamp: number): string {
  const envelope: Envelope = { v: 1, t: timestamp, a: value };
  return JSON.stringify(envelope);
}

/**
 * @function decodeEntry
 * @description Parses a stored string back into an address plus its timestamp.
 * Returns `undefined` for anything that is not a valid envelope — corrupt JSON,
 * a future format, or an unrelated key written by other code sharing the store.
 */
export function decodeEntry(raw: string): { value: Address; timestamp: number } | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== 'object') return undefined;
  const envelope = parsed as Partial<Envelope>;
  if (envelope.v !== 1 || typeof envelope.t !== 'number' || !envelope.a || typeof envelope.a !== 'object') {
    return undefined;
  }
  return { value: envelope.a as Address, timestamp: envelope.t };
}

/**
 * @interface KeyValueDriver
 * @description Minimal contract every backing store must satisfy. Drivers only
 * move opaque strings around — TTL, staleness and namespacing live in
 * `KeyValueCache`, so a new backend is ~30 lines.
 */
export interface KeyValueDriver {
  /** Reads a raw entry. Missing keys return `null`/`undefined`. */
  get(key: string): MaybePromise<string | null | undefined>;
  /**
   * Writes a raw entry. `evictAfterMs`, when given, is a *physical* expiry hint
   * for stores that support one (Redis, Cloudflare KV); logical TTL is still
   * enforced by `KeyValueCache`.
   */
  set(key: string, value: string, evictAfterMs?: number): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
  /** Optional: every namespaced key currently held. Enables `clear()`. */
  keys?(): MaybePromise<string[]>;
  /** Optional: a native bulk wipe, preferred over deleting `keys()` one by one. */
  clear?(): MaybePromise<void>;
}

export interface KeyValueCacheOptions {
  /** Logical time-to-live in milliseconds. Default: Infinity (no expiry). */
  ttl?: number;
  /** Key prefix isolating this cache inside a shared store. Default: `"cep-lookup"`. */
  namespace?: string;
  /**
   * Physical expiry handed to stores that support one (Redis `PX`, Cloudflare KV
   * `expirationTtl`). Keep it comfortably above `ttl` so `staleIfError` still has
   * something to serve. Default: undefined (entries are never dropped by the store).
   */
  evictAfter?: number;
  /**
   * Called when the backing store throws. A cache failure must never break a
   * lookup, so every error is swallowed after this hook runs.
   * Default: swallow silently.
   */
  onError?: (error: Error, operation: string) => void;
}

/**
 * @class KeyValueCache
 * @description `Cache` implementation over any string key-value store. Handles
 * serialization, namespacing, logical TTL, `getStale` semantics and error
 * isolation, so drivers stay trivial.
 *
 * All methods are async: the backing stores are. `CepLookup` awaits every cache
 * call, so this is transparent to `lookup()`.
 */
export class KeyValueCache implements Cache {
  protected readonly driver: KeyValueDriver;
  protected readonly ttl: number;
  protected readonly namespace: string;
  protected readonly evictAfter?: number;
  private readonly onError?: (error: Error, operation: string) => void;

  constructor(driver: KeyValueDriver, options?: KeyValueCacheOptions) {
    this.driver = driver;
    this.ttl = options?.ttl ?? Infinity;
    this.namespace = options?.namespace ?? 'cep-lookup';
    this.evictAfter = options?.evictAfter;
    this.onError = options?.onError;
  }

  /** Namespaced storage key for a CEP. */
  protected keyFor(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /** True when a namespaced key belongs to this cache. */
  protected ownsKey(storageKey: string): boolean {
    return storageKey.startsWith(`${this.namespace}:`);
  }

  private isExpired(timestamp: number): boolean {
    return this.ttl !== Infinity && Date.now() - timestamp > this.ttl;
  }

  /** Runs a store operation, reporting and swallowing any failure. */
  protected async guard<T>(operation: string, fn: () => MaybePromise<T>): Promise<T | undefined> {
    try {
      return await fn();
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)), operation);
      return undefined;
    }
  }

  private async read(key: string): Promise<{ value: Address; timestamp: number } | undefined> {
    const raw = await this.guard('get', () => this.driver.get(this.keyFor(key)));
    if (raw === undefined || raw === null) return undefined;
    const entry = decodeEntry(raw);
    if (!entry) {
      // Corrupt or foreign payload: drop it so it stops costing a read.
      await this.guard('delete', () => this.driver.delete(this.keyFor(key)));
      return undefined;
    }
    return entry;
  }

  async get(key: string): Promise<Address | undefined> {
    const entry = await this.read(key);
    if (!entry) return undefined;
    if (this.isExpired(entry.timestamp)) return undefined;
    return entry.value;
  }

  /**
   * Returns the entry even if expired, with `isStale` metadata. Never evicts,
   * so it keeps working as a fallback source for `staleIfError`.
   */
  async getStale(key: string): Promise<StaleCacheEntry | undefined> {
    const entry = await this.read(key);
    if (!entry) return undefined;
    return {
      value: entry.value,
      isStale: this.isExpired(entry.timestamp),
      ageMs: Date.now() - entry.timestamp,
    };
  }

  async set(key: string, value: Address): Promise<void> {
    const raw = encodeEntry(value, Date.now());
    await this.guard('set', () => this.driver.set(this.keyFor(key), raw, this.evictAfter));
  }

  async delete(key: string): Promise<void> {
    await this.guard('delete', () => this.driver.delete(this.keyFor(key)));
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  /**
   * Removes every entry owned by this cache. Uses the driver's native wipe when
   * available, otherwise deletes the namespaced keys one by one. Drivers that
   * expose neither report an error through `onError` and leave the store intact.
   */
  async clear(): Promise<void> {
    if (this.driver.clear) {
      await this.guard('clear', () => this.driver.clear!());
      return;
    }
    if (this.driver.keys) {
      const keys = await this.guard('clear', () => this.driver.keys!());
      if (!keys) return;
      for (const storageKey of keys) {
        if (!this.ownsKey(storageKey)) continue;
        await this.guard('clear', () => this.driver.delete(storageKey));
      }
      return;
    }
    this.onError?.(
      new Error('clear() is not supported: the driver exposes neither clear() nor keys()'),
      'clear'
    );
  }
}

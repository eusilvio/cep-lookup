
import { Address } from '../types';

/**
 * @interface Cache
 * @description Defines the contract for a cache implementation.
 */
export interface Cache {
  get(key: string): Address | undefined;
  set(key: string, value: Address): void;
  clear(): void;
  delete?(key: string): void;
  has?(key: string): boolean;
}

interface CacheEntry {
  value: Address;
  timestamp: number;
}

export interface InMemoryCacheOptions {
  /** Time-to-live in milliseconds. Default: Infinity (no expiry) */
  ttl?: number;
  /** Maximum number of entries. Default: Infinity (no limit) */
  maxSize?: number;
}

/**
 * @class InMemoryCache
 * @description In-memory cache with optional TTL and size limit.
 */
export class InMemoryCache implements Cache {
  private cache = new Map<string, CacheEntry>();
  private ttl: number;
  private maxSize: number;

  constructor(options?: InMemoryCacheOptions) {
    this.ttl = options?.ttl ?? Infinity;
    this.maxSize = options?.maxSize ?? Infinity;
  }

  get(key: string): Address | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (this.ttl !== Infinity && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: Address): void {
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
    if (!this.cache.has(key)) return false;
    const entry = this.cache.get(key)!;
    if (this.ttl !== Infinity && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.cache.clear();
  }
}

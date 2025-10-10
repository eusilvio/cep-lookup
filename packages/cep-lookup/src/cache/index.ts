
import { Address } from '../types';

/**
 * @interface Cache
 * @description Defines the contract for a cache implementation.
 */
export interface Cache {
  get(key: string): Address | undefined;
  set(key: string, value: Address): void;
  clear(): void;
}

/**
 * @class InMemoryCache
 * @description A simple in-memory cache implementation for storing CEP lookups.
 */
export class InMemoryCache implements Cache {
  private cache = new Map<string, Address>();

  /**
   * @method get
   * @description Retrieves an address from the cache.
   * @param {string} key - The CEP to look up.
   * @returns {Address | undefined} The cached address or undefined if not found.
   */
  get(key: string): Address | undefined {
    return this.cache.get(key);
  }

  /**
   * @method set
   * @description Stores an address in the cache.
   * @param {string} key - The CEP to use as the cache key.
   * @param {Address} value - The address to store.
   */
  set(key: string, value: Address): void {
    this.cache.set(key, value);
  }

  /**
   * @method clear
   * @description Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }
}

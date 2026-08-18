import { KeyValueCache, KeyValueCacheOptions, KeyValueDriver } from '../kv';

/**
 * @interface KVNamespaceLike
 * @description Structural subset of a Cloudflare Workers KV binding. Declared
 * locally so the library depends on no Workers types.
 */
export interface KVNamespaceLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  /** Optional: used by `clear()`. */
  list?(options?: { prefix?: string; cursor?: string }): Promise<{
    keys: Array<{ name: string }>;
    list_complete?: boolean;
    cursor?: string;
  }>;
}

export interface CloudflareKVCacheOptions extends KeyValueCacheOptions {
  /** The KV binding from the Worker environment (e.g. `env.CEP_CACHE`). */
  namespaceBinding: KVNamespaceLike;
}

/** Cloudflare rejects any `expirationTtl` below 60 seconds. */
const MIN_EXPIRATION_TTL_SECONDS = 60;

/**
 * @class CloudflareKVDriver
 * @description `KeyValueDriver` over a Workers KV binding.
 */
export class CloudflareKVDriver implements KeyValueDriver {
  constructor(private readonly kv: KVNamespaceLike, private readonly prefix: string) {}

  async get(key: string): Promise<string | null> {
    return this.kv.get(key);
  }

  async set(key: string, value: string, evictAfterMs?: number): Promise<void> {
    if (evictAfterMs === undefined) {
      await this.kv.put(key, value);
      return;
    }
    const expirationTtl = Math.max(MIN_EXPIRATION_TTL_SECONDS, Math.ceil(evictAfterMs / 1000));
    await this.kv.put(key, value, { expirationTtl });
  }

  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  async keys(): Promise<string[]> {
    if (!this.kv.list) {
      throw new Error('CloudflareKVCache.clear() requires a binding exposing list()');
    }
    const found: string[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.kv.list({ prefix: this.prefix, cursor });
      found.push(...page.keys.map((entry) => entry.name));
      if (page.list_complete !== false || !page.cursor) break;
      cursor = page.cursor;
    }
    return found;
  }
}

/**
 * @class CloudflareKVCache
 * @description Edge cache for Workers: a CEP resolved in one colo is served from
 * KV everywhere else, with no origin round-trip.
 *
 * KV enforces a 60 s minimum physical expiry, so `evictAfter` is clamped upward.
 * Logical `ttl` has no such floor.
 *
 * @example
 * export default {
 *   async fetch(request, env) {
 *     const cep = new CepLookup({
 *       providers,
 *       cache: new CloudflareKVCache({
 *         namespaceBinding: env.CEP_CACHE,
 *         ttl: 24 * 60 * 60_000,
 *         evictAfter: 30 * 24 * 60 * 60_000,
 *       }),
 *     });
 *     // ...
 *   },
 * };
 */
export class CloudflareKVCache extends KeyValueCache {
  constructor(options: CloudflareKVCacheOptions) {
    const namespace = options.namespace ?? 'cep-lookup';
    super(new CloudflareKVDriver(options.namespaceBinding, `${namespace}:`), {
      ...options,
      namespace,
    });
  }
}

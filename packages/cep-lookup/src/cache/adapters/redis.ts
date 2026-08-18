import { KeyValueCache, KeyValueCacheOptions, KeyValueDriver } from '../kv';

/**
 * @interface RedisLikeClient
 * @description Structural subset of a Redis client. Satisfied as-is by `ioredis`,
 * `node-redis` v4+ and `@upstash/redis`, so the adapter needs no dependency and
 * no wrapper on the caller's side.
 */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: any[]): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** Optional: used by `clear()` when `scan` is unavailable. O(n) — avoid in production. */
  keys?(pattern: string): Promise<string[]>;
  /** Optional: preferred by `clear()`; cursor-based and safe on large keyspaces. */
  scan?(cursor: any, ...args: any[]): Promise<any>;
}

/**
 * How the client wants an expiry passed to `SET`.
 * - `variadic`: `set(key, value, 'PX', ms)` — ioredis
 * - `options`: `set(key, value, { PX: ms })` — node-redis, @upstash/redis
 */
export type RedisSetDialect = 'variadic' | 'options';

export interface RedisCacheOptions extends KeyValueCacheOptions {
  /** Connected Redis client. */
  client: RedisLikeClient;
  /**
   * Expiry dialect. Default: auto-detected on the first write that needs one,
   * by trying `variadic` and falling back to `options`.
   */
  dialect?: RedisSetDialect;
  /** Keys fetched per `SCAN` iteration during `clear()`. Default: 100. */
  scanCount?: number;
}

/** Normalizes the two shapes `SCAN` replies come in. */
function parseScanReply(reply: any): { cursor: string; keys: string[] } {
  if (Array.isArray(reply)) {
    return { cursor: String(reply[0]), keys: (reply[1] as string[]) ?? [] };
  }
  return { cursor: String(reply?.cursor ?? '0'), keys: reply?.keys ?? [] };
}

/**
 * @class RedisDriver
 * @description `KeyValueDriver` over a Redis-like client, tolerating the dialect
 * differences between the major clients.
 */
export class RedisDriver implements KeyValueDriver {
  private dialect?: RedisSetDialect;

  constructor(
    private readonly client: RedisLikeClient,
    private readonly pattern: string,
    private readonly scanCount: number,
    dialect?: RedisSetDialect
  ) {
    this.dialect = dialect;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, evictAfterMs?: number): Promise<void> {
    if (evictAfterMs === undefined) {
      await this.client.set(key, value);
      return;
    }
    const px = Math.max(1, Math.round(evictAfterMs));
    if (this.dialect === 'options') {
      await this.client.set(key, value, { PX: px });
      return;
    }
    try {
      await this.client.set(key, value, 'PX', px);
      this.dialect = 'variadic';
    } catch (error) {
      if (this.dialect === 'variadic') throw error;
      // node-redis and @upstash/redis reject the variadic form; remember the
      // working dialect so this costs one failed call per process, not per write.
      await this.client.set(key, value, { PX: px });
      this.dialect = 'options';
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async keys(): Promise<string[]> {
    if (this.client.scan) {
      const found: string[] = [];
      let cursor: string = '0';
      do {
        const reply = await this.client.scan(cursor, 'MATCH', this.pattern, 'COUNT', this.scanCount);
        const parsed = parseScanReply(reply);
        cursor = parsed.cursor;
        found.push(...parsed.keys);
      } while (cursor !== '0');
      return found;
    }
    if (this.client.keys) {
      return this.client.keys(this.pattern);
    }
    throw new Error('RedisCache.clear() requires a client exposing scan() or keys()');
  }
}

/**
 * @class RedisCache
 * @description Shared, cross-process cache for server-side lookups: every
 * instance of your API hits the providers once for a given CEP instead of once
 * per process. Implements `getStale`, so `staleIfError` keeps serving addresses
 * while every provider is down.
 *
 * @example
 * import Redis from 'ioredis';
 * const cep = new CepLookup({
 *   providers,
 *   cache: new RedisCache({
 *     client: new Redis(process.env.REDIS_URL),
 *     ttl: 7 * 24 * 60 * 60_000,   // logical freshness
 *     evictAfter: 30 * 24 * 60 * 60_000, // physical expiry, leaves room for stale reads
 *   }),
 *   staleIfError: true,
 * });
 */
export class RedisCache extends KeyValueCache {
  constructor(options: RedisCacheOptions) {
    const namespace = options.namespace ?? 'cep-lookup';
    super(
      new RedisDriver(options.client, `${namespace}:*`, options.scanCount ?? 100, options.dialect),
      { ...options, namespace }
    );
  }
}

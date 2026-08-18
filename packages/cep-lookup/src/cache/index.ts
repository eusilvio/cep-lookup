export type { Cache, StaleCacheEntry } from './types';
export { InMemoryCache } from './in-memory';
export type { InMemoryCacheOptions } from './in-memory';

export { KeyValueCache, encodeEntry, decodeEntry } from './kv';
export type { KeyValueDriver, KeyValueCacheOptions } from './kv';

export { WebStorageCache, WebStorageDriver } from './adapters/web-storage';
export type { WebStorageCacheOptions, WebStorageLike } from './adapters/web-storage';

export { IndexedDBCache, IndexedDBDriver } from './adapters/indexeddb';
export type {
  IndexedDBCacheOptions,
  IDBFactoryLike,
  IDBDatabaseLike,
  IDBObjectStoreLike,
  IDBTransactionLike,
  IDBRequestLike,
  IDBOpenRequestLike,
} from './adapters/indexeddb';

export { RedisCache, RedisDriver } from './adapters/redis';
export type { RedisCacheOptions, RedisLikeClient, RedisSetDialect } from './adapters/redis';

export { CloudflareKVCache, CloudflareKVDriver } from './adapters/cloudflare-kv';
export type { CloudflareKVCacheOptions, KVNamespaceLike } from './adapters/cloudflare-kv';

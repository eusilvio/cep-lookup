# Cache

## Contract

```ts
interface Cache {
  get(key: string): MaybePromise<Address | undefined>;
  set(key: string, value: Address): MaybePromise<void>;
  clear(): MaybePromise<void>;
  delete?(key: string): MaybePromise<void>;
  has?(key: string): MaybePromise<boolean>;
  getStale?(key: string): MaybePromise<StaleCacheEntry | undefined>;
}

interface StaleCacheEntry {
  value: Address;
  isStale: boolean;
  ageMs?: number;
}
```

`getStale()` is what enables `staleIfError`. Every bundled implementation provides it.

## InMemoryCache

```ts
import { InMemoryCache } from "@eusilvio/cep-lookup";

new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5_000 });
```

| Option | Default | Description |
| --- | --- | --- |
| `ttl` | `Infinity` | time-to-live in ms |
| `maxSize` | `Infinity` | maximum number of entries |

Fully synchronous. Dies with the process.

## Persistent adapters

All imported from `@eusilvio/cep-lookup/cache` and derived from `KeyValueCache`.

### Shared options

```ts
interface KeyValueCacheOptions {
  ttl?: number;           // logical freshness, default Infinity
  namespace?: string;     // default "cep-lookup"
  evictAfter?: number;    // physical expiry handed to the store
  onError?: (error: Error, operation: string) => void;
}
```

### WebStorageCache

```ts
import { WebStorageCache } from "@eusilvio/cep-lookup/cache";

new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300, storage: sessionStorage });
```

| Extra option | Default | Description |
| --- | --- | --- |
| `storage` | `globalThis.localStorage` | any `Storage`-compatible object |
| `maxSize` | `500` | max entries; oldest evicted first |

When the browser rejects a write for quota, the adapter drops a fraction of the oldest entries and retries.

### IndexedDBCache

```ts
import { IndexedDBCache } from "@eusilvio/cep-lookup/cache";

new IndexedDBCache({ ttl: 24 * 60 * 60_000 });
```

| Extra option | Default |
| --- | --- |
| `dbName` | `"cep-lookup"` |
| `storeName` | `"addresses"` |
| `factory` | `globalThis.indexedDB` |

### RedisCache

```ts
import Redis from "ioredis";
import { RedisCache } from "@eusilvio/cep-lookup/cache";

new RedisCache({
  client: new Redis(process.env.REDIS_URL!),
  ttl: 7 * 24 * 60 * 60_000,
  evictAfter: 30 * 24 * 60 * 60_000,
});
```

| Extra option | Default | Description |
| --- | --- | --- |
| `client` | - | **required**; an already-connected client |
| `dialect` | auto-detected | `SET` expiry dialect |
| `scanCount` | `100` | keys per `SCAN` iteration during `clear()` |

Compatible with `ioredis`, `node-redis` and `@upstash/redis` - the client is injected, never imported.

### CloudflareKVCache

```ts
import { CloudflareKVCache } from "@eusilvio/cep-lookup/cache";

new CloudflareKVCache({ namespaceBinding: env.CEP_CACHE, ttl: 24 * 60 * 60_000 });
```

| Extra option | Description |
| --- | --- |
| `namespaceBinding` | **required**; the Worker's KV binding |

Cloudflare rejects any `expirationTtl` below 60 seconds - the adapter honors that floor.

## KeyValueCache and KeyValueDriver

```ts
interface KeyValueDriver {
  get(key: string): MaybePromise<string | null | undefined>;
  set(key: string, value: string, evictAfterMs?: number): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
  keys?(): MaybePromise<string[]>;   // enables clear()
  clear?(): MaybePromise<void>;      // native wipe, preferred
}
```

```ts
import { KeyValueCache, KeyValueDriver } from "@eusilvio/cep-lookup/cache";

const driver: KeyValueDriver = {
  get: (key) => store.read(key),
  set: (key, value, evictAfterMs) => store.write(key, value, evictAfterMs),
  delete: (key) => store.remove(key),
};

const cache = new KeyValueCache(driver, { ttl: 600_000 });
```

`KeyValueCache` handles serialization, namespacing, logical TTL, staleness metadata and error isolation. The driver only deals with strings.

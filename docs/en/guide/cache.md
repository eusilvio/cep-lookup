# Cache

The cache is the cheapest rung on the ladder: a hit resolves in under a microsecond, with no network. It's also what powers `stale-if-error` during a total outage.

## InMemoryCache

The default, synchronous, dies with the process:

```ts
import { CepLookup, InMemoryCache } from "@eusilvio/cep-lookup";

const cep = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5_000 }),
});
```

## Persistent adapters

Four ready-made adapters in the `@eusilvio/cep-lookup/cache` subpath. All implement `getStale()`, so `staleIfError` works with every one:

| Adapter | Backend | Use it for |
| --- | --- | --- |
| `WebStorageCache` | `localStorage` / `sessionStorage` | Browser apps: survives reload, ~500 entries |
| `IndexedDBCache` | IndexedDB | Browser apps resolving many CEPs, off the main thread |
| `RedisCache` | `ioredis`, `node-redis`, `@upstash/redis` | Servers: one lookup per CEP across every process |
| `CloudflareKVCache` | Workers KV | Edge: resolved in one colo, served from all of them |

Pick by how far the cache must survive:

| Lifetime you need | Adapter |
| --- | --- |
| One process | `InMemoryCache` |
| Page reload | `WebStorageCache` (or `IndexedDBCache` for high volume) |
| Every server process | `RedisCache` |
| Every edge colo | `CloudflareKVCache` |

### Browser

```ts
import { WebStorageCache } from "@eusilvio/cep-lookup/cache";

const cep = new CepLookup({
  providers,
  cache: new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300 }),
  staleIfError: true,
});
```

`sessionStorage` for a per-tab cache: `new WebStorageCache({ storage: sessionStorage })`. When the browser rejects a write for lack of space, the adapter drops the oldest entries and retries - it never blows the shared origin quota for unrelated code.

For apps resolving hundreds of CEPs, swap in `IndexedDBCache`: same options, no main-thread blocking, no fight over the ~5 MB Web Storage budget.

```ts
import { IndexedDBCache } from "@eusilvio/cep-lookup/cache";

const cache = new IndexedDBCache({
  ttl: 24 * 60 * 60_000,
  dbName: "cep-lookup",   // default
  storeName: "addresses", // default
});
```

### Server

```ts
import Redis from "ioredis";
import { RedisCache } from "@eusilvio/cep-lookup/cache";

const cep = new CepLookup({
  providers,
  cache: new RedisCache({
    client: new Redis(process.env.REDIS_URL!),
    ttl: 7 * 24 * 60 * 60_000,          // logical freshness
    evictAfter: 30 * 24 * 60 * 60_000,  // physical expiry - leaves room for stale reads
    onError: (error, operation) => logger.warn({ error, operation }, "cep cache degraded"),
  }),
  staleIfError: true,
});
```

The client is **injected**, never imported: zero dependencies, and the `SET` expiry dialect is auto-detected on the first write. Works with `ioredis`, `node-redis` and `@upstash/redis`.

### Edge

```ts
import { CloudflareKVCache } from "@eusilvio/cep-lookup/cache";

export default {
  async fetch(request: Request, env: Env) {
    const cep = new CepLookup({
      providers,
      cache: new CloudflareKVCache({
        namespaceBinding: env.CEP_CACHE,
        ttl: 24 * 60 * 60_000,
        evictAfter: 30 * 24 * 60 * 60_000, // Cloudflare's floor is 60s
      }),
      staleIfError: true,
    });

    const url = new URL(request.url);
    return Response.json(await cep.lookup(url.searchParams.get("cep")!));
  },
};
```

## Shared options

| Option | Default | What it does |
| --- | --- | --- |
| `ttl` | `Infinity` | logical freshness in ms |
| `namespace` | `"cep-lookup"` | key prefix; adapters never touch keys outside it |
| `evictAfter` | - | physical expiry handed to the store (Redis `PX`, KV `expirationTtl`) |
| `onError` | silent | receives store failures; the error is swallowed and never reaches `lookup()` |

Rule of thumb: keep `evictAfter` well above `ttl`. `ttl` decides what is **fresh**; `evictAfter` decides what still **exists** for `staleIfError` to serve during an outage.

## Custom backend

Implement three methods over opaque strings and `KeyValueCache` handles serialization, namespacing, TTL and staleness:

```ts
import { KeyValueCache, KeyValueDriver } from "@eusilvio/cep-lookup/cache";

const driver: KeyValueDriver = {
  get: (key) => memcached.get(key),
  set: (key, value, evictAfterMs) => memcached.set(key, value, evictAfterMs),
  delete: (key) => memcached.del(key),
};

const cep = new CepLookup({
  providers,
  cache: new KeyValueCache(driver, { ttl: 600_000 }),
});
```

Two optional methods round out the contract: `keys()` (enables `clear()`) and a native `clear()`.

## Async cache

Every `Cache` method (`get`/`set`/`delete`/`has`/`clear`) may return the value directly or as a `Promise`. The engine always awaits, so an async cache works with no adapter. `InMemoryCache` stays fully synchronous.

## Stale-if-error

When **every** provider fails with an infrastructure error (not a not-found) and a cached entry exists - even an expired one - it is served instead of throwing:

```ts
const cep = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: { maxAgeMs: 24 * 60 * 60_000 }, // or `true` to accept any age
});

cep.on("cache:stale", ({ cep, address }) => {
  logger.warn(`Serving stale address for ${cep} - all providers are down`);
});
```

Requires a cache implementing `getStale()` - every bundled one does. Watch the `cache:stale` event: if it fires often, something is structurally wrong with your providers.

## Negative caching

A CEP confirmed as non-existent is remembered for a TTL, and repeated lookups never touch the network:

```ts
const cep = new CepLookup({
  providers,
  cache: new InMemoryCache(),
  negativeCacheTtl: 60_000,
});
```

Useful when your product re-submits the same form several times with a mistyped CEP.

## Request coalescing

Concurrent calls for the same CEP share a single in-flight request - even with no cache configured:

```ts
// A single network round-trip.
await Promise.all([
  cep.lookup("01001000"),
  cep.lookup("01001000"),
  cep.lookup("01001000"),
]);
```

## What never reaches the cache

Partial addresses from the [offline fallback](/en/guide/offline) (`partial: true`) are **never** written. They're an emergency degraded answer, not data good enough to reuse.

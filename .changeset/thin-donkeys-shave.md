---
"@eusilvio/cep-lookup": minor
---

Add persistent cache adapters under the `@eusilvio/cep-lookup/cache` subpath: `WebStorageCache` (localStorage/sessionStorage, bounded and quota-aware), `IndexedDBCache`, `RedisCache` (ioredis, node-redis and @upstash/redis, dialect auto-detected) and `CloudflareKVCache` (Workers KV). All implement `getStale()`, so `staleIfError` works with every one.

Custom backends now take ~30 lines: implement the 3-method `KeyValueDriver` and `KeyValueCache` handles serialization, namespacing, logical TTL, staleness metadata and error isolation — a failing cache is reported to `onError` and swallowed, never propagated into `lookup()`.

The main entry point is unchanged and does not grow: adapters ship only in the `/cache` subpath.

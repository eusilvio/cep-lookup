import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";
import {
  WebStorageCache,
  IndexedDBCache,
  RedisCache,
  CloudflareKVCache,
  KeyValueCache,
  KeyValueDriver,
} from "@eusilvio/cep-lookup/cache";

const providers = [viaCepProvider, brasilApiProvider];

// 1. Browser: cache survives a page reload, bounded so it never eats the
//    origin's Web Storage budget.
const browserLookup = new CepLookup({
  providers,
  cache: new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300 }),
  staleIfError: true,
});

// 2. Browser, high volume: IndexedDB holds far more and never blocks the main
//    thread. `close()` releases the connection when the app tears down.
const idbCache = new IndexedDBCache({ ttl: 7 * 24 * 60 * 60_000 });
const heavyBrowserLookup = new CepLookup({ providers, cache: idbCache, staleIfError: true });

// 3. Server: every process shares one cache, so a CEP costs one provider call
//    for the whole fleet. `evictAfter` sits well above `ttl` so stale-if-error
//    still has something to serve during an outage.
declare const redisClient: any; // new Redis(process.env.REDIS_URL)
const serverLookup = new CepLookup({
  providers,
  cache: new RedisCache({
    client: redisClient,
    ttl: 7 * 24 * 60 * 60_000,
    evictAfter: 30 * 24 * 60 * 60_000,
    onError: (error, operation) => console.warn(`cep cache degraded on ${operation}`, error),
  }),
  staleIfError: true,
});

// 4. Edge: Workers KV, shared across colos.
declare const env: { CEP_CACHE: any };
const edgeLookup = new CepLookup({
  providers,
  cache: new CloudflareKVCache({
    namespaceBinding: env.CEP_CACHE,
    ttl: 24 * 60 * 60_000,
    evictAfter: 30 * 24 * 60 * 60_000,
  }),
});

// 5. Any other backend: three methods over opaque strings. KeyValueCache adds
//    serialization, namespacing, TTL, staleness and error isolation.
declare const memcached: { get(k: string): Promise<string | null>; set(k: string, v: string, ttlMs?: number): Promise<void>; del(k: string): Promise<void> };
const customDriver: KeyValueDriver = {
  get: (key) => memcached.get(key),
  set: (key, value, evictAfterMs) => memcached.set(key, value, evictAfterMs),
  delete: (key) => memcached.del(key),
};
const customLookup = new CepLookup({
  providers,
  cache: new KeyValueCache(customDriver, { ttl: 10 * 60_000, namespace: "checkout" }),
});

async function main() {
  const address = await browserLookup.lookup("01001-000");
  console.log(address.street);

  // Second call answers from storage — no network, even after a reload.
  console.log(await browserLookup.lookup("01001-000"));

  await idbCache.close();
}

main().catch(console.error);

export { browserLookup, heavyBrowserLookup, serverLookup, edgeLookup, customLookup };

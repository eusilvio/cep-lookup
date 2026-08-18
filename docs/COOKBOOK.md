# Cookbook

## React: production provider setup

```tsx
<CepProvider
  providers={[viaCepProvider, brasilApiProvider, apicepProvider]}
  retries={1}
  retryDelay={300}
  rateLimit={{ requests: 60, per: 60_000 }}
  circuitBreaker={{ enabled: true, failureThreshold: 3, cooldownMs: 30000 }}
/>
```

## Vue: custom core instance with resilience

```ts
const instance = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  retries: 1,
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30000 },
});

const { address, error } = useCepLookup("01001000", { instance });
```

## API route / backend usage

```ts
export async function getAddress(cep: string) {
  try {
    return await lookup.lookup(cep);
  } catch (error) {
    if (error instanceof CepNotFoundError) return null;
    throw error;
  }
}
```

## Bulk lookup with concurrency

```ts
const results = await lookup.lookupCeps(["01001000", "01310930", "99999999"], 3);
```

## Metrics snapshot endpoint

```ts
app.get("/internal/cep-metrics", (_req, res) => {
  res.json({
    health: lookup.getProviderHealth(),
    metrics: lookup.getProviderMetrics(),
  });
});
```

## Shared cache across every server process

```ts
import Redis from "ioredis";
import { RedisCache } from "@eusilvio/cep-lookup/cache";

const lookup = new CepLookup({
  providers,
  cache: new RedisCache({
    client: new Redis(process.env.REDIS_URL!),
    ttl: 7 * 24 * 60 * 60_000,
    evictAfter: 30 * 24 * 60 * 60_000,
    onError: (error, operation) => logger.warn({ error, operation }, "cep cache degraded"),
  }),
  staleIfError: true,
});
```

Works with `node-redis` and `@upstash/redis` too — the `SET` dialect is detected on the first write.

## Cache that survives a page reload

```ts
import { WebStorageCache } from "@eusilvio/cep-lookup/cache";

const lookup = new CepLookup({
  providers,
  cache: new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300 }),
  staleIfError: true,
});
```

`sessionStorage` for a per-tab cache: `new WebStorageCache({ storage: sessionStorage })`. For apps resolving hundreds of CEPs, swap in `IndexedDBCache` — same options, no main-thread blocking, no 5 MB origin budget.

## Cache at the edge (Cloudflare Workers)

```ts
import { CloudflareKVCache } from "@eusilvio/cep-lookup/cache";

export default {
  async fetch(request: Request, env: Env) {
    const lookup = new CepLookup({
      providers,
      cache: new CloudflareKVCache({
        namespaceBinding: env.CEP_CACHE,
        ttl: 24 * 60 * 60_000,
        evictAfter: 30 * 24 * 60 * 60_000,
      }),
      staleIfError: true,
    });

    const url = new URL(request.url);
    return Response.json(await lookup.lookup(url.searchParams.get("cep")!));
  },
};
```

## Cache on a backend nobody wrote an adapter for

```ts
import { KeyValueCache, KeyValueDriver } from "@eusilvio/cep-lookup/cache";

// Three methods over opaque strings — TTL, namespacing, staleness and error
// isolation come from KeyValueCache.
const driver: KeyValueDriver = {
  get: (key) => memcached.get(key),
  set: (key, value, evictAfterMs) => memcached.set(key, value, evictAfterMs),
  delete: (key) => memcached.del(key),
};

const lookup = new CepLookup({ providers, cache: new KeyValueCache(driver, { ttl: 600_000 }) });
```

## Degrade to stale data during a total outage

```ts
const lookup = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: true,
});

lookup.on("cache:stale", ({ cep }) => alerting.warn(`Serving stale data for ${cep}`));
```

## Never return empty-handed: offline fallback

```ts
const lookup = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: true,
  offlineFallback: true, // cold cache + total outage → partial state-level address
});

const address = await lookup.lookup(cep);
if (address.partial) {
  // state/ddd are reliable; ask the user to type city/street manually
  form.enableManualAddress({ state: address.state });
}
```

## Validate CEP against the selected UF with zero network

```ts
import { cepMatchesState, isCepAllocated } from "@eusilvio/cep-lookup/offline";

if (!isCepAllocated(form.cep)) {
  return showError("Este CEP não existe em nenhuma faixa dos Correios.");
}
if (!cepMatchesState(form.cep, form.uf)) {
  return showError(`Este CEP não pertence a ${form.uf}.`);
}
// Only now spend a network call:
const address = await lookup.lookup(form.cep);
```

## Cancel an in-flight lookup from a React input

```ts
useEffect(() => {
  const controller = new AbortController();
  lookup.lookup(cep, { signal: controller.signal }).then(setAddress).catch(() => {});
  return () => controller.abort();
}, [cep]);
```

(`@eusilvio/cep-lookup-react`'s `useCepLookup` already does this internally.)

## Reverse address search

```ts
const candidates = await lookup.searchByAddress("SP", "São Paulo", "Praça da Sé");
```

## Self-hosted gateway

```ts
import { createGatewayProvider } from "@eusilvio/cep-lookup/providers";

const gateway = createGatewayProvider({ baseUrl: "https://internal.mycompany.com/cep" });
const lookup = new CepLookup({ providers: [gateway] });
```

# Cookbook

Copy-ready snippets. Each assumes `providers` is already defined.

## React: production setup

```tsx
<CepProvider
  providers={[viaCepProvider, brasilApiProvider, apicepProvider]}
  retries={1}
  retryDelay={300}
  rateLimit={{ requests: 60, per: 60_000 }}
  circuitBreaker={{ enabled: true, failureThreshold: 3, cooldownMs: 30_000 }}
>
  <App />
</CepProvider>
```

## Vue: custom instance with resilience

```ts
const instance = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  retries: 1,
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
});

const { address, error } = useCepLookup("01001000", { instance });
```

## Backend API route

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

## HTTP endpoint with correct status codes

```ts
app.get("/cep/:cep", async (req, res) => {
  try {
    res.json(await lookup.lookup(req.params.cep));
  } catch (error: any) {
    const status = { INVALID_CEP: 400, NOT_FOUND: 404, RATE_LIMITED: 429 }[error.code] ?? 502;
    res.status(status).json({ code: error.code ?? "UNKNOWN", message: error.message });
  }
});
```

## Bulk lookup with concurrency

```ts
const results = await lookup.lookupCeps(["01001000", "01310930", "99999999"], 3);

results.forEach(({ cep, data, error }) => {
  if (error) console.error(`${cep}: failed`);
  else console.log(`${cep}: ${data?.street}`);
});
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

Works with `node-redis` and `@upstash/redis` too - the `SET` dialect is detected on the first write.

## Cache that survives a page reload

```ts
import { WebStorageCache } from "@eusilvio/cep-lookup/cache";

const lookup = new CepLookup({
  providers,
  cache: new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300 }),
  staleIfError: true,
});
```

`sessionStorage` for a per-tab cache: `new WebStorageCache({ storage: sessionStorage })`. For apps resolving hundreds of CEPs, swap in `IndexedDBCache` - same options, no main-thread blocking, no 5 MB origin budget.

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

// Three methods over opaque strings - TTL, namespacing, staleness and error
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

## Validate a CEP against the selected state, zero network

```ts
import { cepMatchesState, isCepAllocated } from "@eusilvio/cep-lookup/offline";

if (!isCepAllocated(form.cep)) {
  return showError("This CEP falls outside every Correios range.");
}
if (!cepMatchesState(form.cep, form.uf)) {
  return showError(`This CEP does not belong to ${form.uf}.`);
}
// Only now spend a network call:
const address = await lookup.lookup(form.cep);
```

## Check the whole address before saving it

```ts
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

const result = await verifyAddress(lookup, form); // { cep, state, city, neighborhood, street, number }

switch (result.status) {
  case "confirmed":
    return saveAddress({ ...result.suggestion!, number: form.number }); // official spelling
  case "plausible":
    return askToConfirm(result.suggestion!); // "Did you mean Avenida Paulista?"
  case "unverifiable":
    return saveAddress(form); // providers down: carry on with what was typed
  default: // conflict, not_found, invalid
    if (result.suggestion) return offerCorrection(result.suggestion); // the right CEP
    if (result.candidates) return pickOne(result.candidates);
    return highlight(Object.entries(result.fields).filter(([, field]) => field.match === "mismatch"));
}
```

## Address verification endpoint

```ts
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

app.post("/addresses/verify", async (req, res) => {
  try {
    res.json(await verifyAddress(lookup, req.body, { signal: AbortSignal.timeout(8_000) }));
  } catch (error: any) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    res.status(timedOut ? 504 : 502).json({ code: error.code ?? "UNKNOWN", message: error.message });
  }
});
```

Bad data comes back as `200` with the verdict in the body; only infrastructure failures become `5xx`.

## Audit an address database

```ts
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

async function auditAddresses(customers: Customer[], concurrency = 4) {
  const issues: Array<{ id: string; status: string; suggestion?: Address }> = [];
  let next = 0;

  const worker = async () => {
    while (next < customers.length) {
      const { id, address } = customers[next++];
      try {
        const result = await verifyAddress(lookup, address, { searchTimeout: 3_000 });
        if (result.status !== "confirmed") {
          issues.push({ id, status: result.status, suggestion: result.suggestion });
        }
      } catch {
        issues.push({ id, status: "error" }); // infrastructure: retry later
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return issues;
}
```

Reverse searches go straight to ViaCEP and skip the engine's `rateLimit`: pace the audit through concurrency.

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

## Instrument every HTTP call

```ts
const lookup = new CepLookup({
  providers,
  fetcher: async (url, signal) => {
    const started = performance.now();
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      metrics.timing("cep.http", performance.now() - started);
    }
  },
});
```

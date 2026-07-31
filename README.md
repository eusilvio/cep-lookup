# @eusilvio/cep-lookup

[![NPM Version](https://img.shields.io/npm/v/@eusilvio/cep-lookup.svg)](https://www.npmjs.com/package/@eusilvio/cep-lookup)
[![Build Status](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/ci.yml)](https://github.com/eusilvio/cep-lookup/actions)
[![Release](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/release.yml?label=release)](https://github.com/eusilvio/cep-lookup/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Stop depending on a single CEP provider.

**cep-lookup** is a fault-tolerant CEP resolution engine - not just another API wrapper.  
It races multiple providers in parallel, trips circuit breakers on unstable APIs, collects runtime metrics, and recovers automatically - all without changing a line of your application code.

---

## Install

```bash
npm install @eusilvio/cep-lookup
```

## 30 seconds

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

const cep = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
});

const address = await cep.lookup("01001-000");
// {
//   cep: '01001000',
//   street: 'Praça da Sé',
//   neighborhood: 'Sé',
//   city: 'São Paulo',
//   state: 'SP',
//   service: 'ViaCEP'
// }
```

If ViaCEP is unavailable, BrasilAPI takes over. If that trips too, APICep responds. Your application keeps working even when individual providers fail.

---

## vs. the alternatives

| Feature | cep-promise | viacep wrappers | **cep-lookup** |
|---|:---:|:---:|:---:|
| Multiple providers | ✅ | ❌ | ✅ |
| Circuit breaker per provider | ❌ | ❌ | ✅ |
| Provider health score | ❌ | ❌ | ✅ |
| Runtime metrics | ❌ | ❌ | ✅ |
| Event-based observability | ❌ | ❌ | ✅ |
| Retry with exponential backoff | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| Custom providers | ❌ | ❌ | ✅ |
| React / Vue integration | ❌ | ❌ | ✅ |

cep-promise races providers and gives up. cep-lookup is built for production uptime.

---

## How it works

```
lookup("01001000")
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Circuit Breaker check                  │
  │  Skips providers with openUntil > now   │
  └──────────────┬──────────────────────────┘
                 │
       ┌─────────┴──────────┐
       ▼                    ▼
  ViaCEP (primary)    BrasilAPI (staggered +100ms)
       │                    │
   success ──────────────► result returned
                            │
    failure                 │
       └──────────────────► fallback wins

  After 3 consecutive failures:
  provider isolated → 30s cooldown → auto-recovery
```

The primary provider gets a head start. Backups fire only if needed. The fastest response wins.

---

## Benchmarks

Internal path performance (no network, measured with [tinybench](https://github.com/tinylibs/tinybench)):

| Operation | Avg latency | Throughput |
|---|---|---|
| CEP validation (regex) | 123 ns | 10M ops/s |
| Cache lookup (InMemoryCache) | 48 ns | 21M ops/s |
| Full lookup with cache hit | 605 ns | 2.6M ops/s |
| EventEmitter dispatch | 63 ns | 17M ops/s |

A cache hit resolves in under a microsecond. The overhead of the resilience layer is negligible on the hot path.

Run benchmarks locally:

```bash
npx tsx benchmarks/lookup.bench.ts
```

---

## Circuit Breaker

Providers that fail repeatedly are isolated automatically and recover after a cooldown window.

```ts
const cep = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,  // open after 3 consecutive failures
    cooldownMs: 30_000,   // try again after 30s
  },
});
```

Each provider has its own circuit. One unstable API doesn't affect the others.

---

## Provider Health

```ts
cep.getProviderHealth();
// [
//   { provider: 'ViaCEP',    score: 0.96, isOpen: false, avgLatencyMs: 48,  p95LatencyMs: 92,  successCount: 24, failureCount: 1 },
//   { provider: 'BrasilAPI', score: 0.91, isOpen: false, avgLatencyMs: 113, p95LatencyMs: 210, successCount: 18, failureCount: 2 },
//   { provider: 'APICep',    score: 0.00, isOpen: true,  avgLatencyMs: 0,   p95LatencyMs: 0,   successCount: 0,  failureCount: 3 },
// ]
```

Score weighs success rate (80%) and average latency (20%). An open circuit scores zero and is skipped on the next request.

`avgLatencyMs` is an exponentially weighted moving average (recent samples matter more than old ones), and `p95LatencyMs` is an approximate 95th percentile computed over the last ~50 samples per provider — useful to spot a provider with an occasional slow tail even when its average still looks healthy.

A CEP that genuinely doesn't exist (`CepNotFoundError`) is **not** treated as an infrastructure failure: it's counted in `notFoundErrors`/`failureCount` for observability, but it never increments `consecutiveFailures` or trips the circuit breaker.

Once a circuit's cooldown expires, exactly one **half-open probe** request is let through. A success fully closes the circuit; a failure reopens it for a new cooldown window instead of instantly trusting the provider again.

---

## Runtime Metrics

```ts
cep.getProviderMetrics();
// [
//   { provider: 'ViaCEP',    requests: 25, successes: 24, failures: 1, timeoutErrors: 0, avgLatencyMs: 48,  p95LatencyMs: 92  },
//   { provider: 'BrasilAPI', requests: 20, successes: 18, failures: 2, timeoutErrors: 1, avgLatencyMs: 113, p95LatencyMs: 210 },
// ]
```

Expose as an internal endpoint to track provider SLAs over time:

```ts
app.get("/internal/cep-health", (_req, res) => {
  res.json({
    health: cep.getProviderHealth(),
    metrics: cep.getProviderMetrics(),
  });
});
```

---

## Observability

```ts
cep.on("success", ({ provider, cep, duration }) => {
  logger.info(`${provider} resolved ${cep} in ${duration}ms`);
});

cep.on("failure", ({ provider, error }) => {
  metrics.increment("cep.failure", { provider });
});

cep.on("cache:hit", ({ cep }) => {
  metrics.increment("cep.cache_hit");
});
```

---

## Warmup

Pre-rank providers by real network latency before the first request. Call on page load or cold starts.

```ts
await cep.warmup(); // pings all providers, reorders by response time
```

Each provider gets its own timeout (`provider.timeout ?? 5000ms`), so a single hung provider can never block warmup for the others.

---

## Cache: async, stale-if-error, negative caching

`Cache` methods (`get`/`set`/`delete`/`has`/`clear`) may return their value directly or as a `Promise` — `CepLookup` awaits every call, so a Redis-backed, Cloudflare KV-backed, or any other async cache works out of the box. `InMemoryCache` itself stays fully synchronous.

```ts
class RedisCache implements Cache {
  async get(cep: string) { /* ... */ }
  async set(cep: string, address: Address) { /* ... */ }
  async clear() { /* ... */ }
}

const cep = new CepLookup({ providers, cache: new RedisCache() });
```

**Stale-if-error**: when every provider fails with an infrastructure error (not a genuine not-found) and a previously cached — even expired — entry exists, serve it instead of throwing. Requires a cache that implements `getStale()` (`InMemoryCache` does).

```ts
const cep = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: true, // or { maxAgeMs: 24 * 60 * 60_000 } to bound how old is acceptable
});

cep.on("cache:stale", ({ cep, address }) => {
  logger.warn(`Serving stale address for ${cep} — all providers are down`);
});
```

**Negative caching**: remember confirmed not-found CEPs for a while, so repeated lookups for a CEP that doesn't exist don't hit the network at all.

```ts
const cep = new CepLookup({ providers, cache: new InMemoryCache(), negativeCacheTtl: 60_000 });
```

**Request coalescing**: concurrent `lookup()` calls for the same CEP automatically share a single in-flight provider request instead of firing redundant network calls — each caller still gets its own mapped result.

```ts
// Only one network round-trip happens here, even without a cache configured.
await Promise.all([cep.lookup("01001000"), cep.lookup("01001000"), cep.lookup("01001000")]);
```

---

## Cancellation

`lookup()` accepts an options object with `signal` and/or `mapper` — the legacy `lookup(cep, mapper)` shorthand keeps working unchanged.

```ts
const controller = new AbortController();
const promise = cep.lookup("01001000", { signal: controller.signal });

// e.g. on component unmount or when the user types a new CEP:
controller.abort();
```

---

## Reverse Address Search

Find candidate CEPs from a state, city and street name (ViaCEP supports this natively):

```ts
const results = await cep.searchByAddress("SP", "São Paulo", "Praça da Sé");
// Address[] — city and street must each be at least 3 characters (ViaCEP requirement)
```

---

## Geographic coordinates & complement

`Address.location` (`{ latitude, longitude }`) is populated by `brasilApiProvider` (BrasilAPI v2 endpoint) when available, and `Address.complement` is populated from ViaCEP's `complemento` field.

```ts
const address = await cep.lookup("01001000");
address.location; // { latitude: -23.5505, longitude: -46.6333 } | undefined
address.complement; // e.g. "lado par" | undefined
```

---

## Error Handling

All errors carry an explicit `.code` - no string parsing.

```ts
import {
  CepNotFoundError,        // NOT_FOUND
  ProviderTimeoutError,    // TIMEOUT
  RateLimitError,          // RATE_LIMITED
  AllProvidersFailedError, // ALL_PROVIDERS_FAILED
  CepValidationError,      // INVALID_CEP
} from "@eusilvio/cep-lookup";

try {
  await cep.lookup("99999-999");
} catch (error) {
  if (error instanceof CepNotFoundError) {
    // inform the user
  } else if (error instanceof AllProvidersFailedError) {
    // all providers unavailable - degrade gracefully
  }
}
```

---

## React

```tsx
import { CepProvider, useCepLookup } from "@eusilvio/cep-lookup-react";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

function App() {
  return (
    <CepProvider
      providers={[viaCepProvider, brasilApiProvider]}
      circuitBreaker={{ enabled: true, failureThreshold: 3, cooldownMs: 30_000 }}
      retries={1}
    >
      <AddressForm />
    </CepProvider>
  );
}

function AddressForm() {
  const { address, loading, error } = useCepLookup("01001-000");

  if (loading) return <p>Buscando...</p>;
  if (error instanceof CepNotFoundError) return <p>CEP não encontrado.</p>;

  return <p>{address?.street}, {address?.city}</p>;
}
```

---

## Vue

```ts
import { useCepLookup } from "@eusilvio/cep-lookup-vue";

const { address, loading, error } = useCepLookup("01001-000");
```

---

## Custom Provider

Plug in any private or internal API:

```ts
const myProvider = {
  name: "MyAPI",
  buildUrl: (cep: string) => `https://api.mycompany.com/address/${cep}`,
  transform: (raw: any) => ({
    cep: raw.postal_code,
    street: raw.street_name,
    city: raw.city_name,
    state: raw.state_code,
    neighborhood: raw.neighborhood,
    service: "MyAPI",
  }),
  timeout: 1500,
};

const cep = new CepLookup({ providers: [myProvider, viaCepProvider] });
```

### Self-hosted gateway provider

If you run your own CEP gateway/proxy (see `docs/PRD-API-GATEWAY.md`) that already returns a normalized `Address`, use the built-in factory instead of writing one by hand:

```ts
import { createGatewayProvider } from "@eusilvio/cep-lookup/providers";

const gatewayProvider = createGatewayProvider({ baseUrl: "https://internal.mycompany.com/cep" });
// buildUrl -> https://internal.mycompany.com/cep/v1/cep/{cep}
```

`buildUrl` only produces a URL, so an `apiKey` isn't sent automatically — inject it via a custom `fetcher` that adds an `x-api-key` header:

```ts
const cep = new CepLookup({
  providers: [gatewayProvider],
  fetcher: (url, signal) => fetch(url, { signal, headers: { "x-api-key": process.env.CEP_GATEWAY_KEY! } }).then((r) => r.json()),
});
```

---

## Bulk Lookup

```ts
const results = await cep.lookupCeps(
  ["01001-000", "04538-133", "99999-999"],
  3, // concurrency
);

results.forEach(({ cep, data, error }) => {
  if (error) console.error(`${cep}: failed`);
  else console.log(`${cep}: ${data.street}`);
});
```

---

## Production Config

```ts
import { CepLookup, InMemoryCache } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

const cep = new CepLookup({
  providers: [
    { ...viaCepProvider,    timeout: 1200 },
    { ...brasilApiProvider, timeout: 1200 },
    { ...apicepProvider,    timeout: 1200 },
  ],
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
  retryDelay: 300,
  rateLimit: { requests: 60, per: 60_000, strategy: "wait" }, // "wait" holds calls instead of throwing RateLimitError
  cache: new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5_000 }),
  staleIfError: { maxAgeMs: 24 * 60 * 60_000 },
  negativeCacheTtl: 60_000,
});
```

---

## Packages

| Package | Description |
|---|---|
| [`@eusilvio/cep-lookup`](packages/cep-lookup) | Core engine |
| [`@eusilvio/cep-lookup-react`](packages/cep-lookup-react) | React hooks and context provider |
| [`@eusilvio/cep-lookup-vue`](packages/cep-lookup-vue) | Vue 3 composition hooks |
| [`@eusilvio/zip-lookup`](packages/zip-lookup) | US ZIP code lookup (same architecture) |

---

## Compatibility

- Node.js `20.x`, `22.x`, `24.x`
- React `>= 16.8`
- Vue `^3`
- Browser: `fetch`, `Promise.any`, `AbortController`

---

## Docs

- [Best Practices](docs/BEST_PRACTICES.md)
- [Migration Guide](docs/MIGRATION.md)
- [Cookbook](docs/COOKBOOK.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

---

## License

MIT © [Silvio Souza](https://github.com/eusilvio)

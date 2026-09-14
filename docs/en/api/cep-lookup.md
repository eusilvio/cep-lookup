# CepLookup

```ts
import { CepLookup } from "@eusilvio/cep-lookup";

const cep = new CepLookup(options);
```

## Constructor options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `providers` | `Provider[]` | - | **Required.** Providers entering the race |
| `fetcher` | `(url, signal?) => Promise<any>` | `fetch` + `json()` | Global HTTP client |
| `cache` | `Cache` | - | Cache implementation (sync or async) |
| `rateLimit` | `RateLimitOptions` | - | `{ requests, per, strategy? }` |
| `staggerDelay` | `number` | `100` | Delay in ms before releasing backup providers |
| `retries` | `number` | `0` | Repeats of the whole race after a total failure |
| `retryDelay` | `number` | `1000` | Base of the exponential backoff between attempts, in ms |
| `logger` | `{ debug(msg, data?) }` | - | Internal event logger |
| `circuitBreaker` | `CircuitBreakerOptions` | enabled | `{ enabled?, failureThreshold?, cooldownMs? }` |
| `staleIfError` | `boolean \| { maxAgeMs?: number }` | `false` | Serve an expired entry when everything fails |
| `negativeCacheTtl` | `number` | - | TTL in ms for remembering non-existent CEPs |
| `offlineFallback` | `boolean` | `false` | Synthesize a partial state-level address as a last resort |

## lookup

```ts
lookup<T = Address>(
  cep: string,
  arg?: LookupOptions<T> | ((address: Address) => T),
): Promise<T>
```

Resolves a CEP. Accepts any formatting; non-digits are stripped before validation.

```ts
const address = await cep.lookup("01001-000");

// with cancellation
const controller = new AbortController();
await cep.lookup("01001000", { signal: controller.signal });

// with a mapper
const summary = await cep.lookup("01001000", { mapper: (a) => `${a.city}/${a.state}` });

// legacy form, still supported
const summary2 = await cep.lookup("01001000", (a) => `${a.city}/${a.state}`);
```

**Throws:** `CepValidationError`, `CepNotFoundError`, `RateLimitError`, `AllProvidersFailedError` - or an `AbortError` when the `signal` is aborted.

## lookupCeps

```ts
lookupCeps<T = Address>(
  ceps: string[],
  concurrency?: number,        // default: 5
  mapper?: (address: Address) => T,
): Promise<BulkCepResult<T>[]>
```

Bulk lookup with bounded concurrency. It does **not** throw per item: each result carries its own error.

```ts
const results = await cep.lookupCeps(["01001-000", "04538-133", "99999-999"], 3);

results.forEach(({ cep, data, provider, error }) => {
  if (error) console.error(`${cep}: ${error.message}`);
  else console.log(`${cep}: ${data?.street} (via ${provider})`);
});
```

## searchByAddress

```ts
searchByAddress(
  state: string,
  city: string,
  street: string,
  options?: SearchByAddressOptions, // { signal? }
): Promise<Address[]>
```

Reverse search: finds candidate CEPs from state, city and street. Requires a provider implementing `buildSearchUrl` and `transformSearch` - `viaCepProvider` does.

```ts
const candidates = await cep.searchByAddress("SP", "São Paulo", "Praça da Sé");

// with cancellation
await cep.searchByAddress("SP", "São Paulo", "Praça da Sé", { signal: controller.signal });
```

City and street must each be at least 3 characters (ViaCEP requirement). ViaCEP matches literal words and returns at most 50 results: "Dr Arnaldo" finds nothing, "Doutor Arnaldo" does. To check a whole address against its CEP, use [`verifyAddress`](/en/api/verify).

## warmup

```ts
warmup(): Promise<Provider[]>
```

Pings every provider, measures real latency and reorders the base list. Returns the new order. Each provider uses `provider.timeout ?? 5000ms` with its own `AbortController`, so a hung provider doesn't block the rest.

```ts
await cep.warmup();
```

## getProviderHealth

```ts
getProviderHealth(): ProviderHealth[]
```

Per-provider health snapshot, sorted healthiest first.

```ts
cep.getProviderHealth();
// [{ provider: 'ViaCEP', score: 0.96, isOpen: false, consecutiveFailures: 0,
//    successCount: 24, failureCount: 1, avgLatencyMs: 48, p95LatencyMs: 92 }, ...]
```

Score formula:

```
score = successRate * 0.8 + (1 - min(avgLatency / 1000, 1)) * 0.2 - (circuitOpen ? 1 : 0)
```

## getProviderMetrics

```ts
getProviderMetrics(): ProviderMetrics[]
```

Cumulative per-provider counters, in configuration order.

```ts
cep.getProviderMetrics();
// [{ provider: 'ViaCEP', requests: 25, successes: 24, failures: 1,
//    timeoutErrors: 0, notFoundErrors: 1, avgLatencyMs: 48, p95LatencyMs: 92 }, ...]
```

## on / off

```ts
on<T extends EventName>(eventName: T, listener: EventListener<T>): void
off<T extends EventName>(eventName: T, listener: EventListener<T>): void
```

Registers and removes listeners. Available events: `success`, `failure`, `cache:hit`, `cache:stale`, `offline:fallback`.

```ts
const onFailure = ({ provider, error }) => logger.warn(provider, error.message);

cep.on("failure", onFailure);
cep.off("failure", onFailure);
```

A listener that throws doesn't interrupt the lookup: the error is swallowed and reported to `logger.debug` when a logger is set.

## See also

- [Types](/en/api/types)
- [Cache](/en/api/cache)
- [Offline](/en/api/offline)
- [Verify](/en/api/verify)
- [Errors](/en/api/errors)

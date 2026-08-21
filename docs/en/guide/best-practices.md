# Best practices

Twelve decisions that separate an integration surviving production from one surviving the happy path.

## 1. Use at least two providers

```ts
providers: [viaCepProvider, brasilApiProvider, apicepProvider]
```

A single provider turns its instability into your downtime.

## 2. Set a per-provider timeout

```ts
const providers = [
  { ...viaCepProvider,    timeout: 1200 },
  { ...brasilApiProvider, timeout: 1200 },
  { ...apicepProvider,    timeout: 1200 },
];
```

Without a timeout, one provider's long tail becomes your endpoint's latency.

## 3. Turn on the circuit breaker

```ts
circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 }
```

Stops your app from hammering something already proven down.

## 4. Retry once, twice at most

```ts
retries: 1,
retryDelay: 300,
```

More than that multiplies worst-case latency and worsens load on a struggling provider.

## 5. Rate limit

```ts
rateLimit: { requests: 60, per: 60_000 }
```

Contains frontend bursts before they become a provider-side block.

## 6. Pick the cache by required lifetime

| Lifetime you need | Adapter |
| --- | --- |
| One process | `InMemoryCache` |
| Page reload | `WebStorageCache` (or `IndexedDBCache` for high volume) |
| Every server process | `RedisCache` |
| Every edge colo | `CloudflareKVCache` |

```ts
import { RedisCache } from "@eusilvio/cep-lookup/cache";

cache: new RedisCache({
  client,
  ttl: 7 * 24 * 60 * 60_000,          // CEP data changes on the order of months
  evictAfter: 30 * 24 * 60 * 60_000,  // keep entries around for stale-if-error
  onError: (error, operation) => logger.warn({ error, operation }, "cep cache degraded"),
})
```

Keep `evictAfter` well above `ttl`: `ttl` decides what is fresh, `evictAfter` decides what still exists to serve during an outage.

## 7. Handle errors by code, not by message

- `INVALID_CEP`
- `NOT_FOUND`
- `TIMEOUT`
- `RATE_LIMITED`
- `ALL_PROVIDERS_FAILED`
- `PROVIDER_UNAVAILABLE`

See [Error handling](/en/guide/errors).

## 8. Monitor health and metrics

```ts
cep.getProviderHealth();
cep.getProviderMetrics();
```

`avgLatencyMs` is an EWMA (recent samples dominate) and `p95LatencyMs` catches the slow tail an average hides.

## 9. Degrade to stale data before degrading to an error

```ts
cache: new InMemoryCache({ ttl: 10 * 60_000 }),
staleIfError: { maxAgeMs: 24 * 60 * 60_000 }, // never serve data older than 24h
```

Listen to `cache:stale` and alert if it fires too often - it usually means every provider is down.

## 10. Use negative caching for known-bad input

```ts
negativeCacheTtl: 60_000,
```

If your product re-submits the same form repeatedly, this avoids re-running lookups already known to 404.

## 11. Choose the rate-limit strategy by context

- `strategy: "throw"` (default) for user-facing requests: fail fast, let the UI retry.
- `strategy: "wait"` for jobs and batches, where holding the call beats handling `RateLimitError`.

## 12. Cancel stale UI requests

```ts
const controller = new AbortController();
cep.lookup(value, { signal: controller.signal });
// later: controller.abort();
```

So a late response never overwrites current state. The React and Vue hooks already do this.

## Bonus: validate offline before spending network

```ts
import { isCepAllocated, cepMatchesState } from "@eusilvio/cep-lookup/offline";

if (!isCepAllocated(form.cep)) return error("CEP does not exist.");
if (!cepMatchesState(form.cep, form.uf)) return error(`CEP does not belong to ${form.uf}.`);
```

Zero latency, zero quota spent, and it catches the most common checkout typo.

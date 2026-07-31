# Best Practices

## 1) Provider strategy

Use at least two providers in production.

```ts
providers: [viaCepProvider, brasilApiProvider, apicepProvider]
```

## 2) Timeouts and fallback

Set provider timeouts to prevent long tail latency.

```ts
const providers = [
  { ...viaCepProvider, timeout: 1200 },
  { ...brasilApiProvider, timeout: 1200 },
  { ...apicepProvider, timeout: 1200 },
];
```

## 3) Circuit breaker

Protect your app from repeatedly hitting unstable providers.

```ts
circuitBreaker: {
  enabled: true,
  failureThreshold: 3,
  cooldownMs: 30_000,
}
```

## 4) Retries

Retry at most once or twice. More than that can increase latency and provider load.

```ts
retries: 1,
retryDelay: 300,
```

## 5) Rate limit

Avoid burst pressure from frontend spam.

```ts
rateLimit: { requests: 60, per: 60_000 }
```

## 6) Cache

Use cache for repeated CEP lookups and bulk jobs.

```ts
cache: new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5000 })
```

## 7) Error handling

Handle standardized errors and user feedback explicitly.

- `INVALID_CEP`
- `NOT_FOUND`
- `TIMEOUT`
- `RATE_LIMITED`
- `ALL_PROVIDERS_FAILED`

## 8) Monitoring

Collect both health and metrics snapshots periodically. `avgLatencyMs` is an EWMA (recent samples dominate) and `p95LatencyMs` catches slow-tail behavior an average can hide:

```ts
lookup.getProviderHealth();
lookup.getProviderMetrics();
```

## 9) Resilience against total outages

Combine a cache with `staleIfError` so a total provider outage degrades to "slightly stale data" instead of a hard error for your users:

```ts
cache: new InMemoryCache({ ttl: 10 * 60_000 }),
staleIfError: { maxAgeMs: 24 * 60 * 60_000 }, // never serve data older than 24h
```

Listen to `cache:stale` to know when this path is taken, and alert if it happens too often — it usually means every provider is down.

## 10) Negative caching for known-bad input

If your product repeatedly looks up the same (possibly invalid) CEPs — e.g. retried form submissions — set `negativeCacheTtl` to avoid hammering providers with requests you already know will 404:

```ts
negativeCacheTtl: 60_000,
```

## 11) Rate limit strategy

Prefer the default `strategy: "throw"` for user-facing requests (fail fast, let the UI retry). Use `strategy: "wait"` for background/batch jobs where holding the call briefly is preferable to handling `RateLimitError` yourself.

## 12) Cancel stale UI requests

Pass an `AbortSignal` to `lookup()` so a fast-typing user or an unmounted component never lets a stale response overwrite the current UI state:

```ts
const controller = new AbortController();
lookup.lookup(cep, { signal: controller.signal });
// later: controller.abort();
```

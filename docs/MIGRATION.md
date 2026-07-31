# Migration Guide

## 2.6.x -> 2.7.0

Fully backward compatible — no required code changes. All additions below are opt-in.

### Added

- **Async `Cache` contract**: `get`/`set`/`delete`/`has`/`clear` may now return their value directly or as a `Promise` (`MaybePromise<T>`). `InMemoryCache` stays synchronous; the engine now `await`s every cache call, so a Redis/KV-backed cache works without any adapter.
- **`staleIfError`** option: serve a previously cached (possibly expired) address when every provider fails with an infrastructure error, instead of throwing. Emits a new `cache:stale` event. Requires a cache implementing the optional `getStale()` method (`InMemoryCache` provides one).
- **`negativeCacheTtl`** option: remembers confirmed not-found CEPs for a TTL, short-circuiting repeated lookups without hitting the network.
- **Request coalescing (singleflight)**: concurrent `lookup()` calls for the same CEP now share a single in-flight provider request.
- **`lookup(cep, options)`**: the second argument now also accepts `{ signal?: AbortSignal; mapper?: (a: Address) => T }`. The legacy `lookup(cep, mapper)` shorthand is unchanged and keeps working.
- **`searchByAddress(state, city, street)`**: reverse address search via ViaCEP.
- **`Address.location`** (`{ latitude, longitude }`): populated by `brasilApiProvider`, now on the BrasilAPI v2 endpoint.
- **`Address.complement`**: populated from ViaCEP's `complemento` field.
- **`createGatewayProvider({ baseUrl, apiKey?, name? })`**: factory for a provider that talks to a self-hosted CEP gateway returning an already-normalized `Address`.
- **`rateLimit.strategy`**: `"throw"` (default, unchanged) or `"wait"` — holds the call until a slot frees up instead of throwing `RateLimitError`.
- **`ProviderHealth`/`ProviderMetrics`** gained `p95LatencyMs` (approximate 95th percentile over the last ~50 samples per provider); `avgLatencyMs` is now an exponentially weighted moving average instead of a lifetime mean.
- Half-open circuit breaker: after a cooldown expires, exactly one probe request is let through instead of fully closing the circuit optimistically — a failed probe reopens it for a new cooldown.

### Behavior notes (non-breaking, but worth knowing)

- `CepNotFoundError` no longer counts toward `consecutiveFailures` or opens the circuit breaker — a CEP genuinely not existing is not an infrastructure failure. It's still counted in `notFoundErrors`/`failureCount` for observability.
- When `retries` is configured, a genuine not-found (single provider, or every provider agreeing it's not found) is no longer retried — it fails fast with `CepNotFoundError`.
- A listener registered via `.on()` that throws no longer breaks the lookup flow; the error is swallowed and reported to `logger.debug` if a logger is configured.
- `warmup()` now applies a per-provider timeout (`provider.timeout ?? 5000ms`) via its own `AbortController`, so a single hung provider can no longer block warmup for the others.

### React

- `useCepLookup` now passes an `AbortSignal` to `lookup()` and aborts the in-flight request on CEP change/unmount, instead of only checking staleness after the fact. No API change for consumers of the hook.

### Recommended upgrade steps

```bash
npm i @eusilvio/cep-lookup@^2.7.0 @eusilvio/cep-lookup-react@^2.7.0 @eusilvio/cep-lookup-vue@^2.7.0 @eusilvio/zip-lookup@^2.7.0
```

No further action required. Opt into the new resilience options (`staleIfError`, `negativeCacheTtl`, `rateLimit.strategy: "wait"`) where they fit your workload.

## 2.5.x -> 2.6.0

### Added

- Standardized error codes in core errors.
- Circuit breaker options in `CepLookupOptions`.
- `getProviderHealth()` and `getProviderMetrics()`.
- Provider contract tests and resilience metrics tests.

### Behavior notes

- Providers may be temporarily skipped when circuit breaker is open.
- Not found/network 404-like failures are normalized to `CepNotFoundError` where possible.

### React/Vue package versions

`@eusilvio/cep-lookup-react` and `@eusilvio/cep-lookup-vue` were aligned to `2.6.0` and now peer-depend on `@eusilvio/cep-lookup ^2.6.0`.

### Recommended upgrade steps

1. Upgrade all packages together:

```bash
npm i @eusilvio/cep-lookup@^2.6.0 @eusilvio/cep-lookup-react@^2.6.0 @eusilvio/cep-lookup-vue@^2.6.0
```

2. If you rely on exact provider attempt order, review circuit breaker settings.
3. Add explicit handling for new standardized errors in UI/API layers.

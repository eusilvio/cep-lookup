# Migration

Every version in this line is backward compatible: nothing below requires a code change. Each addition is opt-in.

::: info Versions
Address verification described below requires `2.10.0` or newer; the persistent cache adapters, `2.9.0`.
:::

## 2.9.x → 2.10.0

### Added

- **Address verification** under the `@eusilvio/cep-lookup/verify` subpath: `verifyAddress(cep, address)` checks state, city, neighborhood, street and house number against the CEP and returns a status (`confirmed`, `plausible`, `conflict`, `unverifiable`, `not_found`, `invalid`), a score, a per-field outcome and a suggestion ready to store. Bad data never throws.
- **CEP correction**: when the CEP conflicts with the address, doesn't exist or is malformed, a reverse search finds the CEP that serves the typed street and number - or lists `candidates` when several fit.
- **House number vs. the Correios range**: `de 612 a 1510 - lado par`, `até 894/0895`, single-building CEPs.
- **Zero-network building blocks**: `compareAddress`, `normalizeAddressText`, `parseNumberRange` and `isNumberInRange`.
- **`searchByAddress(state, city, street, { signal })`** accepts an `AbortSignal`.
- **`openCepProvider`** now fills `Address.complement`.

The main entry point does not grow: verification ships only in the `/verify` subpath. Its types are also exported from the main entry.

```bash
npm i @eusilvio/cep-lookup@^2.10.0
```

## 2.8.x → 2.9.0

### Added

- **Persistent cache adapters** under the `@eusilvio/cep-lookup/cache` subpath: `WebStorageCache` (localStorage/sessionStorage, bounded and quota-aware), `IndexedDBCache`, `RedisCache` (`ioredis`, `node-redis` and `@upstash/redis`, dialect auto-detected) and `CloudflareKVCache` (Workers KV). All implement `getStale()`, so `staleIfError` works with every one.
- **`KeyValueCache` + `KeyValueDriver`**: a custom backend in ~30 lines. You implement three methods over strings; serialization, namespacing, logical TTL, staleness metadata and error isolation come for free.
- **Per-cache `onError`**: a store failure is reported and swallowed, never propagated into `lookup()`.

The main entry point does not grow: adapters ship only in the `/cache` subpath.

```bash
npm i @eusilvio/cep-lookup@^2.9.0
```

Nothing changes if you stay on `InMemoryCache`.

## 2.7.x → 2.8.0

### Added

- **`offlineFallback`**: the ladder's final tier (race → retries → stale cache → **offline** → error). When every provider fails with an infrastructure error and no stale entry is usable, `lookup()` synthesizes a partial state-level `Address` (`state`, `ddd`, `service: "offline"`, `partial: true`) from the bundled official Correios allocation map (~2 KB). Genuine not-founds are never masked, and the partial address is never cached.
- **`offline:fallback` event** for observability.
- **`Address.partial`**: present only on synthesized addresses.
- **Zero-network synchronous API**, also available standalone via `@eusilvio/cep-lookup/offline`: `resolveCepOffline`, `stateFromCep`, `isCepAllocated` and `cepMatchesState` - 0ms CEP↔state cross-field validation.

```bash
npm i @eusilvio/cep-lookup@^2.8.0
```

## 2.6.x → 2.7.0

### Added

- **Async `Cache` contract**: `get`/`set`/`delete`/`has`/`clear` may return their value directly or as a `Promise` (`MaybePromise<T>`). `InMemoryCache` stays synchronous; the engine awaits every cache call, so a Redis/KV-backed cache works with no adapter.
- **`staleIfError`**: serve a previously cached (possibly expired) address when every provider fails with an infrastructure error, instead of throwing. Emits `cache:stale`. Requires a cache implementing `getStale()`.
- **`negativeCacheTtl`**: remembers confirmed not-found CEPs for a TTL.
- **Request coalescing (singleflight)**: concurrent lookups for the same CEP share one in-flight request.
- **`lookup(cep, options)`**: the second argument now also accepts `{ signal?, mapper? }`. The legacy `lookup(cep, mapper)` shorthand keeps working.
- **`searchByAddress(state, city, street)`**: reverse address search via ViaCEP.
- **`Address.location`** (latitude/longitude), populated by `brasilApiProvider`, now on the BrasilAPI v2 endpoint.
- **`Address.complement`**, mapped from ViaCEP's `complemento`.
- **`createGatewayProvider({ baseUrl, apiKey?, name? })`**: provider factory for a self-hosted gateway returning an already-normalized `Address`.
- **`rateLimit.strategy`**: `"throw"` (default, unchanged) or `"wait"`.
- **`p95LatencyMs`** on `ProviderHealth`/`ProviderMetrics`; `avgLatencyMs` became an exponentially weighted moving average instead of a lifetime mean.
- **Half-open circuit breaker**: after the cooldown, exactly one probe is let through; a failed probe reopens the circuit.

### Behavior notes (non-breaking, but worth knowing)

- `CepNotFoundError` no longer counts toward `consecutiveFailures` or opens the circuit. It's still counted in `notFoundErrors`/`failureCount`.
- With `retries` configured, a genuine not-found is no longer retried - it fails fast.
- A listener registered via `.on()` that throws no longer breaks the lookup flow; the error is swallowed and reported to `logger.debug`.
- `warmup()` applies a per-provider timeout (`provider.timeout ?? 5000ms`) via its own `AbortController`.

### React

- `useCepLookup` passes an `AbortSignal` to `lookup()` and aborts the in-flight request on CEP change/unmount, instead of only checking staleness after the fact. No API change for hook consumers.

### Upgrade

```bash
npm i @eusilvio/cep-lookup@^2.7.0 @eusilvio/cep-lookup-react@^2.7.0 @eusilvio/cep-lookup-vue@^2.7.0 @eusilvio/zip-lookup@^2.7.0
```

## 2.5.x → 2.6.0

### Added

- Standardized error codes in core errors.
- Circuit breaker options in `CepLookupOptions`.
- `getProviderHealth()` and `getProviderMetrics()`.
- Provider contract tests and resilience metrics tests.

### Behavior notes

- Providers may be temporarily skipped when their circuit is open.
- Not-found/404-like failures are normalized to `CepNotFoundError` where possible.

### React/Vue package versions

`@eusilvio/cep-lookup-react` and `@eusilvio/cep-lookup-vue` were aligned to `2.6.0` and now peer-depend on `@eusilvio/cep-lookup ^2.6.0`.

### Upgrade

1. Upgrade all packages together:

```bash
npm i @eusilvio/cep-lookup@^2.6.0 @eusilvio/cep-lookup-react@^2.6.0 @eusilvio/cep-lookup-vue@^2.6.0
```

2. If you rely on exact provider attempt order, review circuit breaker settings.
3. Add explicit handling for the standardized errors in UI/API layers.

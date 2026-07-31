# @eusilvio/zip-lookup

## 2.8.0

## 2.7.0

### Minor Changes

- Resilience, cache and data enrichment improvements.

  **Resilience fixes**

  - Not-found results no longer open the circuit breaker (they still count in metrics).
  - Retry loop no longer retries definitive not-found responses.
  - Event listeners that throw no longer break the lookup flow.
  - `warmup()` now applies a per-provider timeout with proper aborting.
  - Latency tracking switched to EWMA and new `p95LatencyMs` exposed in health/metrics.
  - Circuit breaker now supports a half-open probe state after cooldown.

  **Cache**

  - `Cache` contract now accepts sync or async implementations (`MaybePromise`), enabling Redis/IndexedDB adapters.
  - New `staleIfError` option: serve expired cache entries when all providers fail (emits `cache:stale`).
  - Request coalescing: concurrent lookups for the same code share one in-flight request.
  - New `negativeCacheTtl` option: cache not-found results for a configurable window.
  - `lookup(code, { signal, mapper })`: external `AbortSignal` support (legacy `lookup(code, mapper)` still works).

  **Data enrichment (cep-lookup)**

  - New optional `Address.location` (latitude/longitude) — BrasilAPI provider migrated to v2.
  - New optional `Address.complement` mapped from ViaCEP.
  - New `searchByAddress(state, city, street)` reverse lookup via ViaCEP.

  **Extensibility**

  - New `createGatewayProvider({ baseUrl })` provider factory.
  - New `rateLimit.strategy: 'throw' | 'wait'` (default `'throw'`).

  **React**

  - `useCepLookup` now aborts in-flight requests on cleanup instead of only discarding stale results.

## 2.6.1

### Patch Changes

- 5a7314b: Validate end-to-end CI publishing pipeline after @eusilvio/zip-lookup was created on npm. First release driven entirely through Changesets + GitHub Actions.

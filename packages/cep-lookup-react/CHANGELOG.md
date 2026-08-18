# Changelog

## 2.9.0

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

- @eusilvio/cep-lookup@2.6.1

## 0.4.1

### Patch Changes

- 671f9cd: Improve open-source project readiness with governance docs, release automation, CI hardening, and documentation updates.

  Also includes runtime and testing quality improvements:

  - fix Jest workspace module resolution for React and Vue packages
  - improve React provider cache scoping and bulk hook mapper remapping behavior
  - apply `staggerDelay` support in Vue hook options
  - refine core timeout typing for better cross-environment compatibility

- Updated dependencies [671f9cd]
  - @eusilvio/cep-lookup@2.5.1

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.4.0] - 2025-12-30

### Added

- **Smart Warmup**: The `useCepLookup` hook now exposes the `warmup` function to optimize provider ranking.
- **Stagger Delay Configuration**: Added `staggerDelay` prop to `CepProvider` to configure the Race Strategy timing.

## [0.3.2] - 2025-12-30

### Changed

- **Peer Dependency**: Updated `@eusilvio/cep-lookup` to v2.3.0 for better ESM/CJS compatibility.
- **Build Infrastructure**: Unified exports following the new monorepo standard.

## [0.2.0] - 2025-12-30

### Changed

- **Hook Lifecycle**: Refactored `useCepLookup` to use `useRef` and proper `useEffect` cleanup for better stability and memory safety.
- **Race Condition Protection**: Added internal checks to prevent outdated requests from overwriting newer search results.
- **Context Optimization**: Stabilized the default `InMemoryCache` instance in `CepProvider` to prevent cache resets during re-renders.

### Added

- **Generics Support**: Hooks now support generic types, allowing automatic inference of mapped results from the `CepProvider` mapper.
- **Event Listeners**: `CepProvider` now accepts `onSuccess`, `onFailure`, and `onCacheHit` props to easily integrate with monitoring or analytics.

### Fixed

- Improved type definitions and removed `any` usages across the package.

# Changelog

## 2.10.0

### Minor Changes

- a469755: Address verification: check the address a user typed against its CEP, and find the right CEP when the typed one is wrong.

  - New `@eusilvio/cep-lookup/verify` subpath. `verifyAddress(lookup, address)` resolves the CEP through the engine and compares state, city, neighborhood, street and house number. It returns a status (`confirmed`, `plausible`, `conflict`, `unverifiable`, `not_found`, `invalid`), a weighted score, a per-field outcome (`exact`, `equivalent`, `similar`, `mismatch`, `unverifiable`) and a suggestion ready to store. Bad data never throws.
  - Brazilian address normalization: abbreviations (`Av.`, `R.`, `Pça.`, `Dr.`, `Brig.`, `N. Sra.`), omitted street types and titles, numbers spelled out or in roman numerals (`XV` / `Quinze` / `15`), accents, UF or state name. A near miss never passes for another state.
  - House numbers are checked against the Correios numbering range (`de 612 a 1510 - lado par`, `até 894/0895`, single-building CEPs). When the provider that answered does not return complements, the range comes from one reverse search.
  - CEP correction: when the CEP conflicts with the address, does not exist or is malformed, a reverse search finds the CEP that serves the typed street and number, or lists `candidates` when several fit equally. Searches are best-effort, bounded by `searchTimeout` (5s by default) and can be turned off with `reverseSearch: false`.
  - Zero-network building blocks: `compareAddress`, `normalizeAddressText`, `parseNumberRange` and `isNumberInRange`.
  - `searchByAddress()` accepts `{ signal }`, and `openCepProvider` now maps `complemento` to `Address.complement`.

  The main entry point does not grow: verification ships only in the `/verify` subpath, and its types are also exported from the main entry.

## 2.9.0

### Minor Changes

- e690f4a: Add persistent cache adapters under the `@eusilvio/cep-lookup/cache` subpath: `WebStorageCache` (localStorage/sessionStorage, bounded and quota-aware), `IndexedDBCache`, `RedisCache` (ioredis, node-redis and @upstash/redis, dialect auto-detected) and `CloudflareKVCache` (Workers KV). All implement `getStale()`, so `staleIfError` works with every one.

  Custom backends now take ~30 lines: implement the 3-method `KeyValueDriver` and `KeyValueCache` handles serialization, namespacing, logical TTL, staleness metadata and error isolation — a failing cache is reported to `onError` and swallowed, never propagated into `lookup()`.

  The main entry point is unchanged and does not grow: adapters ship only in the `/cache` subpath.

## 2.8.0

### Minor Changes

- a6d3ed5: Offline Resilience Layer: the lookup that never returns empty-handed.

  - New `offlineFallback` option — final tier of the fallback ladder (providers race → retries → stale cache → **offline** → error). When every provider fails with an infrastructure error and no stale cache entry is usable, `lookup()` synthesizes a partial, state-level `Address` (`state`, `ddd`, `service: "offline"`, `partial: true`) from the official Correios CEP allocation map bundled with the library (~2 KB). Genuine not-founds are never masked and the partial address is never cached.
  - New `offline:fallback` event for observability.
  - New `partial?: boolean` field on `Address`, present only on synthesized addresses.
  - New zero-network, synchronous API — also available standalone via the `@eusilvio/cep-lookup/offline` subpath export: `resolveCepOffline` (state, state name, region, capital, DDD, IBGE state code), `stateFromCep`, `isCepAllocated`, `cepMatchesState` (0ms CEP↔UF cross-field form validation).

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

## 2.5.1

### Patch Changes

- 671f9cd: Improve open-source project readiness with governance docs, release automation, CI hardening, and documentation updates.

  Also includes runtime and testing quality improvements:

  - fix Jest workspace module resolution for React and Vue packages
  - improve React provider cache scoping and bulk hook mapper remapping behavior
  - apply `staggerDelay` support in Vue hook options
  - refine core timeout typing for better cross-environment compatibility

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.0] - 2025-12-30

### Added

- **Smart Warmup (Predictive Ranking)**: Introduced `cepLookup.warmup()` to pre-calculate the fastest provider based on current network conditions.
- **Staggered Race Strategy**: The `lookup()` method now uses an optimized execution strategy that tries the fastest provider first and only triggers backups after a configurable `staggerDelay`.
- **Performance Configuration**: Added `staggerDelay` to `CepLookupOptions` to allow fine-tuning the balance between speed and network resource usage.
- **Framework Integration**: React and Vue hooks now expose the `warmup` function.

### Changed

- **Internal Optimization**: Improved `lookup` logic to immediately trigger secondary providers if the primary provider fails, even before the `staggerDelay` expires.

## [2.3.2] - 2025-12-30

### Fixed

- **Package Metadata**: Fixed missing repository and homepage URLs in workspace packages for better NPM registry integration.

## [2.3.1] - 2025-12-30

### Fixed

- **Release Infrastructure**: Fixed scoped package publication access for better provenance (SLSA) support.

## [2.3.0] - 2025-12-30

### Fixed

- **Cross-Runtime Compatibility**: Separated type and value exports to resolve issues in stricter runtimes like Bun and Deno.
- **Dual-Build Enhancements**: Improved `.mjs` and `.cjs` generation for better framework interoperability.

## [2.2.0] - 2025-12-30

### Security

- Updated `esbuild`, `glob`, and `js-yaml` to resolve moderate and high-severity vulnerabilities.

### Changed

- **CEP Normalization**: The library now returns the CEP in numerical-only format (`00000000`) for consistency across all providers.
- **Improved Type Safety**: Refactored internal `EventEmitter` and utility functions to eliminate `any` usages and improve strict typing.

### Added

- **Robust Provider Handling**: Added explicit error validation and data normalization for ViaCEP, BrasilAPI, and ApiCEP providers. All address fields are now guaranteed to be strings.

## [2.1.0] - 2025-10-10

### Added

- **Bulk Lookup Method**: The `CepLookup` class now has a `lookupCeps` method, allowing for efficient bulk CEP lookups using a class instance.

### Changed

- **API Refactoring**: The bulk lookup functionality has been refactored from a standalone `lookupCeps` function to a method of the `CepLookup` class. This improves API consistency and state management.

### Deprecated

- The standalone `lookupCep` and `lookupCeps` functions are now deprecated and will be removed in a future version. Please use the methods on a `CepLookup` instance instead.

## [2.0.1] - 2025-10-10

### Fixed

- **Single Provider Rejection**: Fixed an issue where `lookup` would throw an `AggregateError` when a single provider failed, instead of the expected `Error`. The logic now awaits the promise directly in single-provider scenarios, ensuring consistent error handling.

## [2.0.0] - 2025-10-10

### BREAKING CHANGE

- **Strict CEP Validation**: Input validation now strictly requires the CEP to be in the `NNNNNNNN` or `NNNNN-NNN` format. Any other format will now throw an error, which may break integrations that were passing unclean CEP strings.

### Added

- **Observability Events API**: The `CepLookup` class now emits `success`, `failure`, and `cache:hit` events, allowing users to build robust metrics and monitoring systems.
- **Rate Limiting**: Implemented a configurable in-memory rate limiter to prevent API abuse. This can be configured via the `rateLimit` option in the `CepLookup` constructor.

### Changed

- **Data Sanitization**: All string fields in the returned address object are now automatically trimmed of leading/trailing whitespace to improve data quality.

### Fixed

- **NPM License Display**: Added the `license: "MIT"` field to `package.json` to ensure the license is correctly displayed on npmjs.com.

## [1.3.0] - 2025-10-10

### Added

- **Bulk CEP Lookup**: Introduced the `lookupCeps` function to look up multiple CEPs efficiently in a single call.
- **Controlled Concurrency**: The bulk lookup feature uses a native worker pool to control the number of parallel requests to providers.

### Changed

- The CI/CD pipeline was updated to a more secure, tag-based release process using OIDC provenance for publishing to NPM.

### Fixed

- The `repository` field was added to `package.json` to support NPM's provenance verification.

### Docs

- Updated `README.md` with documentation for the new bulk lookup feature.
- Added `examples/bulk-example.ts`.
- Standardized imports in all example files to use the package name.
- Removed unused `axios` dependency from examples.

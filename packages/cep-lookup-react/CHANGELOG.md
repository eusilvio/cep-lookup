# Changelog

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

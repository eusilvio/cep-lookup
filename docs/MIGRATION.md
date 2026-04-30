# Migration Guide

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

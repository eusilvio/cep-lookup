# Errors

All exported from `@eusilvio/cep-lookup`. Each carries a stable `.code`.

| Class | `.code` | Extra fields |
| --- | --- | --- |
| `CepValidationError` | `INVALID_CEP` | - |
| `CepNotFoundError` | `NOT_FOUND` | `cep` |
| `ProviderTimeoutError` | `TIMEOUT` | `provider`, `timeout` |
| `RateLimitError` | `RATE_LIMITED` | - |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | `provider` |
| `AllProvidersFailedError` | `ALL_PROVIDERS_FAILED` | `errors` |

## CepValidationError

Thrown before any request, when the CEP isn't 8 digits after cleaning.

```ts
await cep.lookup("123"); // CepValidationError
```

## CepNotFoundError

Providers agree the CEP doesn't exist. It gets special treatment throughout the engine:

- never opens the circuit breaker;
- is not retried when `retries` is configured;
- doesn't trigger `staleIfError` or the offline fallback;
- can be remembered via `negativeCacheTtl`.

## ProviderTimeoutError

A provider blew its own `timeout`. Usually handled internally (another provider wins the race) and only reaches you inside `AllProvidersFailedError`.

## RateLimitError

The local limiter refused the call. Only happens with `rateLimit.strategy: "throw"` - the default. With `"wait"`, the call is held until a slot frees up.

## ProviderUnavailableError

The provider's circuit is open. Appears inside `AllProvidersFailedError` when every circuit is open.

## AllProvidersFailedError

Nobody answered and no fallback resolved. It aggregates the individual errors, already flattened:

```ts
catch (error) {
  if (error instanceof AllProvidersFailedError) {
    error.errors.forEach((e: any) =>
      logger.warn({ code: e.code, message: e.message }));
  }
}
```

## By code, across a serialization boundary

```ts
const status = { INVALID_CEP: 400, NOT_FOUND: 404, RATE_LIMITED: 429 }[error.code] ?? 502;
```

Inside the application, prefer `instanceof`. See [Error handling](/en/guide/errors) for the full patterns.

## US ZIP

`@eusilvio/zip-lookup` mirrors this hierarchy, with `ZipValidationError` (`INVALID_ZIP`) and `ZipNotFoundError` (`NOT_FOUND`) replacing the CEP equivalents.

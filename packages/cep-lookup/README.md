# @eusilvio/cep-lookup

[![NPM Version](https://img.shields.io/npm/v/@eusilvio/cep-lookup.svg)](https://www.npmjs.com/package/@eusilvio/cep-lookup)
[![Build Status](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/ci.yml)](https://github.com/eusilvio/cep-lookup/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Core CEP lookup engine with multi-provider race, resilience controls, and metrics.

## Installation

```bash
npm install @eusilvio/cep-lookup
```

## Features

- Multi-provider race strategy.
- Cache and rate limiting.
- Retry with exponential backoff.
- Standardized errors with error codes.
- Circuit breaker per provider.
- Provider health score and runtime metrics.
- Event-based observability.

## Basic Usage

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

const lookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
});

const address = await lookup.lookup("01001-000");
console.log(address);
```

## Error Handling

```ts
import {
  CepLookup,
  CepNotFoundError,
  ProviderTimeoutError,
  RateLimitError,
  AllProvidersFailedError,
} from "@eusilvio/cep-lookup";

try {
  await lookup.lookup("01001000");
} catch (error) {
  if (error instanceof CepNotFoundError) {
    console.log(error.code); // NOT_FOUND
  } else if (error instanceof ProviderTimeoutError) {
    console.log(error.code); // TIMEOUT
  } else if (error instanceof RateLimitError) {
    console.log(error.code); // RATE_LIMITED
  } else if (error instanceof AllProvidersFailedError) {
    console.log(error.code); // ALL_PROVIDERS_FAILED
  }
}
```

## Circuit Breaker

```ts
const lookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    cooldownMs: 30_000,
  },
});
```

## Health and SLA Metrics

```ts
const health = lookup.getProviderHealth();
/*
[
  {
    provider: 'ViaCEP',
    score: 0.94,
    isOpen: false,
    successCount: 12,
    failureCount: 1,
    avgLatencyMs: 52.11,
    ...
  }
]
*/

const metrics = lookup.getProviderMetrics();
/*
[
  {
    provider: 'ViaCEP',
    requests: 13,
    successes: 12,
    failures: 1,
    timeoutErrors: 0,
    notFoundErrors: 1,
    avgLatencyMs: 52.11
  }
]
*/
```

## Bulk Lookup

```ts
const results = await lookup.lookupCeps(["01001-000", "99999-999"], 2);
```

## API Summary

### `new CepLookup(options)`

- `providers`: required provider list.
- `fetcher`: optional custom HTTP fetch function.
- `cache`: optional cache implementation.
- `rateLimit`: `{ requests, per }`.
- `staggerDelay`: delay before backup providers.
- `retries`: retry count after failure.
- `retryDelay`: base retry delay in ms.
- `circuitBreaker`: `{ enabled, failureThreshold, cooldownMs }`.

### Methods

- `lookup(cep, mapper?)`
- `lookupCeps(ceps, concurrency?)`
- `warmup()`
- `getProviderHealth()`
- `getProviderMetrics()`
- `on(event, listener)` / `off(event, listener)`

## Compatibility and support

- Node.js: `20.x`, `22.x`, `24.x`
- Maintenance policy: [SUPPORT.md](../../SUPPORT.md)

## Production docs

- [Best Practices](../../docs/BEST_PRACTICES.md)
- [Migration Guide](../../docs/MIGRATION.md)
- [Cookbook](../../docs/COOKBOOK.md)

## License

MIT

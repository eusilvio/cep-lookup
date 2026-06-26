# @eusilvio/zip-lookup

[![NPM Version](https://img.shields.io/npm/v/@eusilvio/zip-lookup.svg)](https://www.npmjs.com/package/@eusilvio/zip-lookup)
[![Build Status](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/ci.yml)](https://github.com/eusilvio/cep-lookup/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

US ZIP code lookup engine with multi-provider race, resilience controls, and metrics.

## Installation

```bash
npm install @eusilvio/zip-lookup
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
import { ZipLookup } from "@eusilvio/zip-lookup";
import { zippopotamProvider } from "@eusilvio/zip-lookup/providers";

const lookup = new ZipLookup({
  providers: [zippopotamProvider],
});

const address = await lookup.lookup("90210");
console.log(address);
// {
//   zip: "90210",
//   city: "Beverly Hills",
//   state: "California",
//   stateAbbr: "CA",
//   country: "United States",
//   latitude: "34.0901",
//   longitude: "-118.4065",
//   service: "Zippopotam"
// }
```

## Providers

### Free (no API key)

```ts
import { zippopotamProvider } from "@eusilvio/zip-lookup/providers";
```

### ZipCodeStack (free tier, API key required)

Sign up at [zipcodestack.com](https://zipcodestack.com). Returns county and timezone in addition to city/state.

```ts
import { createZipcodestackProvider } from "@eusilvio/zip-lookup/providers";

const provider = createZipcodestackProvider("YOUR_API_KEY");
```

### USPS Web Tools (free, API key required)

Register at [usps.com/business/web-tools-apis](https://www.usps.com/business/web-tools-apis/). Returns city and state only.

```ts
import { createUspsProvider } from "@eusilvio/zip-lookup/providers";

const provider = createUspsProvider("YOUR_USPS_USERID");
```

## Multiple Providers (race strategy)

```ts
import { ZipLookup } from "@eusilvio/zip-lookup";
import {
  zippopotamProvider,
  createZipcodestackProvider,
  createUspsProvider,
} from "@eusilvio/zip-lookup/providers";

const lookup = new ZipLookup({
  providers: [
    zippopotamProvider,
    createZipcodestackProvider("YOUR_API_KEY"),
    createUspsProvider("YOUR_USPS_USERID"),
  ],
  staggerDelay: 100, // ms before backup providers are triggered
});
```

## ZIP Code Formats

All of the following are accepted and normalized to 5 digits internally:

```ts
await lookup.lookup("10001");         // 5-digit
await lookup.lookup("10001-1234");    // ZIP+4 with hyphen
await lookup.lookup("100011234");     // ZIP+4 without hyphen
```

## Error Handling

```ts
import {
  ZipLookup,
  ZipValidationError,
  ZipNotFoundError,
  ProviderTimeoutError,
  RateLimitError,
  AllProvidersFailedError,
} from "@eusilvio/zip-lookup";

try {
  await lookup.lookup("99999");
} catch (error) {
  if (error instanceof ZipValidationError) {
    console.log(error.code); // INVALID_ZIP
  } else if (error instanceof ZipNotFoundError) {
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

## Cache

```ts
import { ZipLookup, InMemoryCache } from "@eusilvio/zip-lookup";

const lookup = new ZipLookup({
  providers: [zippopotamProvider],
  cache: new InMemoryCache({ ttl: 60_000, maxSize: 500 }),
});
```

## Rate Limiting

```ts
const lookup = new ZipLookup({
  providers: [zippopotamProvider],
  rateLimit: { requests: 10, per: 1000 }, // 10 req/s
});
```

## Circuit Breaker

```ts
const lookup = new ZipLookup({
  providers: [zippopotamProvider],
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    cooldownMs: 30_000,
  },
});
```

## Warmup

Pings all providers and sorts them by latency. Useful to call on input focus.

```ts
await lookup.warmup();
```

## Health and Metrics

```ts
const health = lookup.getProviderHealth();
// [{ provider: "Zippopotam", score: 0.96, isOpen: false, avgLatencyMs: 48.2, ... }]

const metrics = lookup.getProviderMetrics();
// [{ provider: "Zippopotam", requests: 5, successes: 5, failures: 0, ... }]
```

## Bulk Lookup

```ts
const results = await lookup.lookupZips(["10001", "90210", "60601"], 3);
// [{ zip, data, provider }, { zip, data: null, error }, ...]
```

## Custom Mapper

```ts
const city = await lookup.lookup("10001", (addr) => addr.city);
// "New York City"
```

## Events

```ts
lookup.on("success", ({ provider, zip, duration, address }) => { ... });
lookup.on("failure", ({ provider, zip, duration, error }) => { ... });
lookup.on("cache:hit", ({ zip }) => { ... });

lookup.off("success", listener);
```

## API Summary

### `new ZipLookup(options)`

| Option | Type | Default | Description |
|---|---|---|---|
| `providers` | `ZipProvider[]` | required | Provider list |
| `fetcher` | `Fetcher` | `fetch` | Custom HTTP function |
| `cache` | `ZipCache` | - | Cache implementation |
| `rateLimit` | `{ requests, per }` | - | Rate limit window |
| `staggerDelay` | `number` | `100` | ms before backup providers fire |
| `retries` | `number` | `0` | Retry count after all fail |
| `retryDelay` | `number` | `1000` | Base retry delay (exponential) |
| `circuitBreaker` | `CircuitBreakerOptions` | enabled | Resilience per provider |
| `logger` | `{ debug }` | - | Debug logger |

### Methods

- `lookup(zip, mapper?): Promise<ZipAddress>`
- `lookupZips(zips, concurrency?, mapper?): Promise<BulkZipResult[]>`
- `warmup(): Promise<ZipProvider[]>`
- `getProviderHealth(): ProviderHealth[]`
- `getProviderMetrics(): ProviderMetrics[]`
- `on(event, listener)` / `off(event, listener)`

## Custom Provider

```ts
import type { ZipProvider } from "@eusilvio/zip-lookup";

const myProvider: ZipProvider = {
  name: "MyProvider",
  timeout: 3000,
  buildUrl: (zip) => `https://my-api.example.com/zip/${zip}`,
  transform: (response) => ({
    zip: response.postal_code,
    city: response.city,
    state: response.state_name,
    stateAbbr: response.state_code,
    country: "United States",
    service: "MyProvider",
  }),
};
```

## Compatibility

- Node.js: `20.x`, `22.x`, `24.x`
- Works in browser environments that support `fetch`

## License

MIT

# US ZIP

`@eusilvio/zip-lookup` applies the same architecture to US postal codes: provider racing, circuit breaker, cache with stale-if-error, rate limiting, events and metrics.

```bash
npm install @eusilvio/zip-lookup
```

## Usage

```ts
import { ZipLookup } from "@eusilvio/zip-lookup";
import { zippopotamProvider, zippopotamPlusProvider } from "@eusilvio/zip-lookup/providers";

const zip = new ZipLookup({
  providers: [zippopotamProvider, zippopotamPlusProvider],
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
});

const address = await zip.lookup("90210");
// {
//   zip: '90210',
//   city: 'Beverly Hills',
//   state: 'California',
//   stateAbbr: 'CA',
//   country: 'United States',
//   latitude: '34.0901',
//   longitude: '-118.4065',
//   service: 'Zippopotam'
// }
```

## ZipAddress

```ts
interface ZipAddress {
  zip: string;
  city: string;
  state: string;      // full name
  stateAbbr: string;  // 2-letter abbreviation
  county?: string;
  country: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  service: string;
}
```

## Providers

```ts
import {
  zippopotamProvider,
  zippopotamPlusProvider,
  createZipcodestackProvider,
  createUspsProvider,
} from "@eusilvio/zip-lookup/providers";
```

| Provider | API key | Note |
| --- | --- | --- |
| `zippopotamProvider` | no | free, no signup |
| `zippopotamPlusProvider` | no | variant with extra place data |
| `createZipcodestackProvider(apiKey)` | yes | factory: pass the key |
| `createUspsProvider(apiKey)` | yes | official USPS API |

```ts
const zip = new ZipLookup({
  providers: [
    zippopotamProvider,
    createZipcodestackProvider(process.env.ZIPCODESTACK_KEY!),
  ],
});
```

`ZipProvider` accepts a **per-provider** `fetcher` - useful when an API speaks XML instead of JSON, like the USPS one:

```ts
const provider: ZipProvider = {
  name: "MyAPI",
  buildUrl: (zip) => `https://api.example.com/zip/${zip}`,
  transform: (raw) => ({ /* ... */ }),
  fetcher: async (url, signal) => parseXml(await (await fetch(url, { signal })).text()),
};
```

## Differences from cep-lookup

| | `cep-lookup` | `zip-lookup` |
| --- | --- | --- |
| Class | `CepLookup` | `ZipLookup` |
| Result | `Address` | `ZipAddress` |
| Not-found error | `CepNotFoundError` | `ZipNotFoundError` |
| Offline fallback | yes (Correios map) | no |
| Reverse search | yes (ViaCEP) | no |
| Persistent cache adapters | yes | `InMemoryCache` only |
| Per-provider `fetcher` | no (global only) | yes |
| Events | includes `offline:fallback` | `success`, `failure`, `cache:hit`, `cache:stale` |

Everything else - `staleIfError`, `negativeCacheTtl`, coalescing, `warmup()`, `getProviderHealth()`, `getProviderMetrics()`, rate limiting with `strategy` - behaves identically. See [Resilience](/en/guide/resilience) and [Observability](/en/guide/observability).

## Errors

```ts
import {
  ZipValidationError,      // INVALID_ZIP
  ZipNotFoundError,        // NOT_FOUND
  ProviderTimeoutError,    // TIMEOUT
  RateLimitError,          // RATE_LIMITED
  AllProvidersFailedError, // ALL_PROVIDERS_FAILED
  ProviderUnavailableError,// PROVIDER_UNAVAILABLE
} from "@eusilvio/zip-lookup";
```

# Quick start

## Install

::: code-group

```bash [npm]
npm install @eusilvio/cep-lookup
```

```bash [pnpm]
pnpm add @eusilvio/cep-lookup
```

```bash [yarn]
yarn add @eusilvio/cep-lookup
```

:::

For React or Vue, install the integration package too - the core is a peer dependency:

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-react
# or
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-vue
```

## First lookup

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

const cep = new CepLookup({ providers: [viaCepProvider, brasilApiProvider] });

const address = await cep.lookup("01001-000");
console.log(address.street, address.city, address.state);
// Praça da Sé São Paulo SP
```

Any formatting works: `01001-000`, `01001000` or `01 001 000`. Everything that isn't a digit is stripped before validation.

## Import subpaths

The package exposes five entry points, so you only pay for what you use:

| Import | Contains |
| --- | --- |
| `@eusilvio/cep-lookup` | `CepLookup`, `InMemoryCache`, errors, types |
| `@eusilvio/cep-lookup/providers` | Built-in providers and `createGatewayProvider` |
| `@eusilvio/cep-lookup/cache` | Persistent adapters and `KeyValueCache` |
| `@eusilvio/cep-lookup/offline` | Zero-network CEP intelligence (~2 KB) |
| `@eusilvio/cep-lookup/verify` | Address verification and CEP correction |

## Production config

This is the config worth copying into a real service:

```ts
import { CepLookup, InMemoryCache } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

const cep = new CepLookup({
  providers: [
    { ...viaCepProvider,    timeout: 1200 },
    { ...brasilApiProvider, timeout: 1200 },
    { ...apicepProvider,    timeout: 1200 },
  ],
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
  retryDelay: 300,
  rateLimit: { requests: 60, per: 60_000, strategy: "wait" },
  cache: new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5_000 }),
  staleIfError: { maxAgeMs: 24 * 60 * 60_000 },
  negativeCacheTtl: 60_000,
  offlineFallback: true,
});
```

What each block buys you:

- **Per-provider `timeout`** cuts the latency tail before it becomes your server's timeout.
- **`circuitBreaker`** isolates whoever failed three times in a row for 30s.
- **`retries: 1`** gives the whole race a second chance, with exponential backoff from `retryDelay`.
- **`rateLimit` with `strategy: "wait"`** holds the call instead of throwing `RateLimitError` - ideal for jobs.
- **`cache`** absorbs the repeated CEP; **`staleIfError`** serves old data during a total outage.
- **`negativeCacheTtl`** stops you from re-resolving a CEP already known not to exist.
- **`offlineFallback`** guarantees state and area code even with no network.

## Errors

```ts
import { CepNotFoundError, AllProvidersFailedError } from "@eusilvio/cep-lookup";

try {
  await cep.lookup("99999-999");
} catch (error) {
  if (error instanceof CepNotFoundError) {
    // CEP doesn't exist - tell the user
  } else if (error instanceof AllProvidersFailedError) {
    // every provider is down - degrade the UI
  }
}
```

Every error carries an explicit `.code`, no string parsing. See [Error handling](/en/guide/errors).

## Next steps

- [How it works](/en/guide/how-it-works) - a request's path through the engine
- [Resilience](/en/guide/resilience) - circuit breaker, retries, rate limit, warmup
- [Cache](/en/guide/cache) - persistent adapters and stale-if-error

# @eusilvio/cep-lookup

[![NPM Version](https://img.shields.io/npm/v/@eusilvio/cep-lookup.svg)](https://www.npmjs.com/package/@eusilvio/cep-lookup)
[![Build Status](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/ci.yml)](https://github.com/eusilvio/cep-lookup/actions)
[![Release](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/release.yml?label=release)](https://github.com/eusilvio/cep-lookup/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, resilient, and framework-agnostic Brazilian CEP lookup library.

## Packages

- [`@eusilvio/cep-lookup`](packages/cep-lookup): core engine.
- [`@eusilvio/cep-lookup-react`](packages/cep-lookup-react): React hooks/provider.
- [`@eusilvio/cep-lookup-vue`](packages/cep-lookup-vue): Vue 3 composition hooks.

## What's New

- Standardized errors with explicit codes.
- Circuit breaker per provider (automatic cooldown/recovery).
- Provider health scoring and runtime metrics API.
- Contract tests for all built-in providers.
- Observability events (`success`, `failure`, `cache:hit`).

## Compatibility

- Node.js: `20.x`, `22.x`, `24.x`
- React package: `react >= 16.8`
- Vue package: `vue ^3`
- Browser APIs required: `fetch`, `Promise.any`, `AbortController`

## Quick Start

```bash
npm install @eusilvio/cep-lookup
```

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
});

const address = await cepLookup.lookup("01001-000");
console.log(address);
```

## Resilience Example

```ts
import { CepLookup, CepNotFoundError, ProviderTimeoutError } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    cooldownMs: 30_000,
  },
  retries: 1,
});

try {
  await cepLookup.lookup("01001000");
} catch (error) {
  if (error instanceof CepNotFoundError) {
    console.log("CEP não encontrado");
  } else if (error instanceof ProviderTimeoutError) {
    console.log("Provider expirou timeout");
  }
}
```

## Health and Metrics Example

```ts
const health = cepLookup.getProviderHealth();
const metrics = cepLookup.getProviderMetrics();

console.table(health);
console.table(metrics);
```

## Community

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md)
- [SUPPORT.md](SUPPORT.md)

## License

MIT © [Silvio Souza](https://github.com/eusilvio)

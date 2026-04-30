# @eusilvio/cep-lookup

[![NPM Version](https://img.shields.io/npm/v/@eusilvio/cep-lookup.svg)](https://www.npmjs.com/package/@eusilvio/cep-lookup)
[![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/@eusilvio/cep-lookup)](https://www.npmjs.com/package/@eusilvio/cep-lookup)
[![Build Status](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/ci.yml)](https://github.com/eusilvio/cep-lookup/actions)
[![Release](https://img.shields.io/github/actions/workflow/status/eusilvio/cep-lookup/release.yml?label=release)](https://github.com/eusilvio/cep-lookup/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, flexible, and agnostic Brazilian CEP (postal code) lookup library. Query multiple providers simultaneously and get the fastest response.

## Key Features

- **⚡ Race Strategy**: Queries multiple APIs (ViaCEP, BrasilAPI, ApiCEP) and returns the fastest valid response.
- **🧠 Smart Warmup**: Predictively finds the fastest provider for the user's network before they even hit "search".
- **🛡️ Built-in Security**: Robust data validation, sanitization, and automatic CEP normalization.
- **🚀 High Performance**: Sub-microsecond cache resolution (~2.5M ops/s).
- **📦 Dual-Build**: Native support for ESM (`.mjs`) and CommonJS (`.cjs`).
- **🔌 Framework Ready**: Official hooks for React and Vue 3, and easily extensible to others.

---

## Performance

`cep-lookup` is built for speed. Here are the benchmarking results (Node.js 22, Apple M1):

| Task | Throughput (ops/s) | Avg Latency |
| :--- | :--- | :--- |
| **Lookup (Cache Hit)** | **~2,550,000** | **483 ns** |
| **CEP Validation** | ~8,300,000 | 156 ns |
| **Event Emission** | ~11,000,000 | 93 ns |
| **Cache Access** | ~12,400,000 | 109 ns |

---

## Packages in this Monorepo

- [`@eusilvio/cep-lookup`](packages/cep-lookup): Core library (agnostic).
- [`@eusilvio/cep-lookup-react`](packages/cep-lookup-react): Official React hooks and provider.
- [`@eusilvio/cep-lookup-vue`](packages/cep-lookup-vue): Official Vue 3 composition API hooks.

## Compatibility

- Node.js: `20.x`, `22.x`, `24.x`
- React package: `react >= 16.8`
- Vue package: `vue ^3`
- Browser APIs required: `fetch`, `Promise.any`, `AbortController`

Full policy: [SUPPORT.md](SUPPORT.md)

---

## Quick Start

### Installation

```bash
npm install @eusilvio/cep-lookup
```

### Basic Usage

```typescript
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
});

const address = await cepLookup.lookup("01001-000");
// { cep: '01001000', street: 'Praça da Sé', ... }
```

## Advanced Features

### Caching and Rate Limiting

```typescript
import { CepLookup, InMemoryCache } from "@eusilvio/cep-lookup";

const cepLookup = new CepLookup({
  providers: [...],
  cache: new InMemoryCache(), // 1. Enable built-in in-memory cache
  rateLimit: {
    requests: 100, // 2. Max 100 requests
    per: 60000     // 3. Per minute
  }
});
```

### Observability

```typescript
cepLookup.on('success', (event) => {
  console.log(`${event.cep} found via ${event.provider} in ${event.duration}ms`);
});

cepLookup.on('failure', ({ cep, error }) => {
  console.error(`Failed to find ${cep}: ${error.message}`);
});
```

### Smart Warmup (Predictive Ranking)

Optimize performance by pre-calculating the fastest provider when the user interacts with the UI (e.g., input focus).

```typescript
// 1. Call warmup when user focuses the field
input.onfocus = () => cepLookup.warmup();

// 2. The subsequent lookup will prioritize the fastest provider
const address = await cepLookup.lookup("01001-000");
```



## License



MIT © [Silvio Souza](https://github.com/eusilvio)

## Community

- Contributing guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](SECURITY.md)

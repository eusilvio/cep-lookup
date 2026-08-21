---
layout: home

hero:
  name: cep-lookup
  text: Fault-tolerant CEP resolution
  tagline: Provider racing, circuit breaker, persistent cache and offline fallback - without changing a line of your application code.
  actions:
    - theme: brand
      text: Quick start
      link: /en/guide/quick-start
    - theme: alt
      text: Introduction
      link: /en/guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/eusilvio/cep-lookup

features:
  - title: Provider racing
    details: ViaCEP, BrasilAPI, APICep and OpenCEP fire in parallel with a staggered start. The first valid response wins, the rest are discarded.
    link: /en/guide/providers
    linkText: See providers
  - title: Per-provider circuit breaker
    details: A provider that keeps failing is isolated, cools down and comes back through a half-open probe. One unstable API never poisons the others.
    link: /en/guide/resilience
    linkText: See resilience
  - title: Cache that outlives the process
    details: In-memory, localStorage, IndexedDB, Redis and Cloudflare KV - all with stale-if-error, negative caching and request coalescing.
    link: /en/guide/cache
    linkText: See cache
  - title: Zero-network offline fallback
    details: The official Correios CEP allocation map is bundled (~2 KB). Even with everything down, you still answer with state and area code.
    link: /en/guide/offline
    linkText: See offline layer
  - title: Built-in observability
    details: Success, failure, cache hit and stale events, plus per-provider health score and p95 metrics ready to expose on an internal endpoint.
    link: /en/guide/observability
    linkText: See observability
  - title: React, Vue and US ZIP
    details: Official React and Vue 3 hooks, plus @eusilvio/zip-lookup with the same architecture for US postal codes.
    link: /en/guide/react
    linkText: See integrations
---

## Install and resolve in 30 seconds

```bash
npm install @eusilvio/cep-lookup
```

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

const cep = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
});

const address = await cep.lookup("01001-000");
// {
//   cep: '01001000',
//   street: 'Praça da Sé',
//   neighborhood: 'Sé',
//   city: 'São Paulo',
//   state: 'SP',
//   service: 'ViaCEP'
// }
```

If ViaCEP is unavailable, BrasilAPI takes over. If that trips too, APICep responds. Your application keeps working.

## Comparison

| Feature | cep-promise | viacep wrappers | **cep-lookup** |
| --- | :---: | :---: | :---: |
| Multiple providers | ✅ | ❌ | ✅ |
| Circuit breaker per provider | ❌ | ❌ | ✅ |
| Provider health score | ❌ | ❌ | ✅ |
| Runtime metrics | ❌ | ❌ | ✅ |
| Event-based observability | ❌ | ❌ | ✅ |
| Retry with exponential backoff | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| Offline fallback (zero-network) | ❌ | ❌ | ✅ |
| Custom providers | ❌ | ❌ | ✅ |
| React / Vue integration | ❌ | ❌ | ✅ |

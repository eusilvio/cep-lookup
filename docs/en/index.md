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

<section class="uses">
  <h2 class="uses-title">Already in production</h2>
  <p class="uses-sub">Products that resolve CEPs with the library every day.</p>
  <div class="uses-row">
    <a class="use" href="https://agendfy.app" target="_blank" rel="noopener">
      <img class="use-logo" src="/uses/agendfy.svg" alt="agendfy" width="72" height="72" loading="lazy" />
      <span class="use-name">agendfy <span class="use-ext">↗</span></span>
      <span class="use-desc">Scheduling and management for independent beauty professionals.</span>
    </a>
    <a class="use" href="https://usesemeia.com.br" target="_blank" rel="noopener">
      <img class="use-logo" src="/uses/semeia.png" alt="semeia" width="72" height="72" loading="lazy" />
      <span class="use-name">semeia <span class="use-ext">↗</span></span>
      <span class="use-desc">Church management: cells, members and discipleship.</span>
    </a>
  </div>
</section>

<style>
.uses { margin: 72px 0 8px; text-align: center; }
.uses-title {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -.02em;
  border: 0;
  margin: 0;
  padding: 0;
}
.uses-sub {
  margin: 10px 0 40px;
  font-size: 15px;
  color: var(--vp-c-text-2);
}
.uses-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 24px;
}
.use {
  flex: 1 1 240px;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px 28px;
  border-radius: 20px;
  text-decoration: none !important;
  color: inherit;
  transition: background-color .3s ease, transform .3s ease;
}
.use:hover {
  background: var(--vp-c-bg-soft);
  transform: translateY(-3px);
}
.use-logo {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  box-shadow: 0 10px 28px -12px rgba(0,0,0,.45);
}
.use-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}
.use-ext {
  font-size: 13px;
  color: var(--vp-c-text-3);
  transition: color .3s ease;
}
.use:hover .use-ext { color: var(--vp-c-brand-1); }
.use-desc {
  font-size: 14px;
  line-height: 1.55;
  color: var(--vp-c-text-2);
  text-wrap: pretty;
}
@media (prefers-reduced-motion: reduce) {
  .use { transition: background-color .3s ease; }
  .use:hover { transform: none; }
}
</style>

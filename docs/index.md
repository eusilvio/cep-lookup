---
layout: home

hero:
  name: cep-lookup
  text: Resolução de CEP tolerante a falhas
  tagline: Corrida entre provedores, circuit breaker, cache persistente e fallback offline - sem mudar uma linha da sua aplicação.
  actions:
    - theme: brand
      text: Início rápido
      link: /guide/quick-start
    - theme: alt
      text: Introdução
      link: /guide/introduction
    - theme: alt
      text: GitHub
      link: https://github.com/eusilvio/cep-lookup

features:
  - title: Corrida entre provedores
    details: ViaCEP, BrasilAPI, APICep e OpenCEP disparam em paralelo com escalonamento. A primeira resposta válida vence; as demais são descartadas.
    link: /guide/providers
    linkText: Ver provedores
  - title: Circuit breaker por provedor
    details: Provedor que falha repetidamente é isolado, entra em cooldown e volta com uma sonda half-open. Uma API instável não contamina as outras.
    link: /guide/resilience
    linkText: Ver resiliência
  - title: Cache que sobrevive ao processo
    details: InMemory, localStorage, IndexedDB, Redis e Cloudflare KV - todos com stale-if-error, cache negativo e coalescência de requisições.
    link: /guide/cache
    linkText: Ver cache
  - title: Fallback offline sem rede
    details: Mapa oficial de faixas dos Correios embutido (~2 KB). Mesmo com tudo fora do ar, você ainda responde UF e DDD.
    link: /guide/offline
    linkText: Ver camada offline
  - title: Observabilidade nativa
    details: Eventos de sucesso, falha, cache hit e stale, mais health score e métricas p95 por provedor prontas para expor num endpoint interno.
    link: /guide/observability
    linkText: Ver observabilidade
  - title: React, Vue e ZIP dos EUA
    details: Hooks oficiais para React e Vue 3, além de @eusilvio/zip-lookup com a mesma arquitetura para códigos postais americanos.
    link: /guide/react
    linkText: Ver integrações
---

## Instale e resolva em 30 segundos

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

Se o ViaCEP cair, a BrasilAPI assume. Se ela também abrir o circuito, o APICep responde. Sua aplicação continua funcionando.

## Comparativo

| Recurso | cep-promise | wrappers de ViaCEP | **cep-lookup** |
| --- | :---: | :---: | :---: |
| Múltiplos provedores | ✅ | ❌ | ✅ |
| Circuit breaker por provedor | ❌ | ❌ | ✅ |
| Health score do provedor | ❌ | ❌ | ✅ |
| Métricas em runtime | ❌ | ❌ | ✅ |
| Observabilidade por eventos | ❌ | ❌ | ✅ |
| Retry com backoff exponencial | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| Fallback offline (zero rede) | ❌ | ❌ | ✅ |
| Provedores customizados | ❌ | ❌ | ✅ |
| Integração React / Vue | ❌ | ❌ | ✅ |

<section class="uses">
  <h2 class="uses-title">Já roda em produção</h2>
  <p class="uses-sub">Produtos que resolvem CEP com a biblioteca todos os dias.</p>
  <div class="uses-row">
    <a class="use" href="https://agendfy.app" target="_blank" rel="noopener">
      <img class="use-logo" src="/uses/agendfy.svg" alt="agendfy" width="72" height="72" loading="lazy" />
      <span class="use-name">agendfy <span class="use-ext">↗</span></span>
      <span class="use-desc">Agenda e gestão para profissionais autônomos da beleza.</span>
    </a>
    <a class="use" href="https://usesemeia.com.br" target="_blank" rel="noopener">
      <img class="use-logo" src="/uses/semeia.png" alt="semeia" width="72" height="72" loading="lazy" />
      <span class="use-name">semeia <span class="use-ext">↗</span></span>
      <span class="use-desc">Gestão para igrejas: células, membros e discipulado.</span>
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

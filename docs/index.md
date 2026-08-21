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

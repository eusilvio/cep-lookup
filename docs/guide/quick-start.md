# Início rápido

## Instalação

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

Para React ou Vue, instale também o pacote de integração - o core é peer dependency:

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-react
# ou
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-vue
```

## Primeira busca

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

const cep = new CepLookup({ providers: [viaCepProvider, brasilApiProvider] });

const address = await cep.lookup("01001-000");
console.log(address.street, address.city, address.state);
// Praça da Sé São Paulo SP
```

O CEP aceita qualquer formatação: `01001-000`, `01001000` ou `01 001 000`. Tudo que não for dígito é removido antes da validação.

## Subpaths de importação

O pacote expõe quatro entradas, então o bundle carrega só o que você importa:

| Import | Contém |
| --- | --- |
| `@eusilvio/cep-lookup` | `CepLookup`, `InMemoryCache`, erros, tipos |
| `@eusilvio/cep-lookup/providers` | Provedores prontos e `createGatewayProvider` |
| `@eusilvio/cep-lookup/cache` | Adaptadores persistentes e `KeyValueCache` |
| `@eusilvio/cep-lookup/offline` | Inteligência de CEP sem rede (~2 KB) |

## Configuração de produção

Esta é a configuração que vale copiar para um serviço real:

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

O que cada bloco faz:

- **`timeout` por provedor** corta a cauda longa de latência antes que ela vire timeout do seu servidor.
- **`circuitBreaker`** isola quem falhou três vezes seguidas por 30s.
- **`retries: 1`** dá uma segunda chance à corrida inteira, com backoff exponencial a partir de `retryDelay`.
- **`rateLimit` com `strategy: "wait"`** segura a chamada em vez de lançar `RateLimitError` - ideal em jobs.
- **`cache`** absorve o CEP repetido; **`staleIfError`** serve dado velho durante uma queda total.
- **`negativeCacheTtl`** evita repetir busca de CEP que já se sabe inexistente.
- **`offlineFallback`** garante UF e DDD mesmo sem rede.

## Erros

```ts
import { CepNotFoundError, AllProvidersFailedError } from "@eusilvio/cep-lookup";

try {
  await cep.lookup("99999-999");
} catch (error) {
  if (error instanceof CepNotFoundError) {
    // CEP não existe - mostre ao usuário
  } else if (error instanceof AllProvidersFailedError) {
    // todos os provedores fora - degrade a UI
  }
}
```

Todo erro carrega um `.code` explícito, sem parsing de string. Veja [Tratamento de erros](/guide/errors).

## Próximos passos

- [Como funciona](/guide/how-it-works) - o caminho de uma requisição por dentro
- [Resiliência](/guide/resilience) - circuit breaker, retries, rate limit, warmup
- [Cache](/guide/cache) - adaptadores persistentes e stale-if-error

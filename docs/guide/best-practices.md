# Boas práticas

Doze decisões que separam uma integração que aguenta produção de uma que aguenta o happy path.

## 1. Use pelo menos dois provedores

```ts
providers: [viaCepProvider, brasilApiProvider, apicepProvider]
```

Um provedor só transforma a instabilidade dele na sua indisponibilidade.

## 2. Defina timeout por provedor

```ts
const providers = [
  { ...viaCepProvider,    timeout: 1200 },
  { ...brasilApiProvider, timeout: 1200 },
  { ...apicepProvider,    timeout: 1200 },
];
```

Sem timeout, a cauda longa de um provedor vira a latência do seu endpoint.

## 3. Ligue o circuit breaker

```ts
circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 }
```

Impede que sua aplicação continue batendo em quem já provou estar fora.

## 4. Retente no máximo uma ou duas vezes

```ts
retries: 1,
retryDelay: 300,
```

Mais que isso multiplica latência de pior caso e piora a carga de um provedor já em dificuldade.

## 5. Limite a taxa

```ts
rateLimit: { requests: 60, per: 60_000 }
```

Contém rajada vinda do frontend antes que ela vire bloqueio do provedor.

## 6. Escolha o cache pelo tempo de vida necessário

| Precisa sobreviver a... | Adaptador |
| --- | --- |
| só o processo atual | `InMemoryCache` |
| reload da página | `WebStorageCache` (ou `IndexedDBCache` em alto volume) |
| todos os processos do servidor | `RedisCache` |
| todos os colos de edge | `CloudflareKVCache` |

```ts
import { RedisCache } from "@eusilvio/cep-lookup/cache";

cache: new RedisCache({
  client,
  ttl: 7 * 24 * 60 * 60_000,          // dados de CEP mudam na escala de meses
  evictAfter: 30 * 24 * 60 * 60_000,  // mantém entradas para o stale-if-error
  onError: (error, operation) => logger.warn({ error, operation }, "cep cache degradado"),
})
```

Mantenha `evictAfter` bem acima de `ttl`: `ttl` decide o que é fresco, `evictAfter` decide o que ainda existe para servir durante uma queda.

## 7. Trate os erros por código, não por mensagem

- `INVALID_CEP`
- `NOT_FOUND`
- `TIMEOUT`
- `RATE_LIMITED`
- `ALL_PROVIDERS_FAILED`
- `PROVIDER_UNAVAILABLE`

Veja [Tratamento de erros](/guide/errors).

## 8. Monitore health e métricas

```ts
cep.getProviderHealth();
cep.getProviderMetrics();
```

`avgLatencyMs` é EWMA (amostras recentes dominam) e `p95LatencyMs` denuncia a cauda lenta que a média esconde.

## 9. Degrade para dado velho antes de degradar para erro

```ts
cache: new InMemoryCache({ ttl: 10 * 60_000 }),
staleIfError: { maxAgeMs: 24 * 60 * 60_000 }, // nunca sirva dado com mais de 24h
```

Escute `cache:stale` e alerte se disparar demais: normalmente significa que todos os provedores estão fora.

## 10. Use cache negativo para entrada sabidamente ruim

```ts
negativeCacheTtl: 60_000,
```

Se o produto reenvia o mesmo formulário várias vezes, isso evita repetir buscas que já se sabem 404.

## 11. Escolha a estratégia de rate limit pelo contexto

- `strategy: "throw"` (padrão) para requisição de usuário: falhe rápido, deixe a UI retentar.
- `strategy: "wait"` para jobs e lotes, onde segurar a chamada é melhor que tratar `RateLimitError`.

## 12. Cancele requisição de UI obsoleta

```ts
const controller = new AbortController();
cep.lookup(valor, { signal: controller.signal });
// depois: controller.abort();
```

Assim uma resposta atrasada nunca sobrescreve o estado atual. Os hooks de React e Vue já fazem isso.

## Bônus: valide sem rede antes de gastar rede

```ts
import { isCepAllocated, cepMatchesState } from "@eusilvio/cep-lookup/offline";

if (!isCepAllocated(form.cep)) return erro("CEP inexistente.");
if (!cepMatchesState(form.cep, form.uf)) return erro(`CEP não pertence a ${form.uf}.`);
```

Zero latência, zero quota consumida, e pega o erro de digitação mais comum de checkout.

# CepLookup

```ts
import { CepLookup } from "@eusilvio/cep-lookup";

const cep = new CepLookup(options);
```

## Opções do construtor

| Opção | Tipo | Padrão | Descrição |
| --- | --- | --- | --- |
| `providers` | `Provider[]` | - | **Obrigatório.** Provedores que entram na corrida |
| `fetcher` | `(url, signal?) => Promise<any>` | `fetch` + `json()` | Cliente HTTP global |
| `cache` | `Cache` | - | Implementação de cache (sync ou async) |
| `rateLimit` | `RateLimitOptions` | - | `{ requests, per, strategy? }` |
| `staggerDelay` | `number` | `100` | Atraso, em ms, antes de liberar os provedores de backup |
| `retries` | `number` | `0` | Repetições da corrida inteira após falha geral |
| `retryDelay` | `number` | `1000` | Base do backoff exponencial entre tentativas, em ms |
| `logger` | `{ debug(msg, data?) }` | - | Logger de eventos internos |
| `circuitBreaker` | `CircuitBreakerOptions` | habilitado | `{ enabled?, failureThreshold?, cooldownMs? }` |
| `staleIfError` | `boolean \| { maxAgeMs?: number }` | `false` | Serve entrada vencida quando todos falham |
| `negativeCacheTtl` | `number` | - | TTL, em ms, para lembrar CEPs inexistentes |
| `offlineFallback` | `boolean` | `false` | Sintetiza endereço parcial em nível de UF como último recurso |

## lookup

```ts
lookup<T = Address>(
  cep: string,
  arg?: LookupOptions<T> | ((address: Address) => T),
): Promise<T>
```

Resolve um CEP. Aceita qualquer formatação; tudo que não for dígito é removido antes da validação.

```ts
const address = await cep.lookup("01001-000");

// com cancelamento
const controller = new AbortController();
await cep.lookup("01001000", { signal: controller.signal });

// com mapper
const resumo = await cep.lookup("01001000", { mapper: (a) => `${a.city}/${a.state}` });

// forma legada, ainda suportada
const resumo2 = await cep.lookup("01001000", (a) => `${a.city}/${a.state}`);
```

**Lança:** `CepValidationError`, `CepNotFoundError`, `RateLimitError`, `AllProvidersFailedError` - ou `AbortError` quando o `signal` é abortado.

## lookupCeps

```ts
lookupCeps<T = Address>(
  ceps: string[],
  concurrency?: number,        // padrão: 5
  mapper?: (address: Address) => T,
): Promise<BulkCepResult<T>[]>
```

Busca em lote com concorrência controlada. **Não lança** por item: cada resultado carrega o próprio erro.

```ts
const results = await cep.lookupCeps(["01001-000", "04538-133", "99999-999"], 3);

results.forEach(({ cep, data, provider, error }) => {
  if (error) console.error(`${cep}: ${error.message}`);
  else console.log(`${cep}: ${data?.street} (via ${provider})`);
});
```

## searchByAddress

```ts
searchByAddress(
  state: string,
  city: string,
  street: string,
  options?: SearchByAddressOptions, // { signal? }
): Promise<Address[]>
```

Busca reversa: encontra CEPs candidatos a partir de UF, cidade e logradouro. Requer um provedor que implemente `buildSearchUrl` e `transformSearch` - o `viaCepProvider` implementa.

```ts
const candidatos = await cep.searchByAddress("SP", "São Paulo", "Praça da Sé");

// com cancelamento
await cep.searchByAddress("SP", "São Paulo", "Praça da Sé", { signal: controller.signal });
```

Cidade e rua precisam ter no mínimo 3 caracteres (exigência do ViaCEP). O ViaCEP casa palavras literais e devolve no máximo 50 resultados: "Dr Arnaldo" não encontra nada, "Doutor Arnaldo" encontra. Para conferir um endereço inteiro contra o CEP, use [`verifyAddress`](/api/verify).

## warmup

```ts
warmup(): Promise<Provider[]>
```

Pinga todos os provedores, mede a latência real e reordena a lista base. Devolve a nova ordem. Cada provedor usa `provider.timeout ?? 5000ms` com `AbortController` próprio, então um provedor travado não bloqueia os demais.

```ts
await cep.warmup();
```

## getProviderHealth

```ts
getProviderHealth(): ProviderHealth[]
```

Snapshot de saúde por provedor, ordenado do mais saudável para o menos.

```ts
cep.getProviderHealth();
// [{ provider: 'ViaCEP', score: 0.96, isOpen: false, consecutiveFailures: 0,
//    successCount: 24, failureCount: 1, avgLatencyMs: 48, p95LatencyMs: 92 }, ...]
```

Cálculo do score:

```
score = taxaDeSucesso * 0.8 + (1 - min(latenciaMedia / 1000, 1)) * 0.2 - (circuitoAberto ? 1 : 0)
```

## getProviderMetrics

```ts
getProviderMetrics(): ProviderMetrics[]
```

Contadores acumulados por provedor, na ordem de configuração.

```ts
cep.getProviderMetrics();
// [{ provider: 'ViaCEP', requests: 25, successes: 24, failures: 1,
//    timeoutErrors: 0, notFoundErrors: 1, avgLatencyMs: 48, p95LatencyMs: 92 }, ...]
```

## on / off

```ts
on<T extends EventName>(eventName: T, listener: EventListener<T>): void
off<T extends EventName>(eventName: T, listener: EventListener<T>): void
```

Registra e remove listeners. Eventos disponíveis: `success`, `failure`, `cache:hit`, `cache:stale`, `offline:fallback`.

```ts
const onFailure = ({ provider, error }) => logger.warn(provider, error.message);

cep.on("failure", onFailure);
cep.off("failure", onFailure);
```

Um listener que lança não interrompe a busca: o erro é engolido e reportado ao `logger.debug`, se houver logger.

## Veja também

- [Tipos](/api/types)
- [Cache](/api/cache)
- [Offline](/api/offline)
- [Verificação](/api/verify)
- [Erros](/api/errors)

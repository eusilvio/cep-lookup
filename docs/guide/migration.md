# Migração

Todas as versões desta série são retrocompatíveis: nada abaixo exige mudança de código. Cada adição é opt-in.

::: info Versões
A verificação de endereço descrita abaixo exige `2.10.0` ou superior; os adaptadores de cache persistente, `2.9.0`.
:::

## 2.9.x → 2.10.0

### Adicionado

- **Verificação de endereço** no subpath `@eusilvio/cep-lookup/verify`: `verifyAddress(cep, endereco)` confere UF, cidade, bairro, logradouro e número contra o CEP e devolve status (`confirmed`, `plausible`, `conflict`, `unverifiable`, `not_found`, `invalid`), score, resultado por campo e uma sugestão pronta para salvar. Dado ruim nunca lança erro.
- **Correção de CEP**: quando o CEP conflita com o endereço, não existe ou está malformado, uma busca reversa encontra o CEP que atende aquele logradouro e número - ou lista `candidates` quando mais de um serve.
- **Número contra a faixa dos Correios**: `de 612 a 1510 - lado par`, `até 894/0895`, CEPs de grande usuário.
- **Peças sem rede**: `compareAddress`, `normalizeAddressText`, `parseNumberRange` e `isNumberInRange`.
- **`searchByAddress(uf, cidade, rua, { signal })`** aceita `AbortSignal`.
- **`openCepProvider`** passa a preencher `Address.complement`.

O entry point principal não cresceu: a verificação só existe no subpath `/verify`. Os tipos também são exportados do entry principal.

```bash
npm i @eusilvio/cep-lookup@^2.10.0
```

## 2.8.x → 2.9.0

### Adicionado

- **Adaptadores de cache persistente** no subpath `@eusilvio/cep-lookup/cache`: `WebStorageCache` (localStorage/sessionStorage, com limite de entradas e ciente de cota), `IndexedDBCache`, `RedisCache` (`ioredis`, `node-redis` e `@upstash/redis`, com dialeto autodetectado) e `CloudflareKVCache` (Workers KV). Todos implementam `getStale()`, então `staleIfError` funciona com qualquer um.
- **`KeyValueCache` + `KeyValueDriver`**: backend customizado em ~30 linhas. Você implementa três métodos sobre strings; serialização, namespace, TTL lógico, metadados de staleness e isolamento de erro vêm de graça.
- **`onError` por cache**: falha do store é reportada e engolida, nunca propagada para dentro do `lookup()`.

O entry point principal não cresceu: os adaptadores só existem no subpath `/cache`.

```bash
npm i @eusilvio/cep-lookup@^2.9.0
```

Nada muda se você continuar no `InMemoryCache`.

## 2.7.x → 2.8.0

### Adicionado

- **`offlineFallback`**: último degrau da escada (corrida → retries → cache stale → **offline** → erro). Quando todos os provedores falham por erro de infraestrutura e não há entrada stale utilizável, `lookup()` sintetiza um `Address` parcial em nível de UF (`state`, `ddd`, `service: "offline"`, `partial: true`) a partir do mapa oficial de faixas dos Correios embutido (~2 KB). Not-found genuíno nunca é mascarado, e o endereço parcial nunca é gravado no cache.
- **Evento `offline:fallback`** para observabilidade.
- **`Address.partial`**: presente apenas em endereços sintetizados.
- **API síncrona sem rede**, também disponível isolada em `@eusilvio/cep-lookup/offline`: `resolveCepOffline`, `stateFromCep`, `isCepAllocated` e `cepMatchesState` - validação cruzada CEP↔UF em 0ms.

```bash
npm i @eusilvio/cep-lookup@^2.8.0
```

## 2.6.x → 2.7.0

### Adicionado

- **Contrato de `Cache` assíncrono**: `get`/`set`/`delete`/`has`/`clear` podem devolver valor direto ou `Promise` (`MaybePromise<T>`). O `InMemoryCache` continua síncrono; o motor faz `await` em toda chamada, então um cache em Redis/KV funciona sem adaptador.
- **`staleIfError`**: serve endereço em cache (mesmo expirado) quando todos os provedores falham por erro de infraestrutura, em vez de lançar. Emite `cache:stale`. Requer cache com `getStale()`.
- **`negativeCacheTtl`**: memoriza CEPs confirmados como inexistentes por um TTL.
- **Coalescência de requisições (singleflight)**: chamadas concorrentes para o mesmo CEP compartilham uma requisição em voo.
- **`lookup(cep, options)`**: o segundo argumento passa a aceitar `{ signal?, mapper? }`. A forma legada `lookup(cep, mapper)` segue funcionando.
- **`searchByAddress(state, city, street)`**: busca reversa via ViaCEP.
- **`Address.location`** (latitude/longitude), preenchido pelo `brasilApiProvider`, agora no endpoint v2 da BrasilAPI.
- **`Address.complement`**, mapeado do campo `complemento` do ViaCEP.
- **`createGatewayProvider({ baseUrl, apiKey?, name? })`**: fábrica de provedor para gateway próprio que já devolve `Address` normalizado.
- **`rateLimit.strategy`**: `"throw"` (padrão, inalterado) ou `"wait"`.
- **`p95LatencyMs`** em `ProviderHealth`/`ProviderMetrics`; `avgLatencyMs` passou a ser média móvel exponencialmente ponderada em vez de média de toda a vida.
- **Circuit breaker half-open**: após o cooldown, exatamente uma sonda é liberada; se ela falhar, o circuito reabre.

### Mudanças de comportamento (não quebram, mas vale saber)

- `CepNotFoundError` não conta mais para `consecutiveFailures` nem abre o circuito. Continua contabilizado em `notFoundErrors`/`failureCount`.
- Com `retries` configurado, um not-found genuíno não é mais retentado - falha rápido.
- Um listener de `.on()` que lança não quebra mais o fluxo da busca; o erro é engolido e reportado ao `logger.debug`.
- `warmup()` aplica timeout por provedor (`provider.timeout ?? 5000ms`) com `AbortController` próprio.

### React

- `useCepLookup` passa um `AbortSignal` para `lookup()` e aborta a requisição em voo na troca de CEP ou no unmount, em vez de só descartar o resultado depois. Sem mudança de API para quem consome o hook.

### Upgrade

```bash
npm i @eusilvio/cep-lookup@^2.7.0 @eusilvio/cep-lookup-react@^2.7.0 @eusilvio/cep-lookup-vue@^2.7.0 @eusilvio/zip-lookup@^2.7.0
```

## 2.5.x → 2.6.0

### Adicionado

- Códigos de erro padronizados nos erros do core.
- Opções de circuit breaker em `CepLookupOptions`.
- `getProviderHealth()` e `getProviderMetrics()`.
- Testes de contrato de provedor e testes de métricas de resiliência.

### Mudanças de comportamento

- Provedores podem ser temporariamente pulados quando o circuito está aberto.
- Falhas de not-found/404 são normalizadas para `CepNotFoundError` sempre que possível.

### Versões de React/Vue

`@eusilvio/cep-lookup-react` e `@eusilvio/cep-lookup-vue` foram alinhados em `2.6.0` e passaram a exigir `@eusilvio/cep-lookup ^2.6.0` como peer dependency.

### Upgrade

1. Suba todos os pacotes juntos:

```bash
npm i @eusilvio/cep-lookup@^2.6.0 @eusilvio/cep-lookup-react@^2.6.0 @eusilvio/cep-lookup-vue@^2.6.0
```

2. Se você dependia da ordem exata de tentativa dos provedores, revise as configurações de circuit breaker.
3. Adicione tratamento explícito dos erros padronizados nas camadas de UI e API.

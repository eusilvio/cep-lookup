# Cache

O cache é o degrau mais barato da escada: um hit resolve em menos de um microssegundo, sem rede. Também é o que sustenta o `stale-if-error` durante uma queda total.

## InMemoryCache

O padrão, síncrono, morre com o processo:

```ts
import { CepLookup, InMemoryCache } from "@eusilvio/cep-lookup";

const cep = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5_000 }),
});
```

## Adaptadores persistentes

Quatro adaptadores prontos no subpath `@eusilvio/cep-lookup/cache`. Todos implementam `getStale()`, então `staleIfError` funciona com qualquer um:

| Adaptador | Backend | Use quando |
| --- | --- | --- |
| `WebStorageCache` | `localStorage` / `sessionStorage` | app no browser: sobrevive ao reload, ~500 entradas |
| `IndexedDBCache` | IndexedDB | browser resolvendo muitos CEPs, fora da main thread |
| `RedisCache` | `ioredis`, `node-redis`, `@upstash/redis` | servidores: um lookup por CEP entre todos os processos |
| `CloudflareKVCache` | Workers KV | edge: resolvido num colo, servido de todos |

Escolha pelo tempo de vida que você precisa:

| Precisa sobreviver a... | Adaptador |
| --- | --- |
| só o processo atual | `InMemoryCache` |
| reload da página | `WebStorageCache` (ou `IndexedDBCache` em alto volume) |
| todos os processos do servidor | `RedisCache` |
| todos os colos de edge | `CloudflareKVCache` |

### Browser

```ts
import { WebStorageCache } from "@eusilvio/cep-lookup/cache";

const cep = new CepLookup({
  providers,
  cache: new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300 }),
  staleIfError: true,
});
```

`sessionStorage` para cache por aba: `new WebStorageCache({ storage: sessionStorage })`. Quando o navegador recusa a escrita por falta de espaço, o adaptador descarta as entradas mais antigas e tenta de novo - ele nunca estoura a cota de outros scripts da mesma origem.

Para apps que resolvem centenas de CEPs, troque por `IndexedDBCache`: mesmas opções, sem bloquear a main thread e sem disputar os ~5 MB do Web Storage.

```ts
import { IndexedDBCache } from "@eusilvio/cep-lookup/cache";

const cache = new IndexedDBCache({
  ttl: 24 * 60 * 60_000,
  dbName: "cep-lookup",   // padrão
  storeName: "addresses", // padrão
});
```

### Servidor

```ts
import Redis from "ioredis";
import { RedisCache } from "@eusilvio/cep-lookup/cache";

const cep = new CepLookup({
  providers,
  cache: new RedisCache({
    client: new Redis(process.env.REDIS_URL!),
    ttl: 7 * 24 * 60 * 60_000,          // frescor lógico
    evictAfter: 30 * 24 * 60 * 60_000,  // expiração física - deixa margem para leitura stale
    onError: (error, operation) => logger.warn({ error, operation }, "cep cache degradado"),
  }),
  staleIfError: true,
});
```

O cliente é **injetado**, nunca importado: zero dependências, e o dialeto de `SET` com expiração é detectado na primeira escrita. Funciona com `ioredis`, `node-redis` e `@upstash/redis`.

### Edge

```ts
import { CloudflareKVCache } from "@eusilvio/cep-lookup/cache";

export default {
  async fetch(request: Request, env: Env) {
    const cep = new CepLookup({
      providers,
      cache: new CloudflareKVCache({
        namespaceBinding: env.CEP_CACHE,
        ttl: 24 * 60 * 60_000,
        evictAfter: 30 * 24 * 60 * 60_000, // mínimo aceito pela Cloudflare: 60s
      }),
      staleIfError: true,
    });

    const url = new URL(request.url);
    return Response.json(await cep.lookup(url.searchParams.get("cep")!));
  },
};
```

## Opções compartilhadas

| Opção | Padrão | O que faz |
| --- | --- | --- |
| `ttl` | `Infinity` | frescor lógico em ms |
| `namespace` | `"cep-lookup"` | prefixo das chaves; o adaptador nunca toca em chaves fora dele |
| `evictAfter` | - | expiração física entregue ao store (Redis `PX`, KV `expirationTtl`) |
| `onError` | silêncio | recebe a falha do store; o erro é engolido e nunca chega ao `lookup()` |

Regra prática: mantenha `evictAfter` bem acima de `ttl`. `ttl` decide o que é **fresco**; `evictAfter` decide o que ainda **existe** para o `staleIfError` servir durante uma queda.

## Backend customizado

Implemente três métodos sobre strings opacas e o `KeyValueCache` cuida de serialização, namespace, TTL e staleness:

```ts
import { KeyValueCache, KeyValueDriver } from "@eusilvio/cep-lookup/cache";

const driver: KeyValueDriver = {
  get: (key) => memcached.get(key),
  set: (key, value, evictAfterMs) => memcached.set(key, value, evictAfterMs),
  delete: (key) => memcached.del(key),
};

const cep = new CepLookup({
  providers,
  cache: new KeyValueCache(driver, { ttl: 600_000 }),
});
```

Dois métodos opcionais completam o contrato: `keys()` (habilita `clear()`) e `clear()` nativo.

## Cache assíncrono

Todo método de `Cache` (`get`/`set`/`delete`/`has`/`clear`) pode devolver o valor direto ou uma `Promise`. O motor sempre faz `await`, então cache assíncrono funciona sem adaptador. O `InMemoryCache` continua totalmente síncrono.

## Stale-if-error

Quando **todos** os provedores falham por erro de infraestrutura (não por not-found) e existe uma entrada em cache - mesmo expirada - ela é servida em vez de lançar erro:

```ts
const cep = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: { maxAgeMs: 24 * 60 * 60_000 }, // ou `true` para aceitar qualquer idade
});

cep.on("cache:stale", ({ cep, address }) => {
  logger.warn(`Servindo endereço vencido para ${cep} - todos os provedores estão fora`);
});
```

Requer um cache que implemente `getStale()` - todos os incluídos implementam. Monitore o evento `cache:stale`: se ele dispara com frequência, algo está estruturalmente errado com seus provedores.

## Cache negativo

CEP confirmado como inexistente fica lembrado por um TTL, e buscas repetidas nem tocam a rede:

```ts
const cep = new CepLookup({
  providers,
  cache: new InMemoryCache(),
  negativeCacheTtl: 60_000,
});
```

Útil quando o produto reenvia o mesmo formulário várias vezes com um CEP digitado errado.

## Coalescência de requisições

Chamadas concorrentes para o mesmo CEP compartilham uma única requisição em voo - inclusive sem cache configurado:

```ts
// Uma única ida à rede.
await Promise.all([
  cep.lookup("01001000"),
  cep.lookup("01001000"),
  cep.lookup("01001000"),
]);
```

## O que nunca vai para o cache

Endereços parciais do [fallback offline](/guide/offline) (`partial: true`) **nunca** são gravados. Eles são resposta degradada de emergência, não dado bom o suficiente para ser reaproveitado.

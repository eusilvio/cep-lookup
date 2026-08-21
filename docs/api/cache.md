# Cache

## Contrato

```ts
interface Cache {
  get(key: string): MaybePromise<Address | undefined>;
  set(key: string, value: Address): MaybePromise<void>;
  clear(): MaybePromise<void>;
  delete?(key: string): MaybePromise<void>;
  has?(key: string): MaybePromise<boolean>;
  getStale?(key: string): MaybePromise<StaleCacheEntry | undefined>;
}

interface StaleCacheEntry {
  value: Address;
  isStale: boolean;
  ageMs?: number;
}
```

`getStale()` é o que habilita `staleIfError`. Todas as implementações incluídas fornecem.

## InMemoryCache

```ts
import { InMemoryCache } from "@eusilvio/cep-lookup";

new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5_000 });
```

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `ttl` | `Infinity` | tempo de vida em ms |
| `maxSize` | `Infinity` | número máximo de entradas |

Totalmente síncrono. Morre com o processo.

## Adaptadores persistentes

Todos importados de `@eusilvio/cep-lookup/cache` e derivados de `KeyValueCache`.

### Opções comuns

```ts
interface KeyValueCacheOptions {
  ttl?: number;           // frescor lógico, padrão Infinity
  namespace?: string;     // padrão "cep-lookup"
  evictAfter?: number;    // expiração física entregue ao store
  onError?: (error: Error, operation: string) => void;
}
```

### WebStorageCache

```ts
import { WebStorageCache } from "@eusilvio/cep-lookup/cache";

new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300, storage: sessionStorage });
```

| Opção adicional | Padrão | Descrição |
| --- | --- | --- |
| `storage` | `globalThis.localStorage` | qualquer objeto compatível com `Storage` |
| `maxSize` | `500` | máximo de entradas; as mais antigas são descartadas primeiro |

Quando o navegador recusa a escrita por cota, o adaptador descarta uma fração das entradas mais antigas e tenta de novo.

### IndexedDBCache

```ts
import { IndexedDBCache } from "@eusilvio/cep-lookup/cache";

new IndexedDBCache({ ttl: 24 * 60 * 60_000 });
```

| Opção adicional | Padrão |
| --- | --- |
| `dbName` | `"cep-lookup"` |
| `storeName` | `"addresses"` |
| `factory` | `globalThis.indexedDB` |

### RedisCache

```ts
import Redis from "ioredis";
import { RedisCache } from "@eusilvio/cep-lookup/cache";

new RedisCache({
  client: new Redis(process.env.REDIS_URL!),
  ttl: 7 * 24 * 60 * 60_000,
  evictAfter: 30 * 24 * 60 * 60_000,
});
```

| Opção adicional | Padrão | Descrição |
| --- | --- | --- |
| `client` | - | **obrigatório**; cliente já conectado |
| `dialect` | autodetectado | dialeto de expiração do `SET` |
| `scanCount` | `100` | chaves por iteração de `SCAN` no `clear()` |

Compatível com `ioredis`, `node-redis` e `@upstash/redis` - o cliente é injetado, nunca importado.

### CloudflareKVCache

```ts
import { CloudflareKVCache } from "@eusilvio/cep-lookup/cache";

new CloudflareKVCache({ namespaceBinding: env.CEP_CACHE, ttl: 24 * 60 * 60_000 });
```

| Opção adicional | Descrição |
| --- | --- |
| `namespaceBinding` | **obrigatório**; binding KV do Worker |

A Cloudflare rejeita `expirationTtl` abaixo de 60 segundos - o adaptador respeita esse piso.

## KeyValueCache e KeyValueDriver

```ts
interface KeyValueDriver {
  get(key: string): MaybePromise<string | null | undefined>;
  set(key: string, value: string, evictAfterMs?: number): MaybePromise<void>;
  delete(key: string): MaybePromise<void>;
  keys?(): MaybePromise<string[]>;   // habilita clear()
  clear?(): MaybePromise<void>;      // limpeza nativa, preferida
}
```

```ts
import { KeyValueCache, KeyValueDriver } from "@eusilvio/cep-lookup/cache";

const driver: KeyValueDriver = {
  get: (key) => store.read(key),
  set: (key, value, evictAfterMs) => store.write(key, value, evictAfterMs),
  delete: (key) => store.remove(key),
};

const cache = new KeyValueCache(driver, { ttl: 600_000 });
```

`KeyValueCache` cuida de serialização, namespace, TTL lógico, metadados de staleness e isolamento de erro. O driver só lida com strings.

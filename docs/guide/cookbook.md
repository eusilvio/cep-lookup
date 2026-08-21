# Exemplos práticos

Trechos prontos para copiar. Cada um assume `providers` já definido.

## React: setup de produção

```tsx
<CepProvider
  providers={[viaCepProvider, brasilApiProvider, apicepProvider]}
  retries={1}
  retryDelay={300}
  rateLimit={{ requests: 60, per: 60_000 }}
  circuitBreaker={{ enabled: true, failureThreshold: 3, cooldownMs: 30_000 }}
>
  <App />
</CepProvider>
```

## Vue: instância própria com resiliência

```ts
const instance = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  retries: 1,
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
});

const { address, error } = useCepLookup("01001000", { instance });
```

## Rota de API no backend

```ts
export async function getAddress(cep: string) {
  try {
    return await lookup.lookup(cep);
  } catch (error) {
    if (error instanceof CepNotFoundError) return null;
    throw error;
  }
}
```

## Endpoint HTTP com status correto

```ts
app.get("/cep/:cep", async (req, res) => {
  try {
    res.json(await lookup.lookup(req.params.cep));
  } catch (error: any) {
    const status = { INVALID_CEP: 400, NOT_FOUND: 404, RATE_LIMITED: 429 }[error.code] ?? 502;
    res.status(status).json({ code: error.code ?? "UNKNOWN", message: error.message });
  }
});
```

## Busca em lote com concorrência

```ts
const results = await lookup.lookupCeps(["01001000", "01310930", "99999999"], 3);

results.forEach(({ cep, data, error }) => {
  if (error) console.error(`${cep}: falhou`);
  else console.log(`${cep}: ${data?.street}`);
});
```

## Endpoint de métricas

```ts
app.get("/internal/cep-metrics", (_req, res) => {
  res.json({
    health: lookup.getProviderHealth(),
    metrics: lookup.getProviderMetrics(),
  });
});
```

## Cache compartilhado entre processos do servidor

```ts
import Redis from "ioredis";
import { RedisCache } from "@eusilvio/cep-lookup/cache";

const lookup = new CepLookup({
  providers,
  cache: new RedisCache({
    client: new Redis(process.env.REDIS_URL!),
    ttl: 7 * 24 * 60 * 60_000,
    evictAfter: 30 * 24 * 60 * 60_000,
    onError: (error, operation) => logger.warn({ error, operation }, "cep cache degradado"),
  }),
  staleIfError: true,
});
```

Funciona também com `node-redis` e `@upstash/redis` - o dialeto de `SET` é detectado na primeira escrita.

## Cache que sobrevive ao reload da página

```ts
import { WebStorageCache } from "@eusilvio/cep-lookup/cache";

const lookup = new CepLookup({
  providers,
  cache: new WebStorageCache({ ttl: 24 * 60 * 60_000, maxSize: 300 }),
  staleIfError: true,
});
```

`sessionStorage` para cache por aba: `new WebStorageCache({ storage: sessionStorage })`. Para centenas de CEPs, troque por `IndexedDBCache` - mesmas opções, sem bloquear a main thread e sem disputar os ~5 MB do Web Storage.

## Cache no edge (Cloudflare Workers)

```ts
import { CloudflareKVCache } from "@eusilvio/cep-lookup/cache";

export default {
  async fetch(request: Request, env: Env) {
    const lookup = new CepLookup({
      providers,
      cache: new CloudflareKVCache({
        namespaceBinding: env.CEP_CACHE,
        ttl: 24 * 60 * 60_000,
        evictAfter: 30 * 24 * 60 * 60_000,
      }),
      staleIfError: true,
    });

    const url = new URL(request.url);
    return Response.json(await lookup.lookup(url.searchParams.get("cep")!));
  },
};
```

## Cache num backend sem adaptador pronto

```ts
import { KeyValueCache, KeyValueDriver } from "@eusilvio/cep-lookup/cache";

// Três métodos sobre strings opacas - TTL, namespace, staleness e isolamento
// de erro vêm do KeyValueCache.
const driver: KeyValueDriver = {
  get: (key) => memcached.get(key),
  set: (key, value, evictAfterMs) => memcached.set(key, value, evictAfterMs),
  delete: (key) => memcached.del(key),
};

const lookup = new CepLookup({ providers, cache: new KeyValueCache(driver, { ttl: 600_000 }) });
```

## Degradar para dado velho durante queda total

```ts
const lookup = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: true,
});

lookup.on("cache:stale", ({ cep }) => alerting.warn(`Servindo dado vencido para ${cep}`));
```

## Nunca responder vazio: fallback offline

```ts
const lookup = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: true,
  offlineFallback: true, // cache frio + queda total → endereço parcial em nível de UF
});

const address = await lookup.lookup(cep);
if (address.partial) {
  // state e ddd são confiáveis; peça cidade e rua manualmente
  form.enableManualAddress({ state: address.state });
}
```

## Validar CEP contra a UF selecionada, sem rede

```ts
import { cepMatchesState, isCepAllocated } from "@eusilvio/cep-lookup/offline";

if (!isCepAllocated(form.cep)) {
  return showError("Este CEP não existe em nenhuma faixa dos Correios.");
}
if (!cepMatchesState(form.cep, form.uf)) {
  return showError(`Este CEP não pertence a ${form.uf}.`);
}
// Só agora gaste uma chamada de rede:
const address = await lookup.lookup(form.cep);
```

## Cancelar busca em voo a partir de um input React

```ts
useEffect(() => {
  const controller = new AbortController();
  lookup.lookup(cep, { signal: controller.signal }).then(setAddress).catch(() => {});
  return () => controller.abort();
}, [cep]);
```

(O `useCepLookup` de `@eusilvio/cep-lookup-react` já faz isso internamente.)

## Busca reversa por endereço

```ts
const candidatos = await lookup.searchByAddress("SP", "São Paulo", "Praça da Sé");
```

## Gateway próprio

```ts
import { createGatewayProvider } from "@eusilvio/cep-lookup/providers";

const gateway = createGatewayProvider({ baseUrl: "https://internal.mycompany.com/cep" });
const lookup = new CepLookup({ providers: [gateway] });
```

## Instrumentar todas as chamadas HTTP

```ts
const lookup = new CepLookup({
  providers,
  fetcher: async (url, signal) => {
    const started = performance.now();
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      metrics.timing("cep.http", performance.now() - started);
    }
  },
});
```

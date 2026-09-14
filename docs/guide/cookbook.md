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

## Conferir o endereço inteiro antes de salvar

```ts
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

const result = await verifyAddress(lookup, form); // { cep, state, city, neighborhood, street, number }

switch (result.status) {
  case "confirmed":
    return saveAddress({ ...result.suggestion!, number: form.number }); // grafia oficial
  case "plausible":
    return askToConfirm(result.suggestion!); // "Você quis dizer Avenida Paulista?"
  case "unverifiable":
    return saveAddress(form); // provedores fora: siga com o que foi digitado
  default: // conflict, not_found, invalid
    if (result.suggestion) return offerCorrection(result.suggestion); // o CEP certo
    if (result.candidates) return pickOne(result.candidates);
    return highlight(Object.entries(result.fields).filter(([, field]) => field.match === "mismatch"));
}
```

## Endpoint de verificação de endereço

```ts
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

app.post("/addresses/verify", async (req, res) => {
  try {
    res.json(await verifyAddress(lookup, req.body, { signal: AbortSignal.timeout(8_000) }));
  } catch (error: any) {
    const timedOut = error.name === "TimeoutError" || error.name === "AbortError";
    res.status(timedOut ? 504 : 502).json({ code: error.code ?? "UNKNOWN", message: error.message });
  }
});
```

Dado ruim volta com status `200` e o veredito no corpo; só falha de infraestrutura vira `5xx`.

## Auditar a base de endereços

```ts
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

async function auditAddresses(customers: Customer[], concurrency = 4) {
  const issues: Array<{ id: string; status: string; suggestion?: Address }> = [];
  let next = 0;

  const worker = async () => {
    while (next < customers.length) {
      const { id, address } = customers[next++];
      try {
        const result = await verifyAddress(lookup, address, { searchTimeout: 3_000 });
        if (result.status !== "confirmed") {
          issues.push({ id, status: result.status, suggestion: result.suggestion });
        }
      } catch {
        issues.push({ id, status: "error" }); // infraestrutura: tente de novo depois
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  return issues;
}
```

As buscas reversas vão direto ao ViaCEP e não passam pelo `rateLimit` do motor: controle o ritmo pela concorrência.

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

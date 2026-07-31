# Cookbook

## React: production provider setup

```tsx
<CepProvider
  providers={[viaCepProvider, brasilApiProvider, apicepProvider]}
  retries={1}
  retryDelay={300}
  rateLimit={{ requests: 60, per: 60_000 }}
  circuitBreaker={{ enabled: true, failureThreshold: 3, cooldownMs: 30000 }}
/>
```

## Vue: custom core instance with resilience

```ts
const instance = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  retries: 1,
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30000 },
});

const { address, error } = useCepLookup("01001000", { instance });
```

## API route / backend usage

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

## Bulk lookup with concurrency

```ts
const results = await lookup.lookupCeps(["01001000", "01310930", "99999999"], 3);
```

## Metrics snapshot endpoint

```ts
app.get("/internal/cep-metrics", (_req, res) => {
  res.json({
    health: lookup.getProviderHealth(),
    metrics: lookup.getProviderMetrics(),
  });
});
```

## Async cache backed by Redis

```ts
import { Cache } from "@eusilvio/cep-lookup";

class RedisCache implements Cache {
  constructor(private client: Redis) {}
  async get(cep: string) {
    const raw = await this.client.get(`cep:${cep}`);
    return raw ? JSON.parse(raw) : undefined;
  }
  async set(cep: string, address: Address) {
    await this.client.set(`cep:${cep}`, JSON.stringify(address), "EX", 600);
  }
  async clear() {
    /* flush the relevant keys */
  }
}

const lookup = new CepLookup({ providers, cache: new RedisCache(redisClient) });
```

## Degrade to stale data during a total outage

```ts
const lookup = new CepLookup({
  providers,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: true,
});

lookup.on("cache:stale", ({ cep }) => alerting.warn(`Serving stale data for ${cep}`));
```

## Cancel an in-flight lookup from a React input

```ts
useEffect(() => {
  const controller = new AbortController();
  lookup.lookup(cep, { signal: controller.signal }).then(setAddress).catch(() => {});
  return () => controller.abort();
}, [cep]);
```

(`@eusilvio/cep-lookup-react`'s `useCepLookup` already does this internally.)

## Reverse address search

```ts
const candidates = await lookup.searchByAddress("SP", "São Paulo", "Praça da Sé");
```

## Self-hosted gateway

```ts
import { createGatewayProvider } from "@eusilvio/cep-lookup/providers";

const gateway = createGatewayProvider({ baseUrl: "https://internal.mycompany.com/cep" });
const lookup = new CepLookup({ providers: [gateway] });
```

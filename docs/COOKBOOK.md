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

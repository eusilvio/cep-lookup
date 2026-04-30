# Best Practices

## 1) Provider strategy

Use at least two providers in production.

```ts
providers: [viaCepProvider, brasilApiProvider, apicepProvider]
```

## 2) Timeouts and fallback

Set provider timeouts to prevent long tail latency.

```ts
const providers = [
  { ...viaCepProvider, timeout: 1200 },
  { ...brasilApiProvider, timeout: 1200 },
  { ...apicepProvider, timeout: 1200 },
];
```

## 3) Circuit breaker

Protect your app from repeatedly hitting unstable providers.

```ts
circuitBreaker: {
  enabled: true,
  failureThreshold: 3,
  cooldownMs: 30_000,
}
```

## 4) Retries

Retry at most once or twice. More than that can increase latency and provider load.

```ts
retries: 1,
retryDelay: 300,
```

## 5) Rate limit

Avoid burst pressure from frontend spam.

```ts
rateLimit: { requests: 60, per: 60_000 }
```

## 6) Cache

Use cache for repeated CEP lookups and bulk jobs.

```ts
cache: new InMemoryCache({ ttl: 10 * 60_000, maxSize: 5000 })
```

## 7) Error handling

Handle standardized errors and user feedback explicitly.

- `INVALID_CEP`
- `NOT_FOUND`
- `TIMEOUT`
- `RATE_LIMITED`
- `ALL_PROVIDERS_FAILED`

## 8) Monitoring

Collect both health and metrics snapshots periodically:

```ts
lookup.getProviderHealth();
lookup.getProviderMetrics();
```

# Observability

Three complementary surfaces: events (what just happened), health (who to trust right now) and metrics (how things behaved over time).

## Events

```ts
cep.on("success", ({ provider, cep, duration, address }) => {
  logger.info(`${provider} resolved ${cep} in ${duration}ms`);
});

cep.on("failure", ({ provider, cep, duration, error }) => {
  metrics.increment("cep.failure", { provider });
});

cep.on("cache:hit", ({ cep }) => metrics.increment("cep.cache_hit"));

cep.on("cache:stale", ({ cep, address }) => {
  alerting.warn(`Serving stale data for ${cep}`);
});

cep.on("offline:fallback", ({ cep, address }) => {
  metrics.increment("cep.offline_fallback");
});
```

| Event | Payload | Meaning |
| --- | --- | --- |
| `success` | `provider`, `cep`, `duration`, `address` | a provider answered and won the race |
| `failure` | `provider`, `cep`, `duration`, `error` | a provider failed (includes timeouts and not-founds) |
| `cache:hit` | `cep` | resolved from cache, no network |
| `cache:stale` | `cep`, `address` | everything down; served an expired entry |
| `offline:fallback` | `cep`, `address` | everything down and no cache; synthesized state + area code |

Remove with `off(event, listener)`. A listener that throws does **not** break the lookup flow: the error is swallowed and reported to `logger.debug` when a logger is configured.

The last three events are the ones worth alerting on: each marks one more rung of degradation.

## Per-provider health

```ts
cep.getProviderHealth();
// [
//   { provider: 'ViaCEP',    score: 0.96, isOpen: false, avgLatencyMs: 48,  p95LatencyMs: 92,  successCount: 24, failureCount: 1, consecutiveFailures: 0 },
//   { provider: 'BrasilAPI', score: 0.91, isOpen: false, avgLatencyMs: 113, p95LatencyMs: 210, successCount: 18, failureCount: 2, consecutiveFailures: 0 },
//   { provider: 'ApiCEP',    score: 0.00, isOpen: true,  avgLatencyMs: 0,   p95LatencyMs: 0,   successCount: 0,  failureCount: 3, consecutiveFailures: 3 },
// ]
```

The result is sorted by score, healthiest first. The formula:

```
score = successRate * 0.8 + (1 - min(avgLatency / 1000, 1)) * 0.2 - (circuitOpen ? 1 : 0)
```

An open circuit zeroes (or negates) the score, and the provider is skipped on the next lookup.

## Runtime metrics

```ts
cep.getProviderMetrics();
// [
//   { provider: 'ViaCEP',    requests: 25, successes: 24, failures: 1, timeoutErrors: 0, notFoundErrors: 1, avgLatencyMs: 48,  p95LatencyMs: 92  },
//   { provider: 'BrasilAPI', requests: 20, successes: 18, failures: 2, timeoutErrors: 1, notFoundErrors: 0, avgLatencyMs: 113, p95LatencyMs: 210 },
// ]
```

## Latency: EWMA and p95

`avgLatencyMs` is an **exponentially weighted moving average** - recent samples weigh more than old ones, so a degradation shows up fast instead of being diluted by history.

`p95LatencyMs` is the approximate 95th percentile over each provider's last ~50 samples. It's what exposes the slow tail: a provider averaging 90ms with a p95 of 1400ms is failing one user in twenty while still looking healthy on average.

## Internal endpoint

Expose both snapshots to track provider SLAs over time:

```ts
app.get("/internal/cep-health", (_req, res) => {
  res.json({
    health: cep.getProviderHealth(),
    metrics: cep.getProviderMetrics(),
  });
});
```

Collect periodically and alert when:

- a provider stays `isOpen: true` for more than a few minutes;
- `cache:stale` or `offline:fallback` fire in non-trivial volume;
- a provider's `p95LatencyMs` climbs while the average doesn't.

## Debug logger

An optional logger receives fine-grained internal events (`provider:start`, `provider:success`, `provider:failure` and friends):

```ts
const cep = new CepLookup({
  providers,
  logger: { debug: (msg, data) => console.debug(msg, data) },
});
```

Useful in development and while investigating an incident. In production, prefer the events.

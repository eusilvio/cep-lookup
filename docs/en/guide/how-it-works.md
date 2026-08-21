# How it works

## A request's path

```
lookup("01001000")
        │
        ▼
  validate and normalize (8 digits)
        │
        ▼
  negative cache? ──► CepNotFoundError (no network)
        │
        ▼
  cache hit? ──► return (cache:hit event)
        │
        ▼
  identical request already in flight? ──► share the same result
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Circuit breaker                        │
  │  skips providers with openUntil > now   │
  └──────────────┬──────────────────────────┘
                 │
       ┌─────────┴──────────┐
       ▼                    ▼
  ViaCEP (primary)    BrasilAPI (staggered +100ms)
       │                    │
   success ──────────────► result returned
                            │
    failure                 │
       └──────────────────► fallback takes over

  everything exhausted? → retries → stale cache → offline fallback → error
```

## Staggered race, not blind parallelism

Firing every provider at once wastes API quota and generates useless load. The engine elects a primary provider, fires only that one, and releases the rest **as a group** after `staggerDelay` (default 100ms) - or immediately, if the primary fails before that. In practice, when the primary is healthy the backups rarely leave the gate.

```ts
const cep = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  staggerDelay: 150, // backups leave 150ms after the primary
});
```

The first **valid** response wins; as soon as it lands, the remaining requests are aborted.

## Who the primary is

The primary is not simply the first array entry. On every lookup the engine:

1. drops providers whose circuit is open;
2. sorts the rest by **health score** (highest first);
3. uses the top one as primary and the rest as backups.

The score:

```
score = successRate * 0.8 + (1 - min(avgLatency / 1000, 1)) * 0.2 - (circuitOpen ? 1 : 0)
```

A brand-new provider with no history scores `1.0` - so **on the first lookup the array order rules**, because ties preserve the original order. As failures and latencies accumulate, the ranking adjusts itself.

If every circuit is open, `lookup()` fails fast with `AllProvidersFailedError` instead of hammering providers already known to be down.

## Warmup reorders before the first lookup

`warmup()` pings every provider, measures real latency and reorders the base list:

```ts
await cep.warmup(); // reorders by fastest response
```

Each provider gets its own timeout during warmup (`provider.timeout ?? 5000ms`), so a single hung provider never blocks the others.

## Normalization

Every provider returns a different shape. Each one's `transform` converts the raw response into the same `Address`:

```ts
interface Address {
  cep: string;          // always 8 digits, no dash
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service: string;      // which provider answered
  ibge?: string;
  ddd?: string;
  complement?: string;  // ViaCEP
  location?: { latitude: number; longitude: number }; // BrasilAPI v2
  partial?: boolean;    // true only on the offline fallback
}
```

String fields are trimmed on the way out. `service` tells you which provider answered - handy when debugging data differences between APIs.

## Request coalescing

Concurrent calls for the same CEP share a single in-flight request, even with no cache configured:

```ts
// Only one network round-trip happens here.
await Promise.all([
  cep.lookup("01001000"),
  cep.lookup("01001000"),
  cep.lookup("01001000"),
]);
```

Each caller still gets its own mapped result when using `mapper`.

## Internal cost

The resilience layer's overhead is negligible on the hot path (measured with [tinybench](https://github.com/tinylibs/tinybench), no network):

| Operation | Avg latency | Throughput |
| --- | --- | --- |
| CEP validation (regex) | 123 ns | 10M ops/s |
| `InMemoryCache` read | 48 ns | 21M ops/s |
| Full `lookup()` with cache hit | 605 ns | 2.6M ops/s |
| Event dispatch | 63 ns | 17M ops/s |

Run them locally:

```bash
npx tsx benchmarks/lookup.bench.ts
```

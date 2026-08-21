# Resilience

Four independent mechanisms shield your application from unstable providers: circuit breaker, retries, rate limit and warmup.

## Circuit breaker

Every provider has its own circuit. After N consecutive infrastructure failures it is isolated for a cooldown window and isn't even attempted.

```ts
const cep = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  circuitBreaker: {
    enabled: true,          // default: true
    failureThreshold: 3,    // opens after 3 consecutive failures
    cooldownMs: 30_000,     // try again after 30s
  },
});
```

### Half-open: coming back carefully

When the cooldown expires the circuit does **not** close immediately. Exactly one probe request is let through:

- probe succeeds → circuit closes for good;
- probe fails → circuit reopens for a fresh cooldown.

This avoids the classic ping-pong of naive circuit breakers, which send 100% of traffic back to a still-sick provider.

### A missing CEP doesn't open a circuit

`CepNotFoundError` is a correct provider answer, not an infrastructure failure. It's counted in `notFoundErrors`/`failureCount` for observability, but it **never** increments `consecutiveFailures` or opens the circuit.

### All open

If every circuit is open, `lookup()` fails fast with an `AllProvidersFailedError` carrying one `ProviderUnavailableError` per provider - instead of burning timeouts on APIs already known to be down.

## Retries

`retries` repeats the **whole race**, not a single provider. Backoff is exponential from `retryDelay`.

```ts
const cep = new CepLookup({
  providers,
  retries: 1,       // default: 0
  retryDelay: 300,  // default: 1000ms; 2nd attempt at 300ms, 3rd at 600ms...
});
```

Stay at 1 or 2. Beyond that you multiply worst-case latency and pile load onto providers already in trouble.

A genuine not-found (single provider, or every provider agreeing) is **not retried** - it fails fast with `CepNotFoundError`.

## Rate limit

Protects providers (and your quota) from frontend bursts:

```ts
const cep = new CepLookup({
  providers,
  rateLimit: {
    requests: 60,
    per: 60_000,
    strategy: "wait", // "throw" (default) | "wait"
  },
});
```

| Strategy | Behavior | When to use |
| --- | --- | --- |
| `"throw"` | rejects immediately with `RateLimitError` | user-facing request: fail fast, let the UI decide |
| `"wait"` | holds the call until a slot frees up | jobs and batches, where waiting beats error handling |

## Warmup

Measures real per-provider latency and reorders the list before the first real lookup. Call it on page load or on a function's cold start:

```ts
await cep.warmup(); // pings every provider and reorders
```

Each provider gets its own timeout (`provider.timeout ?? 5000ms`) with a dedicated `AbortController`, so one hung provider never blocks warmup for the others.

## Cancellation

`lookup()` accepts an `AbortSignal`. Aborting cancels in-flight requests and rejects the promise:

```ts
const controller = new AbortController();
const promise = cep.lookup("01001000", { signal: controller.signal });

// e.g. on component unmount, or when the user types a new CEP
controller.abort();
```

The legacy `lookup(cep, mapper)` form keeps working unchanged.

## The full ladder

With everything enabled, a lookup only throws after exhausting:

```
cache → coalescing → race → retries → stale cache → offline fallback → error
```

Wired like this, the only way a lookup fails is the CEP genuinely not existing, or you not having configured the final rungs:

```ts
const cep = new CepLookup({
  providers,
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
  retryDelay: 300,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: { maxAgeMs: 24 * 60 * 60_000 },
  offlineFallback: true,
});
```

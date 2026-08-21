# Types

All exported from `@eusilvio/cep-lookup`.

## Address

```ts
interface Address {
  cep: string;            // 8 digits, unmasked
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service: string;        // provider that answered; "offline" on the fallback
  ibge?: string;
  ddd?: string;
  complement?: string;    // ViaCEP
  location?: { latitude: number; longitude: number }; // BrasilAPI v2
  partial?: boolean;      // true only on offline-synthesized addresses
}
```

String fields are trimmed before leaving the engine.

## Provider

```ts
interface Provider {
  name: string;
  timeout?: number;
  buildUrl: (cep: string) => string;
  transform: (response: any) => Address;
  buildSearchUrl?: (state: string, city: string, street: string) => string;
  transformSearch?: (response: any) => Address[];
}
```

`transform` must **throw** when the response means the CEP doesn't exist - the engine normalizes that into `CepNotFoundError`. The two optional methods enable `searchByAddress()`.

## Fetcher

```ts
type Fetcher = (url: string, signal?: AbortSignal) => Promise<any>;
```

Always forward the `signal`: it carries the provider timeout and external cancellation.

## CepLookupOptions

```ts
interface CepLookupOptions {
  providers: Provider[];
  fetcher?: Fetcher;
  cache?: Cache;
  rateLimit?: RateLimitOptions;
  staggerDelay?: number;
  retries?: number;
  retryDelay?: number;
  logger?: { debug: (msg: string, data?: Record<string, unknown>) => void };
  circuitBreaker?: CircuitBreakerOptions;
  staleIfError?: boolean | { maxAgeMs?: number };
  negativeCacheTtl?: number;
  offlineFallback?: boolean;
}
```

## LookupOptions

```ts
interface LookupOptions<T = Address> {
  signal?: AbortSignal;
  mapper?: (address: Address) => T;
}
```

## BulkCepResult

```ts
interface BulkCepResult<T = Address> {
  cep: string;
  data: T | null;
  provider?: string;
  error?: Error;
}
```

## RateLimitOptions

```ts
interface RateLimitOptions {
  requests: number;
  per: number;                      // window in ms
  strategy?: "throw" | "wait";      // default: "throw"
}
```

## CircuitBreakerOptions

```ts
interface CircuitBreakerOptions {
  enabled?: boolean;          // default: true
  failureThreshold?: number;  // default: 3
  cooldownMs?: number;        // default: 30000
}
```

## ProviderHealth

```ts
interface ProviderHealth {
  provider: string;
  score: number;
  isOpen: boolean;
  openUntil?: number;
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;   // EWMA
  p95LatencyMs: number;   // approximate p95 over the last ~50 samples
}
```

## ProviderMetrics

```ts
interface ProviderMetrics {
  provider: string;
  requests: number;
  successes: number;
  failures: number;
  timeoutErrors: number;
  notFoundErrors: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}
```

## Events

```ts
type EventName = "success" | "failure" | "cache:hit" | "cache:stale" | "offline:fallback";

interface EventMap {
  success:            { provider: string; cep: string; duration: number; address: Address };
  failure:            { provider: string; cep: string; duration: number; error: Error };
  "cache:hit":        { cep: string };
  "cache:stale":      { cep: string; address: Address };
  "offline:fallback": { cep: string; address: Address };
}

type EventListener<T extends EventName> = (payload: EventMap[T]) => void;
```

## MaybePromise

```ts
type MaybePromise<T> = T | Promise<T>;
```

Used by the `Cache` contract: every operation may be synchronous or asynchronous.

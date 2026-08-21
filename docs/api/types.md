# Tipos

Todos exportados de `@eusilvio/cep-lookup`.

## Address

```ts
interface Address {
  cep: string;            // 8 dígitos, sem máscara
  state: string;          // UF
  city: string;
  neighborhood: string;
  street: string;
  service: string;        // provedor que respondeu; "offline" no fallback
  ibge?: string;
  ddd?: string;
  complement?: string;    // ViaCEP
  location?: { latitude: number; longitude: number }; // BrasilAPI v2
  partial?: boolean;      // true apenas em endereços sintetizados offline
}
```

Campos string são trimados antes de sair do motor.

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

`transform` deve **lançar** quando a resposta indicar CEP inexistente - o motor normaliza para `CepNotFoundError`. Os dois métodos opcionais habilitam `searchByAddress()`.

## Fetcher

```ts
type Fetcher = (url: string, signal?: AbortSignal) => Promise<any>;
```

Sempre repasse o `signal`: ele carrega o timeout do provedor e o cancelamento externo.

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
  per: number;                      // janela em ms
  strategy?: "throw" | "wait";      // padrão: "throw"
}
```

## CircuitBreakerOptions

```ts
interface CircuitBreakerOptions {
  enabled?: boolean;          // padrão: true
  failureThreshold?: number;  // padrão: 3
  cooldownMs?: number;        // padrão: 30000
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
  p95LatencyMs: number;   // p95 aproximado sobre as últimas ~50 amostras
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

## Eventos

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

Usado no contrato de `Cache`: toda operação pode ser síncrona ou assíncrona.

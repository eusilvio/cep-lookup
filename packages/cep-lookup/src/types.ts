import { Cache } from "./cache/types";

/**
 * @interface Address
 * @description Represents a standardized address object returned by the CEP lookup.
 */
export interface Address {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service: string;
  ibge?: string;
  ddd?: string;
  /** Additional address complement (e.g. building/block), when the provider returns it. */
  complement?: string;
  /** Geographic coordinates for the address, when the provider returns them. */
  location?: {
    latitude: number;
    longitude: number;
  };
  /**
   * Present (and `true`) only on addresses synthesized by the offline fallback:
   * state-level data is reliable, but city/street fields are empty.
   */
  partial?: boolean;
}

/**
 * @interface Provider
 * @description Defines the contract for a CEP lookup provider.
 */
export interface Provider {
  name: string;
  timeout?: number;
  buildUrl: (cep: string) => string;
  transform: (response: any) => Address;
  /**
   * Optional: builds the URL for a reverse address search (state, city, street).
   * Only providers that support reverse search (e.g. ViaCEP) need to implement this.
   */
  buildSearchUrl?: (state: string, city: string, street: string) => string;
  /**
   * Optional: transforms the raw reverse-search response into a list of `Address`.
   * Required alongside `buildSearchUrl` for a provider to support `searchByAddress`.
   */
  transformSearch?: (response: any) => Address[];
}

/**
 * @typedef {function(url: string, signal?: AbortSignal): Promise<any>}
 * @description A function that fetches data from a given URL.
 */
export type Fetcher = (url: string, signal?: AbortSignal) => Promise<any>;

/**
 * @interface RateLimitOptions
 * @description Options for configuring the internal rate limiter.
 */
export interface RateLimitOptions {
  requests: number;
  per: number;
  /**
   * What to do when the rate limit is exceeded.
   * - `throw` (default): reject immediately with `RateLimitError`.
   * - `wait`: hold the call until a slot in the window frees up.
   */
  strategy?: 'throw' | 'wait';
}

/**
 * @typedef MaybePromise
 * @description A value that may be returned synchronously or asynchronously.
 */
export type MaybePromise<T> = T | Promise<T>;

/**
 * @interface CepLookupOptions
 * @description Options for initializing the `CepLookup` class.
 */
export interface CepLookupOptions {
  providers: Provider[];
  fetcher?: Fetcher;
  cache?: Cache;
  rateLimit?: RateLimitOptions;
  staggerDelay?: number;
  /** Number of retries after all providers fail. Default: 0 */
  retries?: number;
  /** Base delay in ms between retries (exponential backoff). Default: 1000 */
  retryDelay?: number;
  /** Optional logger for debug output */
  logger?: { debug: (msg: string, data?: Record<string, unknown>) => void };
  /** Circuit breaker options for provider resilience */
  circuitBreaker?: CircuitBreakerOptions;
  /**
   * When all providers fail with an infrastructure error (not a genuine not-found),
   * serve a previously cached (possibly expired) address instead of throwing.
   * Requires a `cache` that implements `getStale`. Default: false (disabled).
   */
  staleIfError?: boolean | { maxAgeMs?: number };
  /**
   * Time-to-live (ms) for negative caching: when a CEP is confirmed not found,
   * remember it and short-circuit subsequent lookups without hitting the network.
   */
  negativeCacheTtl?: number;
  /**
   * Last-resort resilience tier: when every provider fails with an
   * infrastructure error (never for a genuine not-found), all retries are
   * exhausted and no stale cache entry is usable, synthesize a partial
   * `Address` (state + DDD, `service: "offline"`, `partial: true`) from the
   * official Correios CEP allocation map instead of throwing.
   * The synthesized address is never written to the cache. Default: false.
   */
  offlineFallback?: boolean;
}

/**
 * @interface LookupOptions
 * @description Options accepted by the second argument of `lookup()`.
 */
export interface LookupOptions<T = Address> {
  /** Aborts in-flight provider requests and rejects the lookup promise. */
  signal?: AbortSignal;
  /** Maps the resolved `Address` into a custom shape. */
  mapper?: (address: Address) => T;
}

/**
 * @interface BulkCepResult
 * @description Represents the result for a single CEP in a bulk lookup operation.
 */
export interface BulkCepResult<T = Address> {
  cep: string;
  data: T | null;
  provider?: string;
  error?: Error;
}

// --- Observability Event Types ---

export type EventName = 'success' | 'failure' | 'cache:hit' | 'cache:stale' | 'offline:fallback';

export interface SuccessPayload {
  provider: string;
  cep: string;
  duration: number;
  address: Address;
}

export interface FailurePayload {
  provider: string;
  cep: string;
  duration: number;
  error: Error;
}

export interface CacheHitPayload {
  cep: string;
}

export interface CacheStalePayload {
  cep: string;
  address: Address;
}

export interface OfflineFallbackPayload {
  cep: string;
  /** The synthesized partial address (state-level data only). */
  address: Address;
}

export interface EventMap {
  success: SuccessPayload;
  failure: FailurePayload;
  'cache:hit': CacheHitPayload;
  'cache:stale': CacheStalePayload;
  'offline:fallback': OfflineFallbackPayload;
}

export type EventListener<T extends EventName> = (payload: EventMap[T]) => void;

export interface CircuitBreakerOptions {
  /** Consecutive failures required to open the circuit. Default: 3 */
  failureThreshold?: number;
  /** Cooldown in ms before trying a provider again. Default: 30000 */
  cooldownMs?: number;
  /** Enable/disable circuit breaker. Default: true */
  enabled?: boolean;
}

export interface ProviderHealth {
  provider: string;
  score: number;
  isOpen: boolean;
  openUntil?: number;
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  /** Approximate 95th percentile latency over the last ~50 samples. */
  p95LatencyMs: number;
}

export interface ProviderMetrics {
  provider: string;
  requests: number;
  successes: number;
  failures: number;
  timeoutErrors: number;
  notFoundErrors: number;
  avgLatencyMs: number;
  /** Approximate 95th percentile latency over the last ~50 samples. */
  p95LatencyMs: number;
}

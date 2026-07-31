import { ZipCache } from "./cache";

export interface ZipAddress {
  zip: string;
  city: string;
  state: string;
  stateAbbr: string;
  county?: string;
  country: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  service: string;
}

export type Fetcher = (url: string, signal?: AbortSignal) => Promise<any>;

export interface ZipProvider {
  name: string;
  timeout?: number;
  buildUrl: (zip: string) => string;
  transform: (response: any) => ZipAddress;
  /** Override the global fetcher for this provider (e.g. for XML-based APIs). */
  fetcher?: Fetcher;
}

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

export interface ZipLookupOptions {
  providers: ZipProvider[];
  fetcher?: Fetcher;
  cache?: ZipCache;
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
   * Time-to-live (ms) for negative caching: when a ZIP is confirmed not found,
   * remember it and short-circuit subsequent lookups without hitting the network.
   */
  negativeCacheTtl?: number;
}

/**
 * @interface LookupOptions
 * @description Options accepted by the second argument of `lookup()`.
 */
export interface LookupOptions<T = ZipAddress> {
  /** Aborts in-flight provider requests and rejects the lookup promise. */
  signal?: AbortSignal;
  /** Maps the resolved `ZipAddress` into a custom shape. */
  mapper?: (address: ZipAddress) => T;
}

export interface BulkZipResult<T = ZipAddress> {
  zip: string;
  data: T | null;
  provider?: string;
  error?: Error;
}

export type EventName = 'success' | 'failure' | 'cache:hit' | 'cache:stale';

export interface SuccessPayload {
  provider: string;
  zip: string;
  duration: number;
  address: ZipAddress;
}

export interface FailurePayload {
  provider: string;
  zip: string;
  duration: number;
  error: Error;
}

export interface CacheHitPayload {
  zip: string;
}

export interface CacheStalePayload {
  zip: string;
  address: ZipAddress;
}

export interface EventMap {
  success: SuccessPayload;
  failure: FailurePayload;
  'cache:hit': CacheHitPayload;
  'cache:stale': CacheStalePayload;
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

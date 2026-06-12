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
}

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
}

export interface BulkZipResult<T = ZipAddress> {
  zip: string;
  data: T | null;
  provider?: string;
  error?: Error;
}

export type EventName = 'success' | 'failure' | 'cache:hit';

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

export interface EventMap {
  success: SuccessPayload;
  failure: FailurePayload;
  'cache:hit': CacheHitPayload;
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
}

export interface ProviderMetrics {
  provider: string;
  requests: number;
  successes: number;
  failures: number;
  timeoutErrors: number;
  notFoundErrors: number;
  avgLatencyMs: number;
}

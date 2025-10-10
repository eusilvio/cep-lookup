import { Cache } from "./cache";

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
}

/**
 * @interface CepLookupOptions
 * @description Options for initializing the `CepLookup` class.
 */
export interface CepLookupOptions {
  providers: Provider[];
  fetcher?: Fetcher;
  cache?: Cache;
  rateLimit?: RateLimitOptions;
}

/**
 * @interface BulkCepResult
 * @description Represents the result for a single CEP in a bulk lookup operation.
 */
export interface BulkCepResult {
  cep: string;
  data: Address | null;
  provider?: string;
  error?: Error;
}

// --- Observability Event Types ---

export type EventName = 'success' | 'failure' | 'cache:hit';

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

export interface EventMap {
  success: SuccessPayload;
  failure: FailurePayload;
  'cache:hit': CacheHitPayload;
}

export type EventListener<T extends EventName> = (payload: EventMap[T]) => void;
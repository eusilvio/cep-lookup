import { Address, Fetcher, Provider, CepLookupOptions, LookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap, ProviderHealth, ProviderMetrics, CircuitBreakerOptions, MaybePromise } from "./types";
import { Cache, StaleCacheEntry } from "./cache/types";
import { InMemoryCache, InMemoryCacheOptions } from "./cache/in-memory";
import { CepValidationError, RateLimitError, ProviderTimeoutError, CepNotFoundError, AllProvidersFailedError, ProviderUnavailableError, normalizeProviderError } from "./errors";
import { dddByState } from "./data/ddd-by-state";
import { validateCep } from "./validate";
import { resolveCepOffline, toPartialAddress } from "./offline";

export type { Address, Fetcher, Provider, CepLookupOptions, LookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap, Cache, InMemoryCacheOptions, StaleCacheEntry, ProviderHealth, ProviderMetrics, CircuitBreakerOptions, MaybePromise };
export { InMemoryCache };
export { CepValidationError, RateLimitError, ProviderTimeoutError, CepNotFoundError, AllProvidersFailedError, ProviderUnavailableError };
export { resolveCepOffline, stateFromCep, isCepAllocated, cepMatchesState, toPartialAddress } from "./offline";
export type { OfflineCepInfo, Region, StateInfo } from "./offline";

/** Internal marker stored in the cache to represent a confirmed "not found" CEP (negative cache). */
interface NegativeCacheEntry {
  __cepLookupNotFound: true;
  cep: string;
  expiresAt: number;
}

function isNegativeCacheEntry(value: unknown): value is NegativeCacheEntry {
  return !!value && typeof value === "object" && (value as any).__cepLookupNotFound === true;
}

function makeNegativeCacheEntry(cep: string, ttlMs: number): Address {
  const entry: NegativeCacheEntry = {
    __cepLookupNotFound: true,
    cep,
    expiresAt: Date.now() + ttlMs,
  };
  return entry as unknown as Address;
}

// Minimal EventEmitter for internal use
class EventEmitter {
  private listeners: { [K in EventName]?: EventListener<K>[] } = {};

  constructor(private logger?: { debug: (msg: string, data?: Record<string, unknown>) => void }) {}

  public on<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    (this.listeners[eventName] as EventListener<T>[]).push(listener);
  }

  public off<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    const listeners = this.listeners[eventName];
    if (!listeners) {
      return;
    }
    this.listeners[eventName] = (listeners as EventListener<T>[]).filter(
      (l) => l !== listener
    ) as any; // Cast back to the internal storage type safely
  }

  public emit<T extends EventName>(eventName: T, payload: EventMap[T]): void {
    const listeners = this.listeners[eventName];
    if (!listeners) {
      return;
    }
    // A listener installed by user code must never break the lookup flow.
    (listeners as EventListener<T>[]).forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        this.logger?.debug('listener:error', { event: eventName, error: (err as Error)?.message });
      }
    });
  }
}

/**
 * @function sanitizeAddress
 * @description Trims whitespace from all string properties of an address object.
 * @param {Address} address - The address object to sanitize.
 * @returns {Address} The sanitized address object.
 */
function sanitizeAddress(address: Address): Address {
  const sanitized = { ...address };
  (Object.keys(sanitized) as Array<keyof Address>).forEach((key) => {
    const value = sanitized[key];
    if (typeof value === "string") {
      (sanitized[key] as string) = value.trim();
    }
  });
  return sanitized;
}

/**
 * @function enrichAddress
 * @description Enriches an address with DDD fallback when the provider doesn't return it.
 */
function enrichAddress(address: Address): Address {
  if (!address.ddd && address.state) {
    const fallbackDdd = dddByState[address.state];
    if (fallbackDdd) {
      return { ...address, ddd: fallbackDdd };
    }
  }
  return address;
}

/**
 * @function parseLookupArg
 * @description Normalizes the second argument of `lookup()`, supporting both the
 * legacy `lookup(cep, mapper)` signature and the new `lookup(cep, { signal, mapper })` one.
 */
function parseLookupArg<T>(
  arg?: LookupOptions<T> | ((address: Address) => T)
): { mapper?: (address: Address) => T; signal?: AbortSignal } {
  if (typeof arg === "function") {
    return { mapper: arg };
  }
  if (arg && typeof arg === "object") {
    return { mapper: arg.mapper, signal: arg.signal };
  }
  return {};
}

function toAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }
  return new DOMException("Aborted", "AbortError");
}

/**
 * @function flattenAggregateErrors
 * @description Recursively unwraps nested `AggregateError`s (produced when the staggered
 * race's secondary `Promise.any` also rejects) into a flat list of the underlying errors.
 */
function flattenAggregateErrors(errors: unknown[]): Error[] {
  const flat: Error[] = [];
  for (const error of errors) {
    if (error instanceof AggregateError && Array.isArray(error.errors)) {
      flat.push(...flattenAggregateErrors(error.errors));
    } else {
      flat.push(error as Error);
    }
  }
  return flat;
}

interface ProviderRuntimeState {
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  latencySamples: number[];
  openUntil?: number;
  halfOpenProbeInFlight?: boolean;
  requests: number;
  timeoutErrors: number;
  notFoundErrors: number;
}

function createProviderRuntimeState(): ProviderRuntimeState {
  return {
    consecutiveFailures: 0,
    successCount: 0,
    failureCount: 0,
    avgLatencyMs: 0,
    latencySamples: [],
    requests: 0,
    timeoutErrors: 0,
    notFoundErrors: 0,
  };
}

const LATENCY_EWMA_ALPHA = 0.3;
const LATENCY_SAMPLE_WINDOW = 50;

function percentile95(samples: number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, index)];
}

/**
 * @class CepLookup
 * @description A class for looking up Brazilian postal codes (CEPs) using multiple providers.
 */
export class CepLookup {
  private providers: Provider[];
  private sortedProviders: Provider[];
  private fetcher: Fetcher;
  private cache?: Cache;
  private rateLimit?: RateLimitOptions;
  private staggerDelay: number;
  private retries: number;
  private retryDelay: number;
  private logger?: { debug: (msg: string, data?: Record<string, unknown>) => void };
  private requestTimestamps: number[] = [];
  private emitter: EventEmitter;
  private circuitBreakerEnabled: boolean;
  private circuitFailureThreshold: number;
  private circuitCooldownMs: number;
  private providerState = new Map<string, ProviderRuntimeState>();
  private staleIfError: boolean | { maxAgeMs?: number };
  private negativeCacheTtl?: number;
  private offlineFallback: boolean;
  private inFlightLookups = new Map<string, Promise<Address>>();

  constructor(options: CepLookupOptions) {
    this.providers = options.providers;
    this.sortedProviders = [...options.providers];
    this.logger = options.logger;
    this.emitter = new EventEmitter(this.logger);
    this.fetcher = options.fetcher || (async (url: string, signal?: AbortSignal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    });
    this.cache = options.cache;
    this.rateLimit = options.rateLimit;
    this.staggerDelay = options.staggerDelay ?? 100;
    this.retries = options.retries ?? 0;
    this.retryDelay = options.retryDelay ?? 1000;
    this.circuitBreakerEnabled = options.circuitBreaker?.enabled ?? true;
    this.circuitFailureThreshold = options.circuitBreaker?.failureThreshold ?? 3;
    this.circuitCooldownMs = options.circuitBreaker?.cooldownMs ?? 30000;
    this.staleIfError = options.staleIfError ?? false;
    this.negativeCacheTtl = options.negativeCacheTtl;
    this.offlineFallback = options.offlineFallback ?? false;
    this.providers.forEach((provider) => {
      this.providerState.set(provider.name, createProviderRuntimeState());
    });
  }

  private log(msg: string, data?: Record<string, unknown>): void {
    this.logger?.debug(msg, data);
  }

  public on<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    this.emitter.on(eventName, listener);
  }

  public off<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    this.emitter.off(eventName, listener);
  }

  /**
   * @method warmup
   * @description Pings providers to determine the fastest one and updates the internal priority order.
   * Each provider is given its own `timeout` (falling back to 5000ms) so a single hung
   * provider can never block the others.
   * @returns {Promise<Provider[]>} The list of providers sorted by latency.
   */
  public async warmup(): Promise<Provider[]> {
    const controlCep = "01001000"; // Praça da Sé (Fixed Valid CEP)

    const race = this.providers.map(async (provider) => {
      const controller = new AbortController();
      const timeoutMs = provider.timeout ?? 5000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      try {
        const url = provider.buildUrl(controlCep);
        await this.fetcher(url, controller.signal);
        // We don't care about the result content, just that it didn't throw network error
        return { provider, duration: Date.now() - start, error: false };
      } catch (e) {
        return { provider, duration: Infinity, error: true };
      } finally {
        clearTimeout(timer);
      }
    });

    // Wait for all to finish (or be aborted by their own timeout)
    const results = await Promise.all(race);

    // Sort providers: functional/fastest first
    const sortedResults = results.sort((a, b) => a.duration - b.duration);

    this.sortedProviders = sortedResults
      .map(r => r.provider)
      .filter(p => !!p);

    return this.sortedProviders;
  }

  private getOrCreateProviderState(providerName: string): ProviderRuntimeState {
    const existing = this.providerState.get(providerName);
    if (existing) return existing;
    const created = createProviderRuntimeState();
    this.providerState.set(providerName, created);
    return created;
  }

  private recordLatency(state: ProviderRuntimeState, durationMs: number): void {
    const isFirstSample = state.requests === 0;
    state.avgLatencyMs = isFirstSample
      ? durationMs
      : (LATENCY_EWMA_ALPHA * durationMs) + ((1 - LATENCY_EWMA_ALPHA) * state.avgLatencyMs);
    state.latencySamples.push(durationMs);
    if (state.latencySamples.length > LATENCY_SAMPLE_WINDOW) {
      state.latencySamples.shift();
    }
  }

  private recordProviderSuccess(providerName: string, durationMs: number): void {
    const state = this.getOrCreateProviderState(providerName);
    this.recordLatency(state, durationMs);
    state.requests += 1;
    state.successCount += 1;
    state.consecutiveFailures = 0;
    state.openUntil = undefined;
    state.halfOpenProbeInFlight = false;
  }

  private recordProviderFailure(providerName: string, durationMs: number, error: Error): void {
    const state = this.getOrCreateProviderState(providerName);
    this.recordLatency(state, durationMs);
    state.requests += 1;
    state.failureCount += 1;
    // A "not found" is a valid, successful response from the provider's infrastructure
    // point of view — it must not be treated as an infra failure by the circuit breaker.
    const isNotFound = error instanceof CepNotFoundError;
    if (error instanceof ProviderTimeoutError) {
      state.timeoutErrors += 1;
    }
    if (isNotFound) {
      state.notFoundErrors += 1;
    }
    if (isNotFound) {
      state.halfOpenProbeInFlight = false;
      return;
    }
    state.consecutiveFailures += 1;
    state.halfOpenProbeInFlight = false;
    if (this.circuitBreakerEnabled && state.consecutiveFailures >= this.circuitFailureThreshold) {
      state.openUntil = Date.now() + this.circuitCooldownMs;
    }
  }

  /**
   * Determines whether a provider is currently unavailable due to the circuit breaker.
   * After the cooldown expires, exactly one "probe" request is allowed through
   * (half-open state); a success fully closes the circuit, a failure reopens it
   * for a new cooldown period.
   */
  private isProviderOpen(providerName: string): boolean {
    if (!this.circuitBreakerEnabled) return false;
    const state = this.getOrCreateProviderState(providerName);
    if (state.openUntil === undefined) return false;
    if (Date.now() < state.openUntil) return true;
    // Cooldown has expired: allow a single half-open probe through.
    if (state.halfOpenProbeInFlight) return true;
    state.halfOpenProbeInFlight = true;
    return false;
  }

  /** Releases a half-open probe slot without affecting failure counters (e.g. on abort). */
  private releaseHalfOpenProbe(providerName: string): void {
    const state = this.getOrCreateProviderState(providerName);
    state.halfOpenProbeInFlight = false;
  }

  private scoreProvider(provider: Provider): number {
    const state = this.getOrCreateProviderState(provider.name);
    const total = state.successCount + state.failureCount;
    const successRate = total === 0 ? 1 : state.successCount / total;
    const latencyPenalty = state.avgLatencyMs > 0 ? Math.min(state.avgLatencyMs / 1000, 1) : 0;
    const openPenalty = this.isProviderOpen(provider.name) ? 1 : 0;
    return (successRate * 0.8) + ((1 - latencyPenalty) * 0.2) - openPenalty;
  }

  public getProviderHealth(): ProviderHealth[] {
    return this.providers
      .map((provider) => {
        const state = this.getOrCreateProviderState(provider.name);
        return {
          provider: provider.name,
          score: Number(this.scoreProvider(provider).toFixed(4)),
          isOpen: this.isProviderOpen(provider.name),
          openUntil: state.openUntil,
          consecutiveFailures: state.consecutiveFailures,
          successCount: state.successCount,
          failureCount: state.failureCount,
          avgLatencyMs: Number(state.avgLatencyMs.toFixed(2)),
          p95LatencyMs: Number(percentile95(state.latencySamples).toFixed(2)),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  public getProviderMetrics(): ProviderMetrics[] {
    return this.providers.map((provider) => {
      const state = this.getOrCreateProviderState(provider.name);
      return {
        provider: provider.name,
        requests: state.requests,
        successes: state.successCount,
        failures: state.failureCount,
        timeoutErrors: state.timeoutErrors,
        notFoundErrors: state.notFoundErrors,
        avgLatencyMs: Number(state.avgLatencyMs.toFixed(2)),
        p95LatencyMs: Number(percentile95(state.latencySamples).toFixed(2)),
      };
    });
  }

  private async checkRateLimit(): Promise<void> {
    if (!this.rateLimit) return;
    const strategy = this.rateLimit.strategy ?? 'throw';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const now = Date.now();
      const windowStart = now - this.rateLimit.per;
      this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);
      if (this.requestTimestamps.length < this.rateLimit.requests) {
        this.requestTimestamps.push(now);
        return;
      }
      if (strategy === 'throw') {
        throw new RateLimitError(this.rateLimit.requests, this.rateLimit.per);
      }
      const oldest = this.requestTimestamps[0];
      const waitMs = Math.max(oldest + this.rateLimit.per - now, 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private isStaleUsable(entry: StaleCacheEntry): boolean {
    if (!this.staleIfError) return false;
    if (typeof this.staleIfError === 'object' && this.staleIfError.maxAgeMs !== undefined) {
      if (entry.ageMs === undefined) return true;
      return entry.ageMs <= this.staleIfError.maxAgeMs;
    }
    return true;
  }

  async lookup<T = Address>(cep: string, arg?: LookupOptions<T> | ((address: Address) => T)): Promise<T> {
    const { mapper, signal: externalSignal } = parseLookupArg<T>(arg);
    // Only actually `await` when rate limiting is configured: awaiting an async call
    // unconditionally would insert a microtask pause before any provider request is
    // scheduled, which is both unnecessary and observable (e.g. under fake timers).
    if (this.rateLimit) {
      await this.checkRateLimit();
    }
    const cleanedCep = validateCep(cep);
    this.log('lookup:start', { cep: cleanedCep });

    if (this.cache) {
      const cached = await this.cache.get(cleanedCep);
      if (cached !== undefined) {
        if (isNegativeCacheEntry(cached)) {
          if (Date.now() < cached.expiresAt) {
            throw new CepNotFoundError(cleanedCep);
          }
          // Expired negative marker: fall through and look it up again.
        } else {
          this.log('cache:hit', { cep: cleanedCep });
          this.emitter.emit('cache:hit', { cep: cleanedCep });
          return mapper ? mapper(cached) : (cached as Address as T);
        }
      }
    }

    const address = externalSignal
      ? await this.fetchWithRetryAndFallback(cleanedCep, externalSignal)
      : await this.dedupedFetch(cleanedCep);

    return mapper ? mapper(address) : (address as Address as T);
  }

  /**
   * Request coalescing (singleflight): concurrent lookups for the same CEP share
   * the same in-flight promise instead of triggering redundant provider calls.
   * Only used when no external `signal` is supplied, so aborting one caller can
   * never affect an unrelated caller sharing the same request.
   */
  private dedupedFetch(cleanedCep: string): Promise<Address> {
    const existing = this.inFlightLookups.get(cleanedCep);
    if (existing) return existing;

    const promise = this.fetchWithRetryAndFallback(cleanedCep);
    this.inFlightLookups.set(cleanedCep, promise);
    const release = () => {
      if (this.inFlightLookups.get(cleanedCep) === promise) {
        this.inFlightLookups.delete(cleanedCep);
      }
    };
    // Attach a settle handler that never rethrows, so this never surfaces as an
    // unhandled rejection — callers observe the original `promise` directly.
    promise.then(release, release);
    return promise;
  }

  private async fetchWithRetryAndFallback(cleanedCep: string, externalSignal?: AbortSignal): Promise<Address> {
    let lastError: Error | undefined;
    const maxAttempts = 1 + this.retries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (externalSignal?.aborted) {
        throw toAbortError(externalSignal);
      }
      if (attempt > 0) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.log('retry:attempt', { attempt, cep: cleanedCep, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      try {
        const address = await this._lookupFromProviders(cleanedCep, externalSignal);
        if (this.cache) {
          await this.cache.set(cleanedCep, address);
        }
        return address;
      } catch (error) {
        if (externalSignal?.aborted) {
          throw toAbortError(externalSignal);
        }
        if (error instanceof CepValidationError || error instanceof RateLimitError) {
          throw error;
        }

        const notFoundError = this.asGenuineNotFound(error);
        if (notFoundError) {
          // Not found is definitive: never retry, never fall back to stale cache.
          if (this.cache && this.negativeCacheTtl) {
            await this.cache.set(cleanedCep, makeNegativeCacheEntry(cleanedCep, this.negativeCacheTtl));
          }
          throw notFoundError;
        }
        lastError = error as Error;
      }
    }

    if (this.cache?.getStale) {
      const stale = await this.cache.getStale(cleanedCep);
      if (stale && !isNegativeCacheEntry(stale.value) && this.isStaleUsable(stale)) {
        this.log('cache:stale', { cep: cleanedCep });
        this.emitter.emit('cache:stale', { cep: cleanedCep, address: stale.value });
        return stale.value;
      }
    }

    // Last resilience tier: a degraded, state-level answer beats no answer.
    // Only reached on infrastructure failures (genuine not-founds threw above)
    // and intentionally never written to the cache.
    if (this.offlineFallback) {
      const offline = resolveCepOffline(cleanedCep);
      if (offline) {
        const address = toPartialAddress(offline);
        this.log('offline:fallback', { cep: cleanedCep });
        this.emitter.emit('offline:fallback', { cep: cleanedCep, address });
        return address;
      }
    }

    throw lastError!;
  }

  /**
   * Returns a `CepNotFoundError` when `error` unambiguously means the CEP does not
   * exist (either thrown directly by a single-provider lookup, or wrapped in an
   * `AllProvidersFailedError` where every provider agreed it was not found).
   */
  private asGenuineNotFound(error: unknown): CepNotFoundError | undefined {
    if (error instanceof CepNotFoundError) {
      return error;
    }
    if (error instanceof AllProvidersFailedError) {
      const allNotFound = error.errors.length > 0 && error.errors.every((e) => e instanceof CepNotFoundError);
      if (allNotFound) {
        return new CepNotFoundError((error.errors[0] as CepNotFoundError).cep);
      }
    }
    return undefined;
  }

  private async _lookupFromProviders(cleanedCep: string, externalSignal?: AbortSignal): Promise<Address> {
    const controller = new AbortController();
    const { signal } = controller;

    let onExternalAbort: (() => void) | undefined;
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        onExternalAbort = () => controller.abort();
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      return await this.raceProviders(cleanedCep, controller, signal);
    } finally {
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private async raceProviders(cleanedCep: string, controller: AbortController, signal: AbortSignal): Promise<Address> {
    const availableProviders = this.sortedProviders.filter((provider) => !this.isProviderOpen(provider.name));
    const providersByHealth = [...availableProviders].sort((a, b) => this.scoreProvider(b) - this.scoreProvider(a));
    const selectedProviders = providersByHealth.length > 0 ? providersByHealth : [...this.sortedProviders].sort((a, b) => this.scoreProvider(b) - this.scoreProvider(a));

    if (selectedProviders.length === 0) {
      throw new AllProvidersFailedError([new ProviderUnavailableError("all")]);
    }

    if (availableProviders.length === 0 && this.circuitBreakerEnabled) {
      throw new AllProvidersFailedError(selectedProviders.map((p) => new ProviderUnavailableError(p.name)));
    }

    const createProviderPromise = (provider: Provider) => {
      const startTime = Date.now();
      const url = provider.buildUrl(cleanedCep);
      this.log('provider:start', { provider: provider.name, cep: cleanedCep });

      const timeoutPromise = new Promise<never>((_, reject) => {
        if (!provider.timeout) return;
        const timeoutId = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          const duration = Date.now() - startTime;
          const error = new ProviderTimeoutError(provider.name, provider.timeout!);
          this.recordProviderFailure(provider.name, duration, error);
          this.log('provider:failure', { provider: provider.name, cep: cleanedCep, error: error.message });
          this.emitter.emit('failure', { provider: provider.name, cep: cleanedCep, duration, error });
          reject(error);
        }, provider.timeout);
        const onAbort = () => clearTimeout(timeoutId);
        signal.addEventListener('abort', onAbort, { once: true });
      });

      const fetchPromise = this.fetcher(url, signal)
        .then((response) => provider.transform(response))
        .then((address) => {
          const duration = Date.now() - startTime;
          const sanitizedAddress = enrichAddress(sanitizeAddress(address));
          this.recordProviderSuccess(provider.name, duration);
          this.log('provider:success', { provider: provider.name, cep: cleanedCep, duration });
          this.emitter.emit('success', { provider: provider.name, cep: cleanedCep, duration, address: sanitizedAddress });
          return sanitizedAddress;
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          const normalizedError = normalizeProviderError(error, cleanedCep, provider.name);
          if ((normalizedError as Error).name === 'AbortError') {
            this.releaseHalfOpenProbe(provider.name);
          } else if (!(normalizedError instanceof ProviderTimeoutError)) {
            this.recordProviderFailure(provider.name, duration, normalizedError);
            this.log('provider:failure', { provider: provider.name, cep: cleanedCep, error: normalizedError.message });
            this.emitter.emit('failure', { provider: provider.name, cep: cleanedCep, duration, error: normalizedError });
          }
          throw normalizedError;
        });

      return Promise.race([fetchPromise, timeoutPromise]);
    };

    const bestProvider = selectedProviders[0];
    const otherProviders = selectedProviders.slice(1);

    if (otherProviders.length === 0) {
      try {
        return await createProviderPromise(bestProvider);
      } finally {
        controller.abort();
      }
    }

    let staggerTimeout: ReturnType<typeof setTimeout> | null = null;
    let triggerOthers: (() => void) | null = null;

    const secondaryPromise = new Promise<Address>((resolve, reject) => {
      triggerOthers = () => {
        if (staggerTimeout) clearTimeout(staggerTimeout);
        if (signal.aborted) return;
        const promises = otherProviders.map(createProviderPromise);
        Promise.any(promises).then(resolve).catch(reject);
      };

      staggerTimeout = setTimeout(triggerOthers, this.staggerDelay);
    });

    const primaryPromise = createProviderPromise(bestProvider).catch((err) => {
      if (triggerOthers) triggerOthers();
      throw err;
    });

    try {
      return await Promise.any([primaryPromise, secondaryPromise]);
    } catch (aggregateError) {
      const errors = (aggregateError as AggregateError).errors || [aggregateError];
      // `secondaryPromise` rejects with its own nested AggregateError (from the inner
      // Promise.any over `otherProviders`), so flatten before wrapping — otherwise
      // downstream checks like "every error is CepNotFoundError" would see an opaque
      // AggregateError instead of the individual provider errors.
      throw new AllProvidersFailedError(flattenAggregateErrors(errors));
    } finally {
      if (staggerTimeout) clearTimeout(staggerTimeout);
      controller.abort();
    }
  }

  /**
   * @method searchByAddress
   * @description Performs a reverse lookup: finds candidate CEPs from a state, city and
   * street name. Requires a provider that implements `buildSearchUrl`/`transformSearch`
   * (ViaCEP does, out of the box).
   * @param {string} state - Two-letter Brazilian state abbreviation (UF).
   * @param {string} city - City name, minimum 3 characters.
   * @param {string} street - Street name, minimum 3 characters.
   * @returns {Promise<Address[]>} Matching addresses.
   */
  public async searchByAddress(state: string, city: string, street: string): Promise<Address[]> {
    const uf = (state || "").trim().toUpperCase();
    const cityTrimmed = (city || "").trim();
    const streetTrimmed = (street || "").trim();

    if (!/^[A-Z]{2}$/.test(uf)) {
      throw new CepValidationError(state);
    }
    if (cityTrimmed.length < 3 || streetTrimmed.length < 3) {
      throw new Error("City and street must have at least 3 characters for reverse address search.");
    }

    const provider = this.providers.find((p) => typeof p.buildSearchUrl === "function" && typeof p.transformSearch === "function");
    if (!provider || !provider.buildSearchUrl || !provider.transformSearch) {
      throw new Error("No configured provider supports reverse address search.");
    }

    const url = provider.buildSearchUrl(uf, cityTrimmed, streetTrimmed);
    const response = await this.fetcher(url);
    const results = provider.transformSearch(response);
    return results.map((address) => enrichAddress(sanitizeAddress(address)));
  }

  public async lookupCeps<T = Address>(ceps: string[], concurrency: number = 5, mapper?: (address: Address) => T): Promise<BulkCepResult<T>[]> {
    if (!ceps || ceps.length === 0) {
      return [];
    }

    const results: BulkCepResult<T>[] = new Array(ceps.length);
    let cepIndex = 0;

    const worker = async () => {
      while (cepIndex < ceps.length) {
        const currentIndex = cepIndex++;
        if (currentIndex >= ceps.length) break;
        const cep = ceps[currentIndex];
        try {
          const address = await this.lookup(cep);
          if (address) {
            results[currentIndex] = {
              cep,
              data: mapper ? mapper(address) : (address as unknown as T),
              provider: address.service,
            };
          } else {
            throw new Error('No address found');
          }
        } catch (error) {
          results[currentIndex] = { cep, data: null, error: error as Error };
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, ceps.length) }, () => worker());
    await Promise.all(workers);

    return results.filter(Boolean);
  }
}

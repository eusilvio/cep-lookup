import {
  ZipAddress, Fetcher, ZipProvider, ZipLookupOptions, LookupOptions, BulkZipResult,
  RateLimitOptions, EventName, EventListener, EventMap,
  ProviderHealth, ProviderMetrics, CircuitBreakerOptions, MaybePromise,
} from "./types";
import { ZipCache, InMemoryCache, InMemoryCacheOptions, StaleCacheEntry } from "./cache";
import {
  ZipValidationError, RateLimitError, ProviderTimeoutError, ZipNotFoundError,
  AllProvidersFailedError, ProviderUnavailableError, normalizeProviderError,
} from "./errors";

export type {
  ZipAddress, Fetcher, ZipProvider, ZipLookupOptions, LookupOptions, BulkZipResult,
  RateLimitOptions, EventName, EventListener, EventMap, ZipCache,
  InMemoryCacheOptions, StaleCacheEntry, ProviderHealth, ProviderMetrics, CircuitBreakerOptions, MaybePromise,
};
export { InMemoryCache };
export {
  ZipValidationError, RateLimitError, ProviderTimeoutError, ZipNotFoundError,
  AllProvidersFailedError, ProviderUnavailableError,
};

/** Internal marker stored in the cache to represent a confirmed "not found" ZIP (negative cache). */
interface NegativeCacheEntry {
  __zipLookupNotFound: true;
  zip: string;
  expiresAt: number;
}

function isNegativeCacheEntry(value: unknown): value is NegativeCacheEntry {
  return !!value && typeof value === "object" && (value as any).__zipLookupNotFound === true;
}

function makeNegativeCacheEntry(zip: string, ttlMs: number): ZipAddress {
  const entry: NegativeCacheEntry = {
    __zipLookupNotFound: true,
    zip,
    expiresAt: Date.now() + ttlMs,
  };
  return entry as unknown as ZipAddress;
}

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
    if (!listeners) return;
    this.listeners[eventName] = (listeners as EventListener<T>[]).filter(
      (l) => l !== listener
    ) as any;
  }

  public emit<T extends EventName>(eventName: T, payload: EventMap[T]): void {
    const listeners = this.listeners[eventName];
    if (!listeners) return;
    (listeners as EventListener<T>[]).forEach((listener) => {
      try {
        listener(payload);
      } catch (err) {
        this.logger?.debug('listener:error', { event: eventName, error: (err as Error)?.message });
      }
    });
  }
}

function validateZip(zip: string): string {
  // Accepts: 12345 | 12345-6789 | 123456789
  const zipRegex = /^(\d{5}-\d{4}|\d{9}|\d{5})$/;
  if (!zipRegex.test(zip)) {
    throw new ZipValidationError(zip);
  }
  // Normalize to 5-digit ZIP for API calls
  return zip.replace("-", "").slice(0, 5);
}

function sanitizeAddress(address: ZipAddress): ZipAddress {
  const sanitized = { ...address };
  (Object.keys(sanitized) as Array<keyof ZipAddress>).forEach((key) => {
    const value = sanitized[key];
    if (typeof value === "string") {
      (sanitized[key] as string) = value.trim();
    }
  });
  return sanitized;
}

function parseLookupArg<T>(
  arg?: LookupOptions<T> | ((address: ZipAddress) => T)
): { mapper?: (address: ZipAddress) => T; signal?: AbortSignal } {
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

export class ZipLookup {
  private providers: ZipProvider[];
  private sortedProviders: ZipProvider[];
  private fetcher: Fetcher;
  private cache?: ZipCache;
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
  private inFlightLookups = new Map<string, Promise<ZipAddress>>();

  constructor(options: ZipLookupOptions) {
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
   * Pings providers to determine the fastest one and updates internal priority order.
   * Each provider gets its own timeout (falling back to 5000ms) so a single hung
   * provider can never block the others.
   */
  public async warmup(): Promise<ZipProvider[]> {
    const controlZip = "10001"; // New York City - always valid

    const race = this.providers.map(async (provider) => {
      const controller = new AbortController();
      const timeoutMs = provider.timeout ?? 5000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();
      try {
        const url = provider.buildUrl(controlZip);
        const providerFetcher = provider.fetcher || this.fetcher;
        await providerFetcher(url, controller.signal);
        return { provider, duration: Date.now() - start, error: false };
      } catch {
        return { provider, duration: Infinity, error: true };
      } finally {
        clearTimeout(timer);
      }
    });

    const results = await Promise.all(race);
    const sortedResults = results.sort((a, b) => a.duration - b.duration);
    this.sortedProviders = sortedResults.map(r => r.provider).filter(p => !!p);
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
    const isNotFound = error instanceof ZipNotFoundError;
    if (error instanceof ProviderTimeoutError) state.timeoutErrors += 1;
    if (isNotFound) state.notFoundErrors += 1;
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

  private isProviderOpen(providerName: string): boolean {
    if (!this.circuitBreakerEnabled) return false;
    const state = this.getOrCreateProviderState(providerName);
    if (state.openUntil === undefined) return false;
    if (Date.now() < state.openUntil) return true;
    if (state.halfOpenProbeInFlight) return true;
    state.halfOpenProbeInFlight = true;
    return false;
  }

  private releaseHalfOpenProbe(providerName: string): void {
    const state = this.getOrCreateProviderState(providerName);
    state.halfOpenProbeInFlight = false;
  }

  private scoreProvider(provider: ZipProvider): number {
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

  async lookup<T = ZipAddress>(zip: string, arg?: LookupOptions<T> | ((address: ZipAddress) => T)): Promise<T> {
    const { mapper, signal: externalSignal } = parseLookupArg<T>(arg);
    if (this.rateLimit) {
      await this.checkRateLimit();
    }
    const cleanedZip = validateZip(zip);
    this.log('lookup:start', { zip: cleanedZip });

    if (this.cache) {
      const cached = await this.cache.get(cleanedZip);
      if (cached !== undefined) {
        if (isNegativeCacheEntry(cached)) {
          if (Date.now() < cached.expiresAt) {
            throw new ZipNotFoundError(cleanedZip);
          }
        } else {
          this.log('cache:hit', { zip: cleanedZip });
          this.emitter.emit('cache:hit', { zip: cleanedZip });
          return mapper ? mapper(cached) : (cached as ZipAddress as T);
        }
      }
    }

    const address = externalSignal
      ? await this.fetchWithRetryAndFallback(cleanedZip, externalSignal)
      : await this.dedupedFetch(cleanedZip);

    return mapper ? mapper(address) : (address as ZipAddress as T);
  }

  /**
   * Request coalescing (singleflight): concurrent lookups for the same ZIP share the
   * same in-flight promise. Only used when no external `signal` is supplied.
   */
  private dedupedFetch(cleanedZip: string): Promise<ZipAddress> {
    const existing = this.inFlightLookups.get(cleanedZip);
    if (existing) return existing;

    const promise = this.fetchWithRetryAndFallback(cleanedZip);
    this.inFlightLookups.set(cleanedZip, promise);
    const release = () => {
      if (this.inFlightLookups.get(cleanedZip) === promise) {
        this.inFlightLookups.delete(cleanedZip);
      }
    };
    promise.then(release, release);
    return promise;
  }

  private async fetchWithRetryAndFallback(cleanedZip: string, externalSignal?: AbortSignal): Promise<ZipAddress> {
    let lastError: Error | undefined;
    const maxAttempts = 1 + this.retries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (externalSignal?.aborted) {
        throw toAbortError(externalSignal);
      }
      if (attempt > 0) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.log('retry:attempt', { attempt, zip: cleanedZip, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      try {
        const address = await this._lookupFromProviders(cleanedZip, externalSignal);
        if (this.cache) {
          await this.cache.set(cleanedZip, address);
        }
        return address;
      } catch (error) {
        if (externalSignal?.aborted) {
          throw toAbortError(externalSignal);
        }
        if (error instanceof ZipValidationError || error instanceof RateLimitError) {
          throw error;
        }

        const notFoundError = this.asGenuineNotFound(error);
        if (notFoundError) {
          if (this.cache && this.negativeCacheTtl) {
            await this.cache.set(cleanedZip, makeNegativeCacheEntry(cleanedZip, this.negativeCacheTtl));
          }
          throw notFoundError;
        }
        lastError = error as Error;
      }
    }

    if (this.cache?.getStale) {
      const stale = await this.cache.getStale(cleanedZip);
      if (stale && !isNegativeCacheEntry(stale.value) && this.isStaleUsable(stale)) {
        this.log('cache:stale', { zip: cleanedZip });
        this.emitter.emit('cache:stale', { zip: cleanedZip, address: stale.value });
        return stale.value;
      }
    }

    throw lastError!;
  }

  private asGenuineNotFound(error: unknown): ZipNotFoundError | undefined {
    if (error instanceof ZipNotFoundError) {
      return error;
    }
    if (error instanceof AllProvidersFailedError) {
      const allNotFound = error.errors.length > 0 && error.errors.every((e) => e instanceof ZipNotFoundError);
      if (allNotFound) {
        return new ZipNotFoundError((error.errors[0] as ZipNotFoundError).zip);
      }
    }
    return undefined;
  }

  private async _lookupFromProviders(cleanedZip: string, externalSignal?: AbortSignal): Promise<ZipAddress> {
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
      return await this.raceProviders(cleanedZip, controller, signal);
    } finally {
      if (externalSignal && onExternalAbort) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private async raceProviders(cleanedZip: string, controller: AbortController, signal: AbortSignal): Promise<ZipAddress> {
    const availableProviders = this.sortedProviders.filter((p) => !this.isProviderOpen(p.name));
    const providersByHealth = [...availableProviders].sort((a, b) => this.scoreProvider(b) - this.scoreProvider(a));
    const selectedProviders = providersByHealth.length > 0
      ? providersByHealth
      : [...this.sortedProviders].sort((a, b) => this.scoreProvider(b) - this.scoreProvider(a));

    if (selectedProviders.length === 0) {
      throw new AllProvidersFailedError([new ProviderUnavailableError("all")]);
    }

    if (availableProviders.length === 0 && this.circuitBreakerEnabled) {
      throw new AllProvidersFailedError(selectedProviders.map((p) => new ProviderUnavailableError(p.name)));
    }

    const createProviderPromise = (provider: ZipProvider) => {
      const startTime = Date.now();
      const url = provider.buildUrl(cleanedZip);
      const providerFetcher = provider.fetcher || this.fetcher;
      this.log('provider:start', { provider: provider.name, zip: cleanedZip });

      const timeoutPromise = new Promise<never>((_, reject) => {
        if (!provider.timeout) return;
        const timeoutId = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          const duration = Date.now() - startTime;
          const error = new ProviderTimeoutError(provider.name, provider.timeout!);
          this.recordProviderFailure(provider.name, duration, error);
          this.log('provider:failure', { provider: provider.name, zip: cleanedZip, error: error.message });
          this.emitter.emit('failure', { provider: provider.name, zip: cleanedZip, duration, error });
          reject(error);
        }, provider.timeout);
        const onAbort = () => clearTimeout(timeoutId);
        signal.addEventListener('abort', onAbort, { once: true });
      });

      const fetchPromise = providerFetcher(url, signal)
        .then((response) => provider.transform(response))
        .then((address) => {
          const duration = Date.now() - startTime;
          const sanitized = sanitizeAddress(address);
          this.recordProviderSuccess(provider.name, duration);
          this.log('provider:success', { provider: provider.name, zip: cleanedZip, duration });
          this.emitter.emit('success', { provider: provider.name, zip: cleanedZip, duration, address: sanitized });
          return sanitized;
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          const normalizedError = normalizeProviderError(error, cleanedZip, provider.name);
          if ((normalizedError as Error).name === 'AbortError') {
            this.releaseHalfOpenProbe(provider.name);
          } else if (!(normalizedError instanceof ProviderTimeoutError)) {
            this.recordProviderFailure(provider.name, duration, normalizedError);
            this.log('provider:failure', { provider: provider.name, zip: cleanedZip, error: normalizedError.message });
            this.emitter.emit('failure', { provider: provider.name, zip: cleanedZip, duration, error: normalizedError });
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

    const secondaryPromise = new Promise<ZipAddress>((resolve, reject) => {
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
      throw new AllProvidersFailedError(flattenAggregateErrors(errors));
    } finally {
      if (staggerTimeout) clearTimeout(staggerTimeout);
      controller.abort();
    }
  }

  public async lookupZips<T = ZipAddress>(
    zips: string[],
    concurrency: number = 5,
    mapper?: (address: ZipAddress) => T,
  ): Promise<BulkZipResult<T>[]> {
    if (!zips || zips.length === 0) return [];

    const results: BulkZipResult<T>[] = new Array(zips.length);
    let zipIndex = 0;

    const worker = async () => {
      while (zipIndex < zips.length) {
        const currentIndex = zipIndex++;
        if (currentIndex >= zips.length) break;
        const zip = zips[currentIndex];
        try {
          const address = await this.lookup(zip);
          if (address) {
            results[currentIndex] = {
              zip,
              data: mapper ? mapper(address) : (address as unknown as T),
              provider: address.service,
            };
          } else {
            throw new Error('No address found');
          }
        } catch (error) {
          results[currentIndex] = { zip, data: null, error: error as Error };
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, zips.length) }, () => worker());
    await Promise.all(workers);

    return results.filter(Boolean);
  }
}

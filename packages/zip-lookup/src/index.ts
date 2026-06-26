import {
  ZipAddress, Fetcher, ZipProvider, ZipLookupOptions, BulkZipResult,
  RateLimitOptions, EventName, EventListener, EventMap,
  ProviderHealth, ProviderMetrics, CircuitBreakerOptions,
} from "./types";
import { ZipCache, InMemoryCache, InMemoryCacheOptions } from "./cache";
import {
  ZipValidationError, RateLimitError, ProviderTimeoutError, ZipNotFoundError,
  AllProvidersFailedError, ProviderUnavailableError, normalizeProviderError,
} from "./errors";

export type {
  ZipAddress, Fetcher, ZipProvider, ZipLookupOptions, BulkZipResult,
  RateLimitOptions, EventName, EventListener, EventMap, ZipCache,
  InMemoryCacheOptions, ProviderHealth, ProviderMetrics, CircuitBreakerOptions,
};
export { InMemoryCache };
export {
  ZipValidationError, RateLimitError, ProviderTimeoutError, ZipNotFoundError,
  AllProvidersFailedError, ProviderUnavailableError,
};

class EventEmitter {
  private listeners: { [K in EventName]?: EventListener<K>[] } = {};

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
    (listeners as EventListener<T>[]).forEach((listener) => listener(payload));
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

interface ProviderRuntimeState {
  consecutiveFailures: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  openUntil?: number;
  requests: number;
  timeoutErrors: number;
  notFoundErrors: number;
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

  constructor(options: ZipLookupOptions) {
    this.providers = options.providers;
    this.sortedProviders = [...options.providers];
    this.emitter = new EventEmitter();
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
    this.logger = options.logger;
    this.circuitBreakerEnabled = options.circuitBreaker?.enabled ?? true;
    this.circuitFailureThreshold = options.circuitBreaker?.failureThreshold ?? 3;
    this.circuitCooldownMs = options.circuitBreaker?.cooldownMs ?? 30000;
    this.providers.forEach((provider) => {
      this.providerState.set(provider.name, {
        consecutiveFailures: 0,
        successCount: 0,
        failureCount: 0,
        avgLatencyMs: 0,
        requests: 0,
        timeoutErrors: 0,
        notFoundErrors: 0,
      });
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
   * Useful to call on UI events like 'focus' on the ZIP input.
   */
  public async warmup(): Promise<ZipProvider[]> {
    const controlZip = "10001"; // New York City - always valid
    const controller = new AbortController();

    const race = this.providers.map(async (provider) => {
      const start = Date.now();
      try {
        const url = provider.buildUrl(controlZip);
        const providerFetcher = provider.fetcher || this.fetcher;
        await providerFetcher(url, controller.signal);
        return { provider, duration: Date.now() - start, error: false };
      } catch {
        return { provider, duration: Infinity, error: true };
      }
    });

    const results = await Promise.all(race);
    const sortedResults = results.sort((a, b) => a.duration - b.duration);
    this.sortedProviders = sortedResults.map(r => r.provider).filter(p => !!p);
    controller.abort();
    return this.sortedProviders;
  }

  private getOrCreateProviderState(providerName: string): ProviderRuntimeState {
    const existing = this.providerState.get(providerName);
    if (existing) return existing;
    const created: ProviderRuntimeState = {
      consecutiveFailures: 0,
      successCount: 0,
      failureCount: 0,
      avgLatencyMs: 0,
      requests: 0,
      timeoutErrors: 0,
      notFoundErrors: 0,
    };
    this.providerState.set(providerName, created);
    return created;
  }

  private recordProviderSuccess(providerName: string, durationMs: number): void {
    const state = this.getOrCreateProviderState(providerName);
    state.requests += 1;
    state.successCount += 1;
    state.consecutiveFailures = 0;
    const n = state.successCount + state.failureCount;
    state.avgLatencyMs = n === 1 ? durationMs : ((state.avgLatencyMs * (n - 1)) + durationMs) / n;
    state.openUntil = undefined;
  }

  private recordProviderFailure(providerName: string, durationMs: number, error: Error): void {
    const state = this.getOrCreateProviderState(providerName);
    state.requests += 1;
    state.failureCount += 1;
    state.consecutiveFailures += 1;
    const n = state.successCount + state.failureCount;
    state.avgLatencyMs = n === 1 ? durationMs : ((state.avgLatencyMs * (n - 1)) + durationMs) / n;
    if (error instanceof ProviderTimeoutError) state.timeoutErrors += 1;
    if (error instanceof ZipNotFoundError) state.notFoundErrors += 1;
    if (this.circuitBreakerEnabled && state.consecutiveFailures >= this.circuitFailureThreshold) {
      state.openUntil = Date.now() + this.circuitCooldownMs;
    }
  }

  private isProviderOpen(providerName: string): boolean {
    if (!this.circuitBreakerEnabled) return false;
    const state = this.getOrCreateProviderState(providerName);
    if (!state.openUntil) return false;
    if (Date.now() >= state.openUntil) {
      state.openUntil = undefined;
      state.consecutiveFailures = 0;
      return false;
    }
    return true;
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
      };
    });
  }

  private checkRateLimit(): void {
    if (!this.rateLimit) return;
    const now = Date.now();
    const windowStart = now - this.rateLimit.per;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > windowStart);
    if (this.requestTimestamps.length >= this.rateLimit.requests) {
      throw new RateLimitError(this.rateLimit.requests, this.rateLimit.per);
    }
    this.requestTimestamps.push(now);
  }

  async lookup<T = ZipAddress>(zip: string, mapper?: (address: ZipAddress) => T): Promise<T> {
    this.checkRateLimit();
    const cleanedZip = validateZip(zip);
    this.log('lookup:start', { zip: cleanedZip });

    if (this.cache) {
      const cachedAddress = this.cache.get(cleanedZip);
      if (cachedAddress) {
        this.log('cache:hit', { zip: cleanedZip });
        this.emitter.emit('cache:hit', { zip: cleanedZip });
        return mapper ? mapper(cachedAddress) : (cachedAddress as ZipAddress as T);
      }
    }

    let lastError: Error | undefined;
    const maxAttempts = 1 + this.retries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.log('retry:attempt', { attempt, zip: cleanedZip, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      try {
        return await this._lookupFromProviders(cleanedZip, mapper);
      } catch (error) {
        if (error instanceof ZipValidationError || error instanceof RateLimitError) {
          throw error;
        }
        lastError = error as Error;
      }
    }
    throw lastError!;
  }

  private async _lookupFromProviders<T = ZipAddress>(cleanedZip: string, mapper?: (address: ZipAddress) => T): Promise<T> {
    const controller = new AbortController();
    const { signal } = controller;
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
          if (this.cache) this.cache.set(cleanedZip, sanitized);
          return mapper ? mapper(sanitized) : (sanitized as ZipAddress as T);
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          const normalizedError = normalizeProviderError(error, cleanedZip, provider.name);
          if ((normalizedError as Error).name !== 'AbortError' && !(normalizedError instanceof ProviderTimeoutError)) {
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

    const secondaryPromise = new Promise<T>((resolve, reject) => {
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
      throw new AllProvidersFailedError(errors);
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

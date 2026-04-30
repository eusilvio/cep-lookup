import { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap, ProviderHealth, ProviderMetrics, CircuitBreakerOptions } from "./types";
import { Cache, InMemoryCache, InMemoryCacheOptions } from "./cache";
import { CepValidationError, RateLimitError, ProviderTimeoutError, CepNotFoundError, AllProvidersFailedError, ProviderUnavailableError, normalizeProviderError } from "./errors";
import { dddByState } from "./data/ddd-by-state";

export type { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap, Cache, InMemoryCacheOptions, ProviderHealth, ProviderMetrics, CircuitBreakerOptions };
export { InMemoryCache };
export { CepValidationError, RateLimitError, ProviderTimeoutError, CepNotFoundError, AllProvidersFailedError, ProviderUnavailableError };

// Minimal EventEmitter for internal use
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
    (listeners as EventListener<T>[]).forEach((listener) => listener(payload));
  }
}

/**
 * @function validateCep
 * @description Validates and cleans a CEP string strictly.
 * @param {string} cep - The CEP string to validate.
 * @returns {string} The cleaned, 8-digit CEP string.
 * @throws {Error} If the CEP format is invalid.
 */
function validateCep(cep: string): string {
  const cepRegex = /^(\d{8}|\d{5}-\d{3})$/;
  if (!cepRegex.test(cep)) {
    throw new CepValidationError(cep);
  }
  return cep.replace("-", "");
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

  constructor(options: CepLookupOptions) {
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
   * @method warmup
   * @description Pings providers to determine the fastest one and updates the internal priority order.
   * Useful to call on UI events like 'focus' on the CEP input.
   * @returns {Promise<Provider[]>} The list of providers sorted by latency.
   */
  public async warmup(): Promise<Provider[]> {
    const controlCep = "01001000"; // Praça da Sé (Fixed Valid CEP)
    const controller = new AbortController();
    
    const race = this.providers.map(async (provider) => {
      const start = Date.now();
      try {
        const url = provider.buildUrl(controlCep);
        await this.fetcher(url, controller.signal);
        // We don't care about the result content, just that it didn't throw network error
        return { provider, duration: Date.now() - start, error: false };
      } catch (e) {
        return { provider, duration: Infinity, error: true };
      }
    });

    // Wait for all to finish (or fail)
    const results = await Promise.all(race);
    
    // Sort providers: functional/fastest first
    const sortedResults = results.sort((a, b) => a.duration - b.duration);
    
    this.sortedProviders = sortedResults
      .map(r => r.provider)
      .filter(p => !!p);

    // Abort any lingering requests (though we awaited all)
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
    if (error instanceof ProviderTimeoutError) {
      state.timeoutErrors += 1;
    }
    if (error instanceof CepNotFoundError) {
      state.notFoundErrors += 1;
    }
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

  async lookup<T = Address>(cep: string, mapper?: (address: Address) => T): Promise<T> {
    this.checkRateLimit();
    const cleanedCep = validateCep(cep);
    this.log('lookup:start', { cep: cleanedCep });

    if (this.cache) {
      const cachedAddress = this.cache.get(cleanedCep);
      if (cachedAddress) {
        this.log('cache:hit', { cep: cleanedCep });
        this.emitter.emit('cache:hit', { cep: cleanedCep });
        return mapper ? mapper(cachedAddress) : (cachedAddress as Address as T);
      }
    }

    let lastError: Error | undefined;
    const maxAttempts = 1 + this.retries;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        this.log('retry:attempt', { attempt, cep: cleanedCep, delay });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      try {
        return await this._lookupFromProviders(cleanedCep, mapper);
      } catch (error) {
        if (error instanceof CepValidationError || error instanceof RateLimitError) {
          throw error;
        }
        lastError = error as Error;
      }
    }
    throw lastError!;
  }

  private async _lookupFromProviders<T = Address>(cleanedCep: string, mapper?: (address: Address) => T): Promise<T> {
    const controller = new AbortController();
    const { signal } = controller;
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
          if (this.cache) {
            this.cache.set(cleanedCep, sanitizedAddress);
          }
          return mapper ? mapper(sanitizedAddress) : (sanitizedAddress as Address as T);
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          const normalizedError = normalizeProviderError(error, cleanedCep, provider.name);
          if ((normalizedError as Error).name !== 'AbortError' && !(normalizedError instanceof ProviderTimeoutError)) {
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

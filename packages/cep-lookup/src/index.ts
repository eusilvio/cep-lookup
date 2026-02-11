import { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap } from "./types";
import { Cache, InMemoryCache, InMemoryCacheOptions } from "./cache";
import { CepValidationError, RateLimitError, ProviderTimeoutError, CepNotFoundError, AllProvidersFailedError } from "./errors";

export type { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap, Cache, InMemoryCacheOptions };
export { InMemoryCache };
export { CepValidationError, RateLimitError, ProviderTimeoutError, CepNotFoundError, AllProvidersFailedError };

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
          const sanitizedAddress = sanitizeAddress(address);
          this.log('provider:success', { provider: provider.name, cep: cleanedCep, duration });
          this.emitter.emit('success', { provider: provider.name, cep: cleanedCep, duration, address: sanitizedAddress });
          if (this.cache) {
            this.cache.set(cleanedCep, sanitizedAddress);
          }
          return mapper ? mapper(sanitizedAddress) : (sanitizedAddress as Address as T);
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          if (!error.message.includes('Timeout from') && error.name !== 'AbortError') {
            this.log('provider:failure', { provider: provider.name, cep: cleanedCep, error: error.message });
            this.emitter.emit('failure', { provider: provider.name, cep: cleanedCep, duration, error });
          }
          throw error;
        });

      return Promise.race([fetchPromise, timeoutPromise]);
    };

    const bestProvider = this.sortedProviders[0];
    const otherProviders = this.sortedProviders.slice(1);

    if (otherProviders.length === 0) {
      try {
        return await createProviderPromise(bestProvider);
      } finally {
        controller.abort();
      }
    }

    let staggerTimeout: NodeJS.Timeout | null = null;
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

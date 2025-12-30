import { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap } from "./types";
import { Cache, InMemoryCache } from "./cache";

export type { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap, Cache };
export { InMemoryCache };

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
    throw new Error("Invalid CEP format. Use either NNNNNNNN or NNNNN-NNN.");
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
      throw new Error(`Rate limit exceeded: ${this.rateLimit.requests} requests per ${this.rateLimit.per}ms.`);
    }
    this.requestTimestamps.push(now);
  }

  async lookup<T = Address>(cep: string, mapper?: (address: Address) => T): Promise<T> {
    this.checkRateLimit();
    const cleanedCep = validateCep(cep);

    if (this.cache) {
      const cachedAddress = this.cache.get(cleanedCep);
      if (cachedAddress) {
        this.emitter.emit('cache:hit', { cep: cleanedCep });
        return mapper ? mapper(cachedAddress) : (cachedAddress as Address as T);
      }
    }

    const controller = new AbortController();
    const { signal } = controller;

    // Helper to create the promise for a specific provider
    const createProviderPromise = (provider: Provider) => {
      const startTime = Date.now();
      const url = provider.buildUrl(cleanedCep);

      const timeoutPromise = new Promise<never>((_, reject) => {
        if (!provider.timeout) return;
        const timeoutId = setTimeout(() => {
          signal.removeEventListener('abort', onAbort);
          const duration = Date.now() - startTime;
          const error = new Error(`Timeout from ${provider.name}`);
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
          this.emitter.emit('success', { provider: provider.name, cep: cleanedCep, duration, address: sanitizedAddress });
          if (this.cache) {
            this.cache.set(cleanedCep, sanitizedAddress);
          }
          return mapper ? mapper(sanitizedAddress) : (sanitizedAddress as Address as T);
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          // Only emit failure if it's not a self-induced abortion or timeout handled elsewhere
          if (!error.message.includes('Timeout from') && error.name !== 'AbortError') {
             this.emitter.emit('failure', { provider: provider.name, cep: cleanedCep, duration, error });
          }
          throw error;
        });

      return Promise.race([fetchPromise, timeoutPromise]);
    };

    // Staggered Strategy using sortedProviders
    const bestProvider = this.sortedProviders[0];
    const otherProviders = this.sortedProviders.slice(1);

    // If we only have one provider, just execute it
    if (otherProviders.length === 0) {
      try {
        return await createProviderPromise(bestProvider);
      } finally {
        controller.abort();
      }
    }

    // Execute primary and manage staggering
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
      // If primary fails, trigger others immediately
      if (triggerOthers) triggerOthers();
      throw err;
    });

    try {
      return await Promise.any([primaryPromise, secondaryPromise]);
    } finally {
      if (staggerTimeout) clearTimeout(staggerTimeout);
      controller.abort();
    }
  }

  public async lookupCeps(ceps: string[], concurrency: number = 5): Promise<BulkCepResult[]> {
    if (!ceps || ceps.length === 0) {
      return [];
    }

    const results: BulkCepResult[] = new Array(ceps.length);
    let cepIndex = 0;

    const worker = async () => {
      while (cepIndex < ceps.length) {
        const currentIndex = cepIndex++;
        if (currentIndex >= ceps.length) break;
        const cep = ceps[currentIndex];
        try {
          const address = await this.lookup(cep);
          if (address) {
            results[currentIndex] = { cep, data: address, provider: address.service };
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

/**
 * @deprecated Use `new CepLookup(options).lookup(cep)` instead.
 */
export function lookupCep<T = Address>(options: CepLookupOptions & { cep: string, mapper?: (address: Address) => T }): Promise<T> {
  console.warn("[cep-lookup] The standalone `lookupCep` function is deprecated and will be removed in a future version. Please use `new CepLookup(options).lookup(cep)` instead.");
  const { cep, providers, fetcher, mapper, cache, rateLimit } = options;
  const cepLookup = new CepLookup({ providers, fetcher, cache, rateLimit });
  return cepLookup.lookup(cep, mapper);
}

/**
 * @deprecated Use `new CepLookup(options).lookupCeps(ceps)` instead.
 */
export async function lookupCeps(options: CepLookupOptions & { ceps: string[], concurrency?: number }): Promise<BulkCepResult[]> {
  console.warn("[cep-lookup] The standalone `lookupCeps` function is deprecated and will be removed in a future version. Please use `new CepLookup(options).lookupCeps(ceps)` instead.");
  const { ceps, providers, fetcher, cache, concurrency = 5, rateLimit } = options;
  const cepLookup = new CepLookup({ providers, fetcher, cache, rateLimit });
  return cepLookup.lookupCeps(ceps, concurrency);
}

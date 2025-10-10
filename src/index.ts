import { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap } from "./types";
import { Cache, InMemoryCache } from "./cache";

export { Address, Fetcher, Provider, CepLookupOptions, Cache, InMemoryCache, BulkCepResult, RateLimitOptions, EventName, EventListener, EventMap };

// Minimal EventEmitter for internal use
class EventEmitter {
  private listeners: { [K in EventName]?: EventListener<K>[] } = {};

  public on<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    this.listeners[eventName]!.push(listener);
  }

  public off<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    if (!this.listeners[eventName]) {
      return;
    }
    // Use a type assertion to work around a complex generic issue
    this.listeners[eventName] = (this.listeners[eventName] as any[]).filter(
      (l) => l !== listener
    );
  }

  public emit<T extends EventName>(eventName: T, payload: EventMap[T]): void {
    if (!this.listeners[eventName]) {
      return;
    }
    this.listeners[eventName]!.forEach((listener) => listener(payload));
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
  for (const key in sanitized) {
    if (typeof sanitized[key as keyof Address] === 'string') {
      (sanitized as any)[key] = (sanitized[key as keyof Address] as string).trim();
    }
  }
  return sanitized;
}

/**
 * @class CepLookup
 * @description A class for looking up Brazilian postal codes (CEPs) using multiple providers.
 */
export class CepLookup {
  private providers: Provider[];
  private fetcher: Fetcher;
  private cache?: Cache;
  private rateLimit?: RateLimitOptions;
  private requestTimestamps: number[] = [];
  private emitter: EventEmitter;

  constructor(options: CepLookupOptions) {
    this.providers = options.providers;
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
  }

  public on<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    this.emitter.on(eventName, listener);
  }

  public off<T extends EventName>(eventName: T, listener: EventListener<T>): void {
    this.emitter.off(eventName, listener);
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
        return Promise.resolve(mapper ? mapper(cachedAddress) : (cachedAddress as unknown as T));
      }
    }

    const controller = new AbortController();
    const { signal } = controller;

    const promises = this.providers.map((provider) => {
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
          return mapper ? mapper(sanitizedAddress) : (sanitizedAddress as unknown as T);
        })
        .catch((error) => {
          const duration = Date.now() - startTime;
          if (!error.message.includes('Timeout from')) {
            this.emitter.emit('failure', { provider: provider.name, cep: cleanedCep, duration, error });
          }
          throw error;
        });

      return Promise.race([fetchPromise, timeoutPromise]);
    });

    try {
      return await Promise.any(promises);
    } finally {
      controller.abort();
    }
  }
}

export function lookupCep<T = Address>(options: CepLookupOptions & { cep: string, mapper?: (address: Address) => T }): Promise<T> {
  const { cep, providers, fetcher, mapper, cache, rateLimit } = options;
  const cepLookup = new CepLookup({ providers, fetcher, cache, rateLimit });
  return cepLookup.lookup(cep, mapper);
}

export async function lookupCeps(options: CepLookupOptions & { ceps: string[], concurrency?: number }): Promise<BulkCepResult[]> {
  const { ceps, providers, fetcher, cache, concurrency = 5, rateLimit } = options;
  if (!ceps || ceps.length === 0) {
    return [];
  }

  const cepLookup = new CepLookup({ providers, fetcher, cache, rateLimit });

  const results: BulkCepResult[] = new Array(ceps.length);
  let cepIndex = 0;

  const worker = async () => {
    while (cepIndex < ceps.length) {
      const currentIndex = cepIndex++;
      if (currentIndex >= ceps.length) break;
      const cep = ceps[currentIndex];
      try {
        const address = await cepLookup.lookup(cep);
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

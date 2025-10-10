
import { Address, Fetcher, Provider, CepLookupOptions, BulkCepResult, RateLimitOptions } from "./types";
import { Cache, InMemoryCache } from "./cache";

export { Address, Fetcher, Provider, CepLookupOptions, Cache, InMemoryCache, BulkCepResult, RateLimitOptions };

/**
 * @function validateCep
 * @description Validates and cleans a CEP string. Removes non-digit characters and checks for an 8-digit length.
 * @param {string} cep - The CEP string to validate.
 * @returns {string} The cleaned, 8-digit CEP string.
 * @throws {Error} If the CEP is invalid (not 8 digits after cleaning).
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
 * It queries multiple services simultaneously and returns the response from the fastest one.
 */
export class CepLookup {
  private providers: Provider[];
  private fetcher: Fetcher;
  private cache?: Cache;
  private rateLimit?: RateLimitOptions;
  private requestTimestamps: number[] = [];

  /**
   * @constructor
   * @param {CepLookupOptions} options - The options for initializing the CepLookup instance.
   */
  constructor(options: CepLookupOptions) {
    this.providers = options.providers;
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

  private checkRateLimit(): void {
    if (!this.rateLimit) {
      return;
    }

    const now = Date.now();
    const windowStart = now - this.rateLimit.per;

    // Remove timestamps older than the window
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => timestamp > windowStart
    );

    if (this.requestTimestamps.length >= this.rateLimit.requests) {
      throw new Error(
        `Rate limit exceeded: ${this.rateLimit.requests} requests per ${this.rateLimit.per}ms.`
      );
    }

    this.requestTimestamps.push(now);
  }

  /**
   * @method lookup
   * @description Looks up an address for a given CEP.
   * @template T - The expected return type, defaults to `Address`.
   * @param {string} cep - The CEP to be queried.
   * @param {(address: Address) => T} [mapper] - An optional function to transform the `Address` object into a custom format `T`.
   * @returns {Promise<T>} A Promise that resolves to the address in the default `Address` format or a custom format `T` if a mapper is provided.
   * @throws {Error} If the CEP is invalid or if all providers fail to find the CEP.
   */
  async lookup<T = Address>(cep: string, mapper?: (address: Address) => T): Promise<T> {
    this.checkRateLimit(); // Enforce rate limit

    const cleanedCep = validateCep(cep);

    if (this.cache) {
      const cachedAddress = this.cache.get(cleanedCep);
      if (cachedAddress) {
        return Promise.resolve(mapper ? mapper(cachedAddress) : (cachedAddress as unknown as T));
      }
    }

    const controller = new AbortController();
    const { signal } = controller;

    const promises = this.providers.map((provider) => {
      const url = provider.buildUrl(cleanedCep);
      
      const timeoutPromise = new Promise<never>((resolve, reject) => {
        let timeoutId: NodeJS.Timeout;
        const onAbort = () => {
          clearTimeout(timeoutId);
          reject(new DOMException('Aborted', 'AbortError'));
        };

        if (provider.timeout) {
          timeoutId = setTimeout(() => {
            signal.removeEventListener('abort', onAbort);
            reject(new Error(`Timeout from ${provider.name}`));
          }, provider.timeout);
          signal.addEventListener('abort', onAbort, { once: true });
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });

      const fetchPromise = this.fetcher(url, signal)
        .then((response) => provider.transform(response))
        .then((address) => {
          const sanitizedAddress = sanitizeAddress(address);
          if (this.cache) {
            this.cache.set(cleanedCep, sanitizedAddress);
          }
          return mapper ? mapper(sanitizedAddress) : (sanitizedAddress as unknown as T);
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

/**
 * @function lookupCep
 * @description Backward-compatible function for looking up a CEP. Internally creates a `CepLookup` instance.
 * @template T - The expected return type, defaults to `Address`.
 * @param {object} options - Options for the lookup.
 * @param {string} options.cep - The CEP to be queried.
 * @param {Provider[]} options.providers - An array of `Provider` instances.
 * @param {Fetcher} [options.fetcher] - The `Fetcher` function. Defaults to global `fetch` if not provided.
 * @param {Cache} [options.cache] - The `Cache` instance. 
 * @param {(address: Address) => T} [options.mapper] - An optional function to transform the `Address` object.
 * @returns {Promise<T>} A Promise that resolves to the address.
 * @throws {Error} If the CEP is invalid or if all providers fail.
 */
export function lookupCep<T = Address>(options: CepLookupOptions & { cep: string, mapper?: (address: Address) => T }): Promise<T> {
  const { cep, providers, fetcher, mapper, cache } = options;
  const cepLookup = new CepLookup({ providers, fetcher, cache });
  return cepLookup.lookup(cep, mapper);
}

/**
 * @function lookupCeps
 * @description Looks up multiple CEPs in bulk with controlled concurrency.
 * @param {CepLookupOptions & { ceps: string[], concurrency?: number }} options - Options for the bulk lookup.
 * @returns {Promise<BulkCepResult[]>} A Promise that resolves to an array of results for each CEP.
 */
export async function lookupCeps(options: CepLookupOptions & { ceps: string[], concurrency?: number }): Promise<BulkCepResult[]> {
  const { ceps, providers, fetcher, cache, concurrency = 5 } = options;
  if (!ceps || ceps.length === 0) {
    return [];
  }

  const cepLookup = new CepLookup({ providers, fetcher, cache });

  const results: BulkCepResult[] = new Array(ceps.length);
  let cepIndex = 0;

  const worker = async () => {
    while (cepIndex < ceps.length) {
      const currentIndex = cepIndex++;
      // Check if another worker has already taken the last job
      if (currentIndex >= ceps.length) {
        break;
      }
      
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

  return results.filter(Boolean); // Filter out any potential empty slots
}

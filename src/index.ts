
import { Address, Fetcher, Provider, CepLookupOptions } from "./types";

export { Address, Fetcher, Provider, CepLookupOptions };

/**
 * @function validateCep
 * @description Validates and cleans a CEP string. Removes non-digit characters and checks for an 8-digit length.
 * @param {string} cep - The CEP string to validate.
 * @returns {string} The cleaned, 8-digit CEP string.
 * @throws {Error} If the CEP is invalid (not 8 digits after cleaning).
 */
function validateCep(cep: string): string {
  const cleanedCep = cep.replace(/\D/g, "");
  if (cleanedCep.length !== 8) {
    throw new Error("Invalid CEP. It must have 8 digits.");
  }
  return cleanedCep;
}

/**
 * @class CepLookup
 * @description A class for looking up Brazilian postal codes (CEPs) using multiple providers.
 * It queries multiple services simultaneously and returns the response from the fastest one.
 */
export class CepLookup {
  private providers: Provider[];
  private fetcher: Fetcher;

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
    const cleanedCep = validateCep(cep);
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
          // If no timeout, this promise will never resolve/reject on its own
          // but will reject if the signal aborts.
          signal.addEventListener('abort', onAbort, { once: true });
        }
      });

      const fetchPromise = this.fetcher(url, signal)
        .then((response) => provider.transform(response))
        .then((address) => (mapper ? mapper(address) : (address as unknown as T)));

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
 * @param {(address: Address) => T} [options.mapper] - An optional function to transform the `Address` object.
 * @returns {Promise<T>} A Promise that resolves to the address.
 * @throws {Error} If the CEP is invalid or if all providers fail.
 */
export function lookupCep<T = Address>(options: CepLookupOptions & { cep: string, mapper?: (address: Address) => T }): Promise<T> {
  const { cep, providers, fetcher, mapper } = options;
  const cepLookup = new CepLookup({ providers, fetcher });
  return cepLookup.lookup(cep, mapper);
}

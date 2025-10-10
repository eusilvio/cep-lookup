
/**
 * @interface Address
 * @description Represents a standardized address object returned by the CEP lookup.
 * @property {string} cep - The postal code.
 * @property {string} state - The state abbreviation (e.g., 'SP', 'RJ').
 * @property {string} city - The city name.
 * @property {string} neighborhood - The neighborhood name.
 * @property {string} street - The street name.
 * @property {string} service - The name of the service that provided the address (e.g., 'ViaCEP', 'BrasilAPI').
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
 * @property {string} name - The name of the provider.
 * @property {(cep: string) => string} buildUrl - A function that constructs the API URL for a given CEP.
 * @property {(response: any) => Address} transform - A function that transforms the raw API response into a standardized `Address` object.
 */
export interface Provider {
  name: string;
  timeout?: number; // timeout in milliseconds
  buildUrl: (cep: string) => string;
  transform: (response: any) => Address;
}

/**
 * @typedef {function(url: string, signal?: AbortSignal): Promise<any>}
 * @description A function that fetches data from a given URL and returns a Promise resolving to the response data.
 */
export type Fetcher = (url: string, signal?: AbortSignal) => Promise<any>;

/**
 * @interface CepLookupOptions
 * @description Options for initializing the `CepLookup` class.
 * @property {Provider[]} providers - An array of `Provider` instances to be used for CEP lookup.
 * @property {Fetcher} [fetcher] - The `Fetcher` function to be used for making HTTP requests. Defaults to global `fetch` if not provided.
 */
import { Cache } from "./cache";

export interface CepLookupOptions {
  providers: Provider[];
  fetcher?: Fetcher;
  cache?: Cache;
}

/**
 * @interface BulkCepResult
 * @description Represents the result for a single CEP in a bulk lookup operation.
 * @property {string} cep - The original CEP string.
 * @property {Address | null} data - The address data if the lookup was successful, otherwise null.
 * @property {string} [provider] - The name of the provider that successfully resolved the address.
 * @property {Error} [error] - An error object if the lookup failed for this specific CEP.
 */
export interface BulkCepResult {
  cep: string;
  data: Address | null;
  provider?: string;
  error?: Error;
}

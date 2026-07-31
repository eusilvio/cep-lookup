import { Address, Provider } from "../types";

export interface GatewayProviderOptions {
  /** Base URL of the gateway, without a trailing slash (e.g. "https://api.example.com"). */
  baseUrl: string;
  /**
   * Optional API key. `buildUrl` only produces a URL — it cannot set headers — so this
   * value is not sent automatically. To authenticate, inject it yourself via a custom
   * `fetcher` that adds an `x-api-key` header, e.g.:
   *
   * ```ts
   * const fetcher: Fetcher = (url, signal) =>
   *   fetch(url, { signal, headers: { "x-api-key": apiKey } }).then((r) => r.json());
   * ```
   */
  apiKey?: string;
  /** Provider name exposed in metrics/events. Default: "Gateway". */
  name?: string;
}

/**
 * @function createGatewayProvider
 * @description Factory for a provider that talks to a self-hosted CEP gateway/API,
 * assuming the gateway already returns a normalized `Address` payload
 * (see the API Gateway PRD in `docs/PRD-API-GATEWAY.md`).
 * @param {GatewayProviderOptions} options - Gateway configuration.
 * @returns {Provider} A provider hitting `${baseUrl}/v1/cep/{cep}`.
 */
export function createGatewayProvider(options: GatewayProviderOptions): Provider {
  const { baseUrl, name } = options;
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  return {
    name: name || "Gateway",
    buildUrl: (cep: string) => `${normalizedBaseUrl}/v1/cep/${cep}`,
    transform: (response: any): Address => {
      if (!response || response.error || response.message) {
        throw new Error(response?.message || "CEP not found");
      }
      return {
        cep: (response.cep || "").replace("-", ""),
        state: response.state || "",
        city: response.city || "",
        neighborhood: response.neighborhood || "",
        street: response.street || "",
        service: response.service || name || "Gateway",
        ibge: response.ibge || undefined,
        ddd: response.ddd || undefined,
        complement: response.complement || undefined,
        location: response.location || undefined,
      };
    },
  };
}

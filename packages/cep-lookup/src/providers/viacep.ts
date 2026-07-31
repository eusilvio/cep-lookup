import { Address, Provider } from "../types";

/**
 * @function mapViaCepAddress
 * @description Maps a single ViaCEP payload item into a standardized `Address`.
 */
function mapViaCepAddress(response: any): Address {
  return {
    cep: (response.cep || "").replace("-", ""),
    state: response.uf || "",
    city: response.localidade || "",
    neighborhood: response.bairro || "",
    street: response.logradouro || "",
    service: "ViaCEP",
    ibge: response.ibge || undefined,
    ddd: response.ddd || undefined,
    complement: response.complemento || undefined,
  };
}

/**
 * @const {Provider} viaCepProvider
 * @description Provider for the ViaCEP service.
 * @property {string} name - "ViaCEP".
 * @property {(cep: string) => string} buildUrl - Constructs the URL for ViaCEP API.
 * @property {(response: any) => Address} transform - Transforms ViaCEP's response into a standardized `Address` object.
 * @property {(state: string, city: string, street: string) => string} buildSearchUrl - Constructs the reverse-search URL.
 * @property {(response: any) => Address[]} transformSearch - Transforms the reverse-search response into `Address[]`.
 * @throws {Error} If ViaCEP response indicates an error (e.g., CEP not found).
 */
export const viaCepProvider: Provider = {
  name: "ViaCEP",
  buildUrl: (cep: string) => `https://viacep.com.br/ws/${cep}/json/`,
  transform: (response: any): Address => {
    if (!response || response.erro === true || response.erro === "true") {
      throw new Error("CEP not found");
    }
    return mapViaCepAddress(response);
  },
  buildSearchUrl: (state: string, city: string, street: string) =>
    `https://viacep.com.br/ws/${encodeURIComponent(state)}/${encodeURIComponent(city)}/${encodeURIComponent(street)}/json/`,
  transformSearch: (response: any): Address[] => {
    if (!Array.isArray(response) || response.length === 0) {
      return [];
    }
    return response.map(mapViaCepAddress);
  },
};

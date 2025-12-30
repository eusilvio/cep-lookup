import { Address, Provider } from "../types";

/**
 * @const {Provider} brasilApiProvider
 * @description Provider for the BrasilAPI service.
 * @property {string} name - "BrasilAPI".
 * @property {(cep: string) => string} buildUrl - Constructs the URL for BrasilAPI.
 * @property {(response: any) => Address} transform - Transforms BrasilAPI's response into a standardized `Address` object.
 */
export const brasilApiProvider: Provider = {
  name: "BrasilAPI",
  buildUrl: (cep: string) => `https://brasilapi.com.br/api/cep/v1/${cep}`,
  transform: (response: any): Address => {
    if (!response || response.errors || response.message) {
      throw new Error(response.message || "CEP not found");
    }
    return {
      cep: (response.cep || "").replace("-", ""),
      state: response.state || "",
      city: response.city || "",
      neighborhood: response.neighborhood || "",
      street: response.street || "",
      service: "BrasilAPI",
    };
  },
};
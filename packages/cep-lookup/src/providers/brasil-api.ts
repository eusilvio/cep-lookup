import { Address, Provider } from "../types";

/**
 * @const {Provider} brasilApiProvider
 * @description Provider for the BrasilAPI service (v2 endpoint, which includes geographic coordinates).
 * @property {string} name - "BrasilAPI".
 * @property {(cep: string) => string} buildUrl - Constructs the URL for BrasilAPI v2.
 * @property {(response: any) => Address} transform - Transforms BrasilAPI's response into a standardized `Address` object.
 */
export const brasilApiProvider: Provider = {
  name: "BrasilAPI",
  buildUrl: (cep: string) => `https://brasilapi.com.br/api/cep/v2/${cep}`,
  transform: (response: any): Address => {
    if (!response || response.errors || response.message) {
      throw new Error(response.message || "CEP not found");
    }
    const address: Address = {
      cep: (response.cep || "").replace("-", ""),
      state: response.state || "",
      city: response.city || "",
      neighborhood: response.neighborhood || "",
      street: response.street || "",
      service: "BrasilAPI",
    };

    const coordinates = response.location?.coordinates;
    if (coordinates && coordinates.latitude !== undefined && coordinates.latitude !== null && coordinates.longitude !== undefined && coordinates.longitude !== null) {
      const latitude = Number(coordinates.latitude);
      const longitude = Number(coordinates.longitude);
      if (!Number.isNaN(latitude) && !Number.isNaN(longitude)) {
        address.location = { latitude, longitude };
      }
    }

    return address;
  },
};

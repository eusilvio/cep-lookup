import { Address, Provider } from "../types";

/**
 * @const {Provider} apicepProvider
 * @description Provider for the ApiCEP service.
 * @property {string} name - "ApiCEP".
 * @property {(cep: string) => string} buildUrl - Constructs the URL for ApiCEP.
 * @property {(response: any) => Address} transform - Transforms ApiCEP's response into a standardized `Address` object.
 */
export const apicepProvider: Provider = {
  name: "ApiCEP",
  buildUrl: (cep: string) => `https://cdn.apicep.com/file/apicep/${cep}.json`,
  transform: (response: any): Address => {
    return {
      cep: response.code,
      state: response.state,
      city: response.city,
      neighborhood: response.district,
      street: response.address,
      service: "ApiCEP",
    };
  },
};
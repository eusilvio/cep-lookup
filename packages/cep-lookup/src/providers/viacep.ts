import { Address, Provider } from "../types";

/**
 * @const {Provider} viaCepProvider
 * @description Provider for the ViaCEP service.
 * @property {string} name - "ViaCEP".
 * @property {(cep: string) => string} buildUrl - Constructs the URL for ViaCEP API.
 * @property {(response: any) => Address} transform - Transforms ViaCEP's response into a standardized `Address` object.
 * @throws {Error} If ViaCEP response indicates an error (e.g., CEP not found).
 */
export const viaCepProvider: Provider = {
  name: "ViaCEP",
  buildUrl: (cep: string) => `https://viacep.com.br/ws/${cep}/json/`,
  transform: (response: any): Address => {
    if (response.erro) {
      throw new Error("CEP not found");
    }
    return {
      cep: response.cep,
      state: response.uf,
      city: response.localidade,
      neighborhood: response.bairro,
      street: response.logradouro,
      service: "ViaCEP",
    };
  },
};
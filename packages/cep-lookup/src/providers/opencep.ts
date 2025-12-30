import { Address, Provider } from "../types";

/**
 * @const {Provider} openCepProvider
 * @description Provider for the OpenCEP service.
 * @property {string} name - "OpenCEP".
 * @property {(cep: string) => string} buildUrl - Constructs the URL for OpenCEP API.
 * @property {(response: any) => Address} transform - Transforms OpenCEP's response into a standardized `Address` object.
 * @throws {Error} If OpenCEP response indicates an error.
 */
export const openCepProvider: Provider = {
  name: "OpenCEP",
  buildUrl: (cep: string) => `https://opencep.com/v1/${cep}`,
  transform: (response: any): Address => {
    if (!response || response.error) {
      throw new Error("CEP not found");
    }
    
    // OpenCEP returns status code 404 for not found, which fetcher catches.
    // But sometimes APIs return 200 with error data.
    // Assuming standard JSON return based on description.
    
    return {
      cep: (response.cep || "").replace("-", ""),
      state: response.uf || "",
      city: response.localidade || "",
      neighborhood: response.bairro || "",
      street: response.logradouro || "",
      service: "OpenCEP",
    };
  },
};

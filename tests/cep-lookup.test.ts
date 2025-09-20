
import { CepLookup, lookupCep } from "../src";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "../src/providers";
import { Address } from "../src/types";

describe("cep-lookup", () => {
  describe("CepLookup Class", () => {
    it("should return the address from the fastest provider", async () => {
      const cep = "01001-000";
      const mockFetcher = jest.fn().mockImplementation((url: string) => {
        if (url.includes("viacep")) {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001-000",
                  logradouro: "Praça da Sé",
                  bairro: "Sé",
                  localidade: "São Paulo",
                  uf: "SP",
                }),
              100
            )
          );
        } else {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001000",
                  state: "SP",
                  city: "São Paulo",
                  neighborhood: "Sé",
                  street: "Praça da Sé",
                }),
              200
            )
          );
        }
      });
      const cepLookup = new CepLookup({
        providers: [viaCepProvider, brasilApiProvider],
        fetcher: mockFetcher,
      });

      const address = await cepLookup.lookup(cep);

      expect(address.service).toBe("ViaCEP");
      expect(mockFetcher).toHaveBeenCalledTimes(2); // Both providers are called
    });

    it("should return the address with a custom mapper", async () => {
      const cep = "01001-000";
      const mockFetcher = jest.fn().mockResolvedValue({
        cep: "01001-000",
        logradouro: "Praça da Sé",
        bairro: "Sé",
        localidade: "São Paulo",
        uf: "SP",
      });
      const cepLookup = new CepLookup({
        providers: [viaCepProvider],
        fetcher: mockFetcher,
      });

      interface CustomAddress {
        postalCode: string;
        fullAddress: string;
        source: string;
      }

      const mapper = (address: Address): CustomAddress => {
        return {
          postalCode: address.cep,
          fullAddress: `${address.street}, ${address.neighborhood} - ${address.city}/${address.state}`,
          source: address.service,
        };
      };

      const customAddress = await cepLookup.lookup(cep, mapper);

      expect(customAddress).toEqual({
        postalCode: "01001-000",
        fullAddress: "Praça da Sé, Sé - São Paulo/SP",
        source: "ViaCEP",
      });
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it("should throw an error for an invalid CEP", async () => {
      const cep = "12345-67";
      const cepLookup = new CepLookup({
        providers: [viaCepProvider],
        fetcher: jest.fn(),
      });

      await expect(cepLookup.lookup(cep)).rejects.toThrow(
        "Invalid CEP. It must have 8 digits."
      );
    });

    it("should use the default fetcher if none is provided", async () => {
      const cep = "01001-000";
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cep: "01001-000",
            logradouro: "Praça da Sé",
            bairro: "Sé",
            localidade: "São Paulo",
            uf: "SP",
          }),
      });
      // Mock the global fetch function
      global.fetch = mockFetch;

      const cepLookup = new CepLookup({
        providers: [viaCepProvider],
      });

      const address = await cepLookup.lookup(cep);

      expect(address.service).toBe("ViaCEP");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith("https://viacep.com.br/ws/01001000/json/");
    });
  });

  describe("lookupCep Function (Backward Compatibility)", () => {
    it("should return the address from the fastest provider", async () => {
      const cep = "01001-000";
      const mockFetcher = jest.fn().mockImplementation((url: string) => {
        if (url.includes("viacep")) {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001-000",
                  logradouro: "Praça da Sé",
                  bairro: "Sé",
                  localidade: "São Paulo",
                  uf: "SP",
                }),
              100
            )
          );
        } else {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001000",
                  state: "SP",
                  city: "São Paulo",
                  neighborhood: "Sé",
                  street: "Praça da Sé",
                }),
              200
            )
          );
        }
      });

      const address = await lookupCep({ cep, providers: [viaCepProvider, brasilApiProvider], fetcher: mockFetcher });

      expect(address.service).toBe("ViaCEP");
      expect(mockFetcher).toHaveBeenCalledTimes(2);
    });

    it("should use the default fetcher if none is provided", async () => {
      const cep = "01001-000";
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cep: "01001-000",
            logradouro: "Praça da Sé",
            bairro: "Sé",
            localidade: "São Paulo",
            uf: "SP",
          }),
      });
      global.fetch = mockFetch;

      const address = await lookupCep({ cep, providers: [viaCepProvider] });

      expect(address.service).toBe("ViaCEP");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith("https://viacep.com.br/ws/01001000/json/");
    });
  });
});

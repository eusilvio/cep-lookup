import { CepLookup } from "../src";
import { brasilApiProvider } from "../src/providers/brasil-api";
import { viaCepProvider } from "../src/providers/viacep";
import { CepValidationError } from "../src/errors";

describe("Block 3: BrasilAPI v2 coordinates", () => {
  it("should build the v2 endpoint URL", () => {
    expect(brasilApiProvider.buildUrl("01001000")).toBe("https://brasilapi.com.br/api/cep/v2/01001000");
  });

  it("should map location.coordinates when present", () => {
    const response = {
      cep: "01001-000",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Sé",
      street: "Praça da Sé",
      location: {
        type: "Point",
        coordinates: { longitude: "-46.6333", latitude: "-23.5505" },
      },
    };

    const address = brasilApiProvider.transform(response);
    expect(address.location).toEqual({ latitude: -23.5505, longitude: -46.6333 });
  });

  it("should omit location when the provider does not return coordinates", () => {
    const response = {
      cep: "01001-000",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Sé",
      street: "Praça da Sé",
    };

    const address = brasilApiProvider.transform(response);
    expect(address.location).toBeUndefined();
  });

  it("should surface coordinates end-to-end through CepLookup", async () => {
    const fetcher = jest.fn().mockResolvedValue({
      cep: "01001-000",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Sé",
      street: "Praça da Sé",
      location: { coordinates: { latitude: -23.5505, longitude: -46.6333 } },
    });

    const lookup = new CepLookup({ providers: [brasilApiProvider], fetcher });
    const address = await lookup.lookup("01001000");
    expect(address.location).toEqual({ latitude: -23.5505, longitude: -46.6333 });
  });
});

describe("Block 3: ViaCEP complement field", () => {
  it("should map 'complemento' to 'complement'", () => {
    const address = viaCepProvider.transform({
      cep: "01001-000",
      uf: "SP",
      localidade: "São Paulo",
      bairro: "Sé",
      logradouro: "Praça da Sé",
      complemento: "lado par",
    });
    expect(address.complement).toBe("lado par");
  });

  it("should leave complement undefined when absent", () => {
    const address = viaCepProvider.transform({
      cep: "01001-000",
      uf: "SP",
      localidade: "São Paulo",
      bairro: "Sé",
      logradouro: "Praça da Sé",
    });
    expect(address.complement).toBeUndefined();
  });
});

describe("Block 3: reverse address search (searchByAddress)", () => {
  it("should build the ViaCEP reverse-search URL, URL-encoded", () => {
    const url = viaCepProvider.buildSearchUrl!("SP", "São Paulo", "Praça da Sé");
    expect(url).toBe(
      "https://viacep.com.br/ws/SP/" + encodeURIComponent("São Paulo") + "/" + encodeURIComponent("Praça da Sé") + "/json/"
    );
  });

  it("should return a normalized array of addresses", async () => {
    const fetcher = jest.fn().mockResolvedValue([
      { cep: "01001-000", uf: "SP", localidade: "São Paulo", bairro: "Sé", logradouro: "Praça da Sé" },
      { cep: "01001-001", uf: "SP", localidade: "São Paulo", bairro: "Sé", logradouro: "Praça da Sé, lado par" },
    ]);

    const lookup = new CepLookup({ providers: [viaCepProvider], fetcher });
    const results = await lookup.searchByAddress("sp", "São Paulo", "Praça da Sé");

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
    expect(results[0].cep).toBe("01001000");
    expect(results[0].service).toBe("ViaCEP");
  });

  it("should reject a state that is not exactly 2 letters", async () => {
    const lookup = new CepLookup({ providers: [viaCepProvider] });
    await expect(lookup.searchByAddress("SPX", "São Paulo", "Praça da Sé")).rejects.toBeInstanceOf(CepValidationError);
    await expect(lookup.searchByAddress("S", "São Paulo", "Praça da Sé")).rejects.toBeInstanceOf(CepValidationError);
  });

  it("should reject a city or street shorter than 3 characters", async () => {
    const lookup = new CepLookup({ providers: [viaCepProvider] });
    await expect(lookup.searchByAddress("SP", "SP", "Praça da Sé")).rejects.toThrow();
    await expect(lookup.searchByAddress("SP", "São Paulo", "Sé")).rejects.toThrow();
  });

  it("should throw when no configured provider supports reverse search", async () => {
    const noSearchProvider = {
      name: "NoSearch",
      buildUrl: (cep: string) => `https://example.com/${cep}`,
      transform: (r: any) => r,
    };
    const lookup = new CepLookup({ providers: [noSearchProvider] });
    await expect(lookup.searchByAddress("SP", "São Paulo", "Praça da Sé")).rejects.toThrow(
      "No configured provider supports reverse address search."
    );
  });

  it("should return an empty array when ViaCEP reports an error payload", async () => {
    const fetcher = jest.fn().mockResolvedValue({ erro: true });
    const lookup = new CepLookup({ providers: [viaCepProvider], fetcher });
    const results = await lookup.searchByAddress("SP", "São Paulo", "Xyzxyzxyz");
    expect(results).toEqual([]);
  });
});

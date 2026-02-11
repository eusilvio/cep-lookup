import { CepLookup } from "../src";
import { viaCepProvider } from "../src/providers/viacep";
import { openCepProvider } from "../src/providers/opencep";
import { brasilApiProvider } from "../src/providers/brasil-api";
import { dddByState } from "../src/data/ddd-by-state";

describe("IBGE + DDD Enrichment", () => {
  it("should preserve ibge and ddd from ViaCEP response", async () => {
    const mockFetcher = jest.fn().mockResolvedValue({
      cep: "01001-000",
      logradouro: "Praça da Sé",
      bairro: "Sé",
      localidade: "São Paulo",
      uf: "SP",
      ibge: "3550308",
      ddd: "11",
    });

    const cepLookup = new CepLookup({
      providers: [viaCepProvider],
      fetcher: mockFetcher,
    });

    const address = await cepLookup.lookup("01001000");

    expect(address.ibge).toBe("3550308");
    expect(address.ddd).toBe("11");
    expect(address.service).toBe("ViaCEP");
  });

  it("should preserve ibge from OpenCEP and fill ddd from fallback", async () => {
    const mockFetcher = jest.fn().mockResolvedValue({
      cep: "01001-000",
      logradouro: "Praça da Sé",
      bairro: "Sé",
      localidade: "São Paulo",
      uf: "SP",
      ibge: "3550308",
    });

    const cepLookup = new CepLookup({
      providers: [openCepProvider],
      fetcher: mockFetcher,
    });

    const address = await cepLookup.lookup("01001000");

    expect(address.ibge).toBe("3550308");
    expect(address.ddd).toBe("11"); // fallback from state SP
    expect(address.service).toBe("OpenCEP");
  });

  it("should fill ddd from fallback when provider returns no ibge/ddd", async () => {
    const mockFetcher = jest.fn().mockResolvedValue({
      cep: "01001000",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Sé",
      street: "Praça da Sé",
    });

    const cepLookup = new CepLookup({
      providers: [brasilApiProvider],
      fetcher: mockFetcher,
    });

    const address = await cepLookup.lookup("01001000");

    expect(address.ibge).toBeUndefined();
    expect(address.ddd).toBe("11"); // fallback from state SP
    expect(address.service).toBe("BrasilAPI");
  });

  it("should not override ddd when provider already returns it", async () => {
    const mockFetcher = jest.fn().mockResolvedValue({
      cep: "19800-000",
      logradouro: "",
      bairro: "",
      localidade: "Assis",
      uf: "SP",
      ibge: "3504008",
      ddd: "18", // Assis uses DDD 18, not 11
    });

    const cepLookup = new CepLookup({
      providers: [viaCepProvider],
      fetcher: mockFetcher,
    });

    const address = await cepLookup.lookup("19800000");

    expect(address.ddd).toBe("18"); // should keep provider value, not overwrite with fallback 11
    expect(address.ibge).toBe("3504008");
  });

  it("dddByState fallback should cover all 27 Brazilian states", () => {
    const states = [
      "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
      "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
      "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
    ];

    expect(Object.keys(dddByState)).toHaveLength(27);

    for (const state of states) {
      expect(dddByState[state]).toBeDefined();
      expect(dddByState[state]).toMatch(/^\d{2}$/);
    }
  });
});

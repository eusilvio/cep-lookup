import { CepLookup } from "../src";
import { viaCepProvider } from "../src/providers";
import { verifyAddress } from "../src/verify";
import type { AddressResolver } from "../src/verify";
import { Address } from "../src/types";

interface ViaCepEntry {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
}

const via = (
  cep: string,
  logradouro: string,
  complemento = "",
  bairro = "Bela Vista",
  localidade = "São Paulo",
  uf = "SP"
): ViaCepEntry => ({ cep, logradouro, complemento, bairro, localidade, uf });

// Real ViaCEP entries: street ranges, a single-building CEP and look-alike streets.
const PAULISTA = [
  via("01310-100", "Avenida Paulista", "de 612 a 1510 - lado par"),
  via("01310-200", "Avenida Paulista", "de 1512 a 2132 - lado par"),
  via("01310-300", "Avenida Paulista", "de 2134 ao fim - lado par"),
  via("01311-000", "Avenida Paulista", "até 609 - lado ímpar"),
  via("01311-200", "Avenida Paulista", "de 1047 a 1865 - lado ímpar"),
  via("01310-928", "Avenida Paulista", "2064"),
  via("08190-461", "Viela Paulista", "", "Vila Itaim"),
  via("05440-001", "Rua Paulistânia", "de 453/454 ao fim", "Sumarezinho"),
];

const XV_DE_NOVEMBRO = [
  via("80020-310", "Rua XV de Novembro", "até 894/0895", "Centro", "Curitiba", "PR"),
  via("80060-000", "Rua XV de Novembro", "de 0896/897 a 1598/1599", "Centro", "Curitiba", "PR"),
  via("80045-125", "Rua XV de Novembro", "de 1600/1601 a 2230/2231", "Alto da Rua XV", "Curitiba", "PR"),
  via("80020-924", "Rua XV de Novembro", "620", "Centro", "Curitiba", "PR"),
];

// Homonymous streets in São Paulo, one CEP each.
const SAO_MARCOS = [
  via("04849-314", "Rua São Marcos", "", "Chácara Gaivotas"),
  via("04183-110", "Rua São Marcos", "", "Jardim Santa Emília"),
  via("05455-050", "Praça São Marcos", "", "Vila Ida"),
];

const MARCOS_LOPES = via("04513-080", "Rua Marcos Lopes", "", "Vila Nova Conceição");

const toAddress = (entry: ViaCepEntry): Address => viaCepProvider.transform(entry);

/** A real engine over a fake ViaCEP: lookups by CEP, reverse searches by street segment. */
function createEngine(searches: Record<string, ViaCepEntry[]> = {}) {
  const byCep = new Map(
    [...PAULISTA, ...XV_DE_NOVEMBRO, ...SAO_MARCOS, MARCOS_LOPES].map((entry) => [entry.cep.replace("-", ""), entry])
  );
  const fetcher = jest.fn(async (url: string, _signal?: AbortSignal) => {
    const lookup = /\/ws\/(\d{8})\/json\/$/.exec(url);
    if (lookup) return byCep.get(lookup[1]) ?? { erro: "true" };
    const search = /\/ws\/[A-Z]{2}\/[^/]+\/([^/]+)\/json\/$/.exec(url);
    if (search) return searches[decodeURIComponent(search[1])] ?? [];
    throw new Error(`Unexpected URL ${url}`);
  });
  const engine = new CepLookup({ providers: [viaCepProvider], fetcher });
  const searchUrls = () => fetcher.mock.calls.map(([url]) => url).filter((url) => !/\/ws\/\d{8}\//.test(url));
  return { engine, fetcher, searchUrls };
}

const paulista1578 = { cep: "01310-100", street: "Av. Paulista", number: "1578", city: "Sao Paulo", state: "SP" };

describe("verifyAddress: verification", () => {
  it("confirms a matching address with a single lookup", async () => {
    const { engine, fetcher } = createEngine();
    const result = await verifyAddress(engine, { ...paulista1578, number: 1000, city: "São Paulo" });

    expect(result.status).toBe("confirmed");
    expect(result.cep).toBe("01310100");
    expect(result.suggestion).toMatchObject({ cep: "01310100", street: "Avenida Paulista" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports a malformed CEP without looking it up", async () => {
    const { engine, fetcher } = createEngine();
    const result = await verifyAddress(engine, { cep: "0131O-100" });

    expect(result).toEqual({ status: "invalid", score: 0, cep: "0131100", fields: {} });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports a CEP that does not exist", async () => {
    const { engine } = createEngine();
    const result = await verifyAddress(engine, { cep: "01310-999", street: "Avenida Paulista" });

    expect(result).toMatchObject({ status: "not_found", score: 0, cep: "01310999", fields: {} });
    expect(result.reference).toBeUndefined();
  });

  it("does not fetch ranges when the provider that answered already returns complements", async () => {
    const { engine, searchUrls } = createEngine({ paulista: PAULISTA });
    await verifyAddress(engine, { cep: "01310-100", number: "1000" });
    expect(searchUrls()).toEqual([]);
  });

  it("fetches the numbering range when the provider that answered has no complements", async () => {
    const brasilApiAnswer: Address = {
      cep: "01310100",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Bela Vista",
      street: "Avenida Paulista",
      service: "BrasilAPI",
    };
    const searchByAddress = jest.fn().mockResolvedValue(PAULISTA.map(toAddress));
    const resolver: AddressResolver = { lookup: jest.fn().mockResolvedValue(brasilApiAnswer), searchByAddress };

    const result = await verifyAddress(resolver, paulista1578);

    expect(result.reference?.complement).toBe("de 612 a 1510 - lado par");
    expect(result.fields.number?.match).toBe("mismatch");
    expect(result.suggestion?.cep).toBe("01310200");
    expect(searchByAddress).toHaveBeenNthCalledWith(1, "SP", "São Paulo", "paulista", { signal: expect.any(AbortSignal) });
    expect(searchByAddress).toHaveBeenNthCalledWith(2, "SP", "Sao Paulo", "paulista", { signal: expect.any(AbortSignal) });
  });

  it("degrades to unverifiable through the engine's offline fallback", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const engine = new CepLookup({ providers: [viaCepProvider], fetcher, offlineFallback: true });

    const matching = await verifyAddress(engine, { cep: "01310-100", state: "SP", street: "Avenida Paulista" });
    expect(matching.status).toBe("unverifiable");
    expect(matching.reference).toMatchObject({ service: "offline", partial: true });

    const wrongState = await verifyAddress(engine, { cep: "01310-100", state: "RJ", street: "Avenida Atlântica", city: "Rio de Janeiro" });
    expect(wrongState.status).toBe("conflict");
    expect(wrongState.suggestion).toBeUndefined();
  });

  it("rejects on infrastructure failures it cannot degrade from", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const engine = new CepLookup({ providers: [viaCepProvider], fetcher });

    await expect(verifyAddress(engine, paulista1578)).rejects.toThrow("network down");
  });
});

describe("verifyAddress: correction search", () => {
  it("finds the CEP that serves the typed number", async () => {
    const { engine, searchUrls } = createEngine({ paulista: PAULISTA });
    const result = await verifyAddress(engine, paulista1578);

    expect(result.status).toBe("conflict");
    expect(result.fields.number).toMatchObject({ match: "mismatch", expected: "de 612 a 1510 - lado par" });
    expect(result.reference?.cep).toBe("01310100");
    expect(result.suggestion).toMatchObject({
      cep: "01310200",
      street: "Avenida Paulista",
      complement: "de 1512 a 2132 - lado par",
    });
    expect(result.candidates).toBeUndefined();
    expect(searchUrls()).toEqual(["https://viacep.com.br/ws/SP/Sao%20Paulo/paulista/json/"]);
  });

  it("prefers a street range over a single building's own CEP", async () => {
    const { engine } = createEngine({ paulista: PAULISTA });
    const result = await verifyAddress(engine, { ...paulista1578, number: "2064" });

    expect(result.suggestion?.cep).toBe("01310200");
  });

  it("falls back to the most distinctive word when the full phrase finds nothing", async () => {
    const { engine, searchUrls } = createEngine({ novembro: XV_DE_NOVEMBRO });
    const result = await verifyAddress(engine, {
      cep: "80020-310",
      street: "Rua 15 de Novembro",
      number: "1000",
      city: "Curitiba",
      state: "PR",
    });

    expect(result.status).toBe("conflict");
    expect(result.suggestion).toMatchObject({ cep: "80060000", street: "Rua XV de Novembro" });
    expect(searchUrls()).toEqual([
      "https://viacep.com.br/ws/PR/Curitiba/15%20de%20novembro/json/",
      "https://viacep.com.br/ws/PR/Curitiba/novembro/json/",
    ]);
  });

  it("suggests the right CEP for one that does not exist", async () => {
    const { engine } = createEngine({ paulista: PAULISTA });
    const result = await verifyAddress(engine, { ...paulista1578, cep: "01310-999", number: 1000 });

    expect(result.status).toBe("not_found");
    expect(result.suggestion?.cep).toBe("01310100");
  });

  it("suggests the right CEP for a malformed one, with a single request", async () => {
    const { engine, fetcher } = createEngine({ paulista: PAULISTA });
    const result = await verifyAddress(engine, { ...paulista1578, cep: "0131O-100", number: 1000 });

    expect(result.status).toBe("invalid");
    expect(result.suggestion?.cep).toBe("01310100");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("takes the state from the CEP allocation map when the input has none", async () => {
    const { engine, searchUrls } = createEngine({ paulista: PAULISTA });
    await verifyAddress(engine, { cep: "01310-999", street: "Avenida Paulista", number: 1000, city: "São Paulo" });

    expect(searchUrls()).toEqual(["https://viacep.com.br/ws/SP/S%C3%A3o%20Paulo/paulista/json/"]);
  });

  it("lists candidates instead of guessing between equally good CEPs", async () => {
    const { engine } = createEngine({ "sao marcos": SAO_MARCOS });
    const input = { cep: "04513-080", street: "Rua São Marcos", city: "São Paulo", state: "SP" };

    const ambiguous = await verifyAddress(engine, input);
    expect(ambiguous.status).toBe("conflict");
    expect(ambiguous.suggestion).toBeUndefined();
    expect(ambiguous.candidates?.map((address) => address.cep)).toEqual(["04849314", "04183110", "05455050"]);

    const disambiguated = await verifyAddress(engine, { ...input, neighborhood: "Jardim Santa Emília" });
    expect(disambiguated.suggestion?.cep).toBe("04183110");
    expect(disambiguated.candidates).toBeUndefined();
  });

  it("never searches with reverseSearch turned off", async () => {
    const { engine, searchUrls } = createEngine({ paulista: PAULISTA });
    const result = await verifyAddress(engine, paulista1578, { reverseSearch: false });

    expect(result.status).toBe("conflict");
    expect(result.suggestion).toBeUndefined();
    expect(searchUrls()).toEqual([]);
  });

  it("works with a resolver that cannot search", async () => {
    const resolver: AddressResolver = { lookup: jest.fn().mockResolvedValue(toAddress(PAULISTA[0])) };
    const result = await verifyAddress(resolver, paulista1578);

    expect(result.status).toBe("conflict");
    expect(result.suggestion).toBeUndefined();
  });

  it("keeps the verification when the search fails", async () => {
    const resolver: AddressResolver = {
      lookup: jest.fn().mockResolvedValue(toAddress(PAULISTA[0])),
      searchByAddress: jest.fn().mockRejectedValue(new Error("HTTP error! status: 500")),
    };
    const result = await verifyAddress(resolver, paulista1578);

    expect(result.status).toBe("conflict");
    expect(result.suggestion).toBeUndefined();
  });

  it("gives up on a search that outlives searchTimeout", async () => {
    const resolver: AddressResolver = {
      lookup: jest.fn().mockResolvedValue(toAddress(PAULISTA[0])),
      searchByAddress: jest.fn(() => new Promise<Address[]>(() => {})),
    };
    const started = Date.now();
    const result = await verifyAddress(resolver, paulista1578, { searchTimeout: 20 });

    expect(result.status).toBe("conflict");
    expect(result.suggestion).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("verifyAddress: cancellation", () => {
  it("rejects before any request when the signal is already aborted", async () => {
    const { engine, fetcher } = createEngine();
    const controller = new AbortController();
    controller.abort();

    await expect(verifyAddress(engine, paulista1578, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects when aborted during a search, even if the resolver ignores the signal", async () => {
    const controller = new AbortController();
    const resolver: AddressResolver = {
      lookup: jest.fn().mockResolvedValue(toAddress(PAULISTA[0])),
      searchByAddress: jest.fn(() => {
        setTimeout(() => controller.abort(), 5);
        return new Promise<Address[]>(() => {});
      }),
    };

    await expect(verifyAddress(resolver, paulista1578, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

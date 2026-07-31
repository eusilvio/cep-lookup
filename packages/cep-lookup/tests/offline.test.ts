import {
  resolveCepOffline,
  stateFromCep,
  isCepAllocated,
  cepMatchesState,
  toPartialAddress,
  cepRanges,
  stateInfoByUf,
} from "../src/offline";
import { dddByState } from "../src/data/ddd-by-state";
import { CepValidationError } from "../src/errors";

describe("Offline: dataset integrity", () => {
  it("covers all 27 federative units, each with metadata and a DDD", () => {
    const ufsInRanges = new Set(cepRanges.map(([, , uf]) => uf));
    expect(ufsInRanges.size).toBe(27);
    expect(Object.keys(stateInfoByUf).sort()).toEqual([...ufsInRanges].sort());
    for (const uf of ufsInRanges) {
      expect(stateInfoByUf[uf].name).toBeTruthy();
      expect(stateInfoByUf[uf].region).toBeTruthy();
      expect(stateInfoByUf[uf].capital).toBeTruthy();
      expect(stateInfoByUf[uf].ibge).toMatch(/^\d{2}$/);
      expect(dddByState[uf]).toMatch(/^\d{2}$/);
    }
  });

  it("has sorted, non-overlapping ranges (binary-search precondition)", () => {
    for (let i = 0; i < cepRanges.length; i++) {
      const [start, end] = cepRanges[i];
      expect(start).toBeLessThanOrEqual(end);
      if (i > 0) {
        expect(start).toBeGreaterThan(cepRanges[i - 1][1]);
      }
    }
  });

  it("resolves every range's start, end and midpoint to its own UF", () => {
    for (const [start, end, uf] of cepRanges) {
      const pad = (n: number) => String(n).padStart(8, "0");
      expect(stateFromCep(pad(start))).toBe(uf);
      expect(stateFromCep(pad(end))).toBe(uf);
      expect(stateFromCep(pad(Math.floor((start + end) / 2)))).toBe(uf);
    }
  });
});

describe("Offline: stateFromCep on real-world CEPs", () => {
  const cases: Array<[string, string]> = [
    ["01310-100", "SP"], // Av. Paulista, São Paulo
    ["20040-002", "RJ"], // Centro, Rio de Janeiro
    ["29010-000", "ES"], // Vitória
    ["30130-010", "MG"], // Belo Horizonte
    ["40020-000", "BA"], // Salvador
    ["49010-000", "SE"], // Aracaju
    ["51020-000", "PE"], // Recife
    ["57020-000", "AL"], // Maceió
    ["58010-000", "PB"], // João Pessoa
    ["59010-000", "RN"], // Natal
    ["60060-000", "CE"], // Fortaleza
    ["64000-000", "PI"], // Teresina
    ["65010-000", "MA"], // São Luís
    ["66010-000", "PA"], // Belém
    ["68900-000", "AP"], // Macapá
    ["69005-000", "AM"], // Manaus
    ["69301-000", "RR"], // Boa Vista
    ["69900-000", "AC"], // Rio Branco
    ["70040-010", "DF"], // Brasília
    ["73300-000", "DF"], // Planaltina (DF block inside GO surroundings)
    ["72800-000", "GO"], // Águas Lindas de Goiás (GO block inside DF range)
    ["74000-000", "GO"], // Goiânia
    ["76801-000", "RO"], // Porto Velho
    ["78905-000", "RO"], // Porto Velho (legacy block)
    ["77001-000", "TO"], // Palmas
    ["78005-000", "MT"], // Cuiabá
    ["79002-000", "MS"], // Campo Grande
    ["80010-000", "PR"], // Curitiba
    ["88010-000", "SC"], // Florianópolis
    ["90010-000", "RS"], // Porto Alegre
  ];

  it.each(cases)("%s belongs to %s", (cep, uf) => {
    expect(stateFromCep(cep)).toBe(uf);
  });
});

describe("Offline: interleaved range boundaries", () => {
  const boundaries: Array<[string, string | null]> = [
    ["00999999", null], // below the first allocated range
    ["01000000", "SP"],
    ["19999999", "SP"],
    ["20000000", "RJ"],
    ["68899999", "PA"],
    ["68900000", "AP"],
    ["69299999", "AM"],
    ["69300000", "RR"],
    ["69399999", "RR"],
    ["69400000", "AM"], // AM resumes after RR
    ["69899999", "AM"],
    ["69900000", "AC"],
    ["69999999", "AC"],
    ["70000000", "DF"],
    ["72799999", "DF"],
    ["72800000", "GO"], // GO carved into the DF neighborhood
    ["72999999", "GO"],
    ["73000000", "DF"], // DF resumes
    ["73699999", "DF"],
    ["73700000", "GO"],
    ["76799999", "GO"],
    ["76800000", "RO"],
    ["76999999", "RO"],
    ["77000000", "TO"],
    ["78899999", "MT"],
    ["78900000", "RO"], // legacy RO block
    ["78999999", "RO"],
    ["79000000", "MS"],
    ["99999999", "RS"],
  ];

  it.each(boundaries)("%s resolves to %s", (cep, expected) => {
    expect(stateFromCep(cep)).toBe(expected);
  });
});

describe("Offline: resolveCepOffline", () => {
  it("returns full state-level info for an allocated CEP", () => {
    expect(resolveCepOffline("01310-100")).toEqual({
      cep: "01310100",
      state: "SP",
      stateName: "São Paulo",
      region: "Sudeste",
      capital: "São Paulo",
      ddd: "11",
      ibgeState: "35",
    });
  });

  it("returns null for a well-formed but unallocated CEP", () => {
    expect(resolveCepOffline("00500-000")).toBeNull();
  });

  it.each(["abc", "1234567", "123456789", "01310_100", ""])(
    "throws CepValidationError for malformed input %p",
    (bad) => {
      expect(() => resolveCepOffline(bad)).toThrow(CepValidationError);
    }
  );
});

describe("Offline: isCepAllocated / cepMatchesState", () => {
  it("flags allocated and unallocated CEPs", () => {
    expect(isCepAllocated("01310100")).toBe(true);
    expect(isCepAllocated("00500000")).toBe(false);
  });

  it("matches CEP against UF, case- and whitespace-insensitive", () => {
    expect(cepMatchesState("01310-100", "SP")).toBe(true);
    expect(cepMatchesState("01310-100", "sp")).toBe(true);
    expect(cepMatchesState("01310-100", " sp ")).toBe(true);
    expect(cepMatchesState("01310-100", "RJ")).toBe(false);
    expect(cepMatchesState("00500-000", "SP")).toBe(false); // unallocated
    expect(cepMatchesState("01310-100", "XX")).toBe(false); // unknown UF
  });

  it("throws CepValidationError for malformed CEP input", () => {
    expect(() => cepMatchesState("13", "SP")).toThrow(CepValidationError);
    expect(() => isCepAllocated("13")).toThrow(CepValidationError);
  });
});

describe("Offline: toPartialAddress", () => {
  it("shapes offline info into a partial Address", () => {
    const info = resolveCepOffline("90010-000")!;
    expect(toPartialAddress(info)).toEqual({
      cep: "90010000",
      state: "RS",
      city: "",
      neighborhood: "",
      street: "",
      service: "offline",
      ddd: "51",
      partial: true,
    });
  });
});

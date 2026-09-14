import { compareAddress } from "../src/verify";
import { resolveCepOffline, toPartialAddress } from "../src/offline";
import { Address } from "../src/types";

// Real ViaCEP data for 01310-100.
const paulista: Address = {
  cep: "01310100",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Bela Vista",
  street: "Avenida Paulista",
  complement: "de 612 a 1510 - lado par",
  service: "ViaCEP",
  ibge: "3550308",
  ddd: "11",
};

const withStreet = (street: string): Address => ({ ...paulista, street, complement: undefined });

describe("compareAddress: confirmed", () => {
  it("confirms an address typed exactly like the CEP's data", () => {
    const result = compareAddress(
      { state: "SP", city: "São Paulo", neighborhood: "Bela Vista", street: "Avenida Paulista", number: 1000 },
      paulista
    );

    expect(result.status).toBe("confirmed");
    expect(result.score).toBe(1);
    expect(result.cep).toBe("01310100");
    expect(result.reference).toBe(paulista);
    expect(result.suggestion).toEqual(paulista);
    expect(result.fields).toEqual({
      state: { match: "exact", input: "SP", expected: "SP", similarity: 1 },
      city: { match: "exact", input: "São Paulo", expected: "São Paulo", similarity: 1 },
      neighborhood: { match: "exact", input: "Bela Vista", expected: "Bela Vista", similarity: 1 },
      street: { match: "exact", input: "Avenida Paulista", expected: "Avenida Paulista", similarity: 1 },
      number: { match: "exact", input: "1000", expected: "de 612 a 1510 - lado par", similarity: 1 },
    });
  });

  it("treats accents, abbreviations, casing and state names as equivalent", () => {
    const result = compareAddress(
      { state: "sao paulo", city: "SAO PAULO", neighborhood: "bela vista", street: "Av. Paulista", number: "1000" },
      paulista
    );

    expect(result.status).toBe("confirmed");
    expect(result.fields.state?.match).toBe("equivalent");
    expect(result.fields.city?.match).toBe("equivalent");
    expect(result.fields.neighborhood?.match).toBe("exact");
    expect(result.fields.street?.match).toBe("equivalent");
  });

  it("accepts a street typed without its type or title", () => {
    expect(compareAddress({ street: "Paulista" }, paulista).fields.street?.match).toBe("equivalent");
    expect(compareAddress({ street: "Faria Lima" }, withStreet("Avenida Brigadeiro Faria Lima")).fields.street?.match).toBe("equivalent");
    expect(compareAddress({ street: "Rua Arnaldo" }, withStreet("Rua Doutor Arnaldo")).fields.street?.match).toBe("equivalent");
  });

  it("does not mistake a name that starts like a street type for a type", () => {
    expect(compareAddress({ street: "Campo Grande" }, withStreet("Rua Campo Grande")).fields.street?.match).toBe("equivalent");
  });

  it("matches numbered streets however the number is written", () => {
    expect(compareAddress({ street: "Rua 15 de Novembro" }, withStreet("Rua XV de Novembro")).fields.street?.match).toBe("equivalent");
    expect(compareAddress({ street: "R. Vinte e Cinco de Março" }, withStreet("Rua 25 de Março")).fields.street?.match).toBe("equivalent");
  });

  it("ignores empty and punctuation-only fields", () => {
    const result = compareAddress({ street: "  ", city: "-", number: "" }, paulista);
    expect(result.fields).toEqual({});
    expect(result.status).toBe("confirmed");
    expect(result.score).toBe(1);
  });
});

describe("compareAddress: plausible", () => {
  it("flags a typo as similar and suggests the CEP's spelling", () => {
    const result = compareAddress({ street: "Av Paulsita" }, paulista);

    expect(result.status).toBe("plausible");
    expect(result.fields.street?.match).toBe("similar");
    expect(result.fields.street?.similarity).toBeGreaterThanOrEqual(0.8);
    expect(result.fields.street?.similarity).toBeLessThan(1);
    expect(result.suggestion?.street).toBe("Avenida Paulista");
  });

  it("treats the same name under another street type as similar, never equivalent", () => {
    const street = compareAddress({ street: "Rua Paulista" }, paulista).fields.street;
    expect(street).toEqual({ match: "similar", input: "Rua Paulista", expected: "Avenida Paulista", similarity: 0.9 });
  });

  it("keeps the neighborhood soft by default and strict on demand", () => {
    expect(compareAddress({ neighborhood: "Jardins" }, paulista).status).toBe("plausible");
    expect(compareAddress({ neighborhood: "Jardins" }, paulista, { strictFields: ["neighborhood"] }).status).toBe("conflict");
  });

  it("honors a custom similarity threshold", () => {
    expect(compareAddress({ street: "Av Paulsita" }, paulista, { threshold: 0.95 }).status).toBe("conflict");
    expect(compareAddress({ street: "Av Paulsita" }, paulista, { threshold: 2 }).status).toBe("plausible");
  });
});

describe("compareAddress: conflict", () => {
  it("reports another street as a conflict, keeping the reference but no suggestion", () => {
    const result = compareAddress({ street: "Rua Augusta", city: "São Paulo" }, paulista);

    expect(result.status).toBe("conflict");
    expect(result.fields.street?.match).toBe("mismatch");
    expect(result.reference).toBe(paulista);
    expect(result.suggestion).toBeUndefined();
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  it("never confuses numbered streets", () => {
    expect(compareAddress({ street: "Rua 7 de Setembro" }, withStreet("Rua 17 de Setembro")).fields.street?.match).toBe("mismatch");
  });

  it("checks the house number against the numbering range", () => {
    const outside = compareAddress({ street: "Avenida Paulista", number: 1578 }, paulista);
    expect(outside.status).toBe("conflict");
    expect(outside.fields.number).toEqual({
      match: "mismatch",
      input: "1578",
      expected: "de 612 a 1510 - lado par",
      similarity: 0,
    });
    expect(outside.score).toBe(0.7);

    expect(compareAddress({ number: "1001" }, paulista).fields.number?.match).toBe("mismatch");
  });

  it("never lets a state name pass for a neighboring state", () => {
    const campoGrande: Address = { ...paulista, state: "MS", city: "Campo Grande" };
    expect(compareAddress({ state: "Mato Grosso" }, campoGrande).status).toBe("conflict");
    expect(compareAddress({ state: "MT" }, campoGrande).fields.state?.match).toBe("mismatch");
    expect(compareAddress({ state: "ms" }, campoGrande).fields.state?.match).toBe("exact");
    expect(compareAddress({ state: "Estado de Mato Grosso do Sul" }, campoGrande).fields.state?.match).toBe("equivalent");
    expect(compareAddress({ state: "Mato Groso do Sul" }, campoGrande).fields.state?.match).toBe("similar");
  });
});

describe("compareAddress: oversized input", () => {
  it("caps every field, so a hostile payload cannot burn CPU", () => {
    const huge = "a".repeat(1_000_000);
    const started = Date.now();
    const result = compareAddress({ state: huge, city: huge, neighborhood: huge, street: huge, number: huge }, paulista);

    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.status).toBe("conflict");
    expect(result.fields.street?.input).toHaveLength(200);
    expect(result.fields.number?.match).toBe("unverifiable");
  });

  it("caps a huge reference as well", () => {
    const spaces = " ".repeat(1_000_000);
    const started = Date.now();
    compareAddress({ street: "Avenida Paulista" }, { ...paulista, street: `Avenida${spaces}Paulista${spaces}x` });

    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe("compareAddress: unverifiable data", () => {
  it("leaves the number unverified when the CEP has no range or the input has no number", () => {
    expect(compareAddress({ number: "S/N" }, paulista).fields.number?.match).toBe("unverifiable");
    expect(compareAddress({ number: "700" }, withStreet("Avenida Paulista")).fields.number).toEqual({
      match: "unverifiable",
      input: "700",
      expected: "",
      similarity: 0,
    });
  });

  it("reads a range appended to the street and keeps the clean street in the suggestion", () => {
    const apicep: Address = { ...paulista, street: "Avenida Paulista - de 612 a 1510 - lado par", complement: undefined, service: "ApiCEP" };
    const result = compareAddress({ street: "Avenida Paulista", number: 700 }, apicep);

    expect(result.status).toBe("confirmed");
    expect(result.fields.street?.match).toBe("exact");
    expect(result.fields.number?.match).toBe("exact");
    expect(result.suggestion?.street).toBe("Avenida Paulista");
    expect(result.suggestion?.complement).toBe("de 612 a 1510 - lado par");
  });

  it("also splits a range appended with an en dash", () => {
    const enDash = String.fromCharCode(0x2013);
    const reference: Address = {
      ...paulista,
      street: `Avenida Paulista ${enDash} de 612 a 1510 ${enDash} lado par`,
      complement: undefined,
    };
    const result = compareAddress({ street: "Avenida Paulista", number: "1001" }, reference);

    expect(result.fields.street?.match).toBe("exact");
    expect(result.fields.number).toMatchObject({ match: "mismatch", expected: `de 612 a 1510 ${enDash} lado par` });
  });

  it("only splits the street on a dash between spaces", () => {
    const reference: Address = { ...paulista, street: "Rua 1 de 100 a 200", complement: undefined };
    const result = compareAddress({ street: "Rua 1 de 100 a 200", number: "150" }, reference);

    expect(result.fields.street?.match).toBe("exact");
    expect(result.fields.number?.match).toBe("unverifiable");
  });

  it("fills gaps from the input when the CEP covers a whole town", () => {
    const town: Address = { cep: "13295000", state: "SP", city: "Itupeva", neighborhood: "", street: "", service: "ViaCEP" };
    const result = compareAddress({ city: "Itupeva", neighborhood: "Centro", street: " Rua das  Flores ", number: "10" }, town);

    expect(result.status).toBe("confirmed");
    expect(result.fields.street?.match).toBe("unverifiable");
    expect(result.fields.neighborhood?.match).toBe("unverifiable");
    expect(result.fields.number?.match).toBe("unverifiable");
    expect(result.score).toBe(1);
    expect(result.suggestion).toMatchObject({ city: "Itupeva", neighborhood: "Centro", street: "Rua das Flores" });
  });

  it("is unverifiable against an offline, state-level address", () => {
    const offline = toPartialAddress(resolveCepOffline("01310-100")!);

    const matching = compareAddress({ state: "SP", city: "São Paulo", street: "Av. Paulista" }, offline);
    expect(matching.status).toBe("unverifiable");
    expect(matching.fields.city?.match).toBe("unverifiable");
    expect(matching.suggestion).toMatchObject({ state: "SP", city: "São Paulo", street: "Av. Paulista", partial: true });

    expect(compareAddress({ state: "RJ" }, offline).status).toBe("conflict");
    expect(compareAddress({}, offline)).toMatchObject({ status: "unverifiable", score: 0 });
  });
});

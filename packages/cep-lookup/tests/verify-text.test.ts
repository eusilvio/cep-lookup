import {
  foldText,
  normalizeAddressText,
  streetSearchKeyword,
  streetSearchPhrase,
  tokenizeAddressText,
} from "../src/verify/text";

describe("verify: address text normalization", () => {
  it.each([
    ["Av. Brig. Faria Lima", "avenida brigadeiro faria lima"],
    ["AVENIDA BRIGADEIRO FARIA LIMA", "avenida brigadeiro faria lima"],
    ["Pça. da Sé", "praca se"],
    ["R. Dr. Arnaldo", "rua doutor arnaldo"],
    ["Al. Santos", "alameda santos"],
    ["Tv. Cel. Bento", "travessa coronel bento"],
    ["Est. do Campo Limpo", "estrada campo limpo"],
    ["Av. N. Sra. de Copacabana", "avenida nossa senhora copacabana"],
    ["Avenida Nossa Senhora de Copacabana", "avenida nossa senhora copacabana"],
    ["Jd. Paulistano", "jardim paulistano"],
    ["Vl. Mariana", "vila mariana"],
    ["Sta. Cecília", "santa cecilia"],
  ])("expands abbreviations and folds accents: %s", (input, expected) => {
    expect(normalizeAddressText(input)).toBe(expected);
  });

  it.each([
    ["Rua XV de Novembro", "rua 15 novembro"],
    ["Rua Quinze de Novembro", "rua 15 novembro"],
    ["Rua 15 de Novembro", "rua 15 novembro"],
    ["Rua Vinte e Cinco de Março", "rua 25 marco"],
    ["Rua 25 de Março", "rua 25 marco"],
    ["Avenida Sete de Setembro", "avenida 7 setembro"],
    ["Rua 07 de Setembro", "rua 7 setembro"],
    ["Rua 1º de Maio", "rua 1 maio"],
    ["Rua Primeiro de Maio", "rua 1 maio"],
    ["Praça Pio XII", "praca pio 12"],
  ])("writes numbers as digits: %s", (input, expected) => {
    expect(normalizeAddressText(input)).toBe(expected);
  });

  it("keeps single letters as letters, as in loteamento streets", () => {
    expect(normalizeAddressText("Rua A")).toBe("rua a");
    expect(normalizeAddressText("Rua V")).toBe("rua v");
    expect(normalizeAddressText("Rua X")).toBe("rua x");
  });

  it("joins apostrophes and drops parenthesized notes and punctuation", () => {
    expect(normalizeAddressText("Rua Sant'Ana")).toBe("rua santana");
    expect(normalizeAddressText("Olhos D’Água")).toBe("olhos dagua");
    expect(normalizeAddressText("Jardim Imperador (Zona Leste)")).toBe("jardim imperador");
    expect(normalizeAddressText("  Rua   Augusta,  ")).toBe("rua augusta");
  });

  it("does not trip over words named like Object.prototype keys", () => {
    expect(normalizeAddressText("Rua Constructor")).toBe("rua constructor");
    expect(normalizeAddressText("Rua toString")).toBe("rua tostring");
  });

  it("returns nothing for empty or punctuation-only input", () => {
    expect(normalizeAddressText("")).toBe("");
    expect(tokenizeAddressText(" - ")).toEqual([]);
    expect(foldText("São João")).toBe("sao joao");
  });
});

describe("verify: reverse search phrases", () => {
  it("expands abbreviations and drops the street type, keeping words as typed", () => {
    expect(streetSearchPhrase("Av. Brig. Faria Lima")).toBe("brigadeiro faria lima");
    expect(streetSearchPhrase("R. XV de Novembro")).toBe("xv de novembro");
    expect(streetSearchPhrase("Dr. Arnaldo")).toBe("doutor arnaldo");
    expect(streetSearchPhrase("Rua")).toBe("rua");
  });

  it("picks the most distinctive word as the fallback keyword", () => {
    expect(streetSearchKeyword("Rua 15 de Novembro")).toBe("novembro");
    expect(streetSearchKeyword("Av. N. Sra. de Copacabana")).toBe("copacabana");
    expect(streetSearchKeyword("Av. Dr. Arnaldo")).toBe("arnaldo");
    expect(streetSearchKeyword("Rua 7")).toBeUndefined();
  });
});

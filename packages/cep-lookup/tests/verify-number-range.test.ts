import { isNumberInRange, parseHouseNumber, parseNumberRange } from "../src/verify/number-range";
import type { NumberRange } from "../src/verify/types";

describe("verify: parseNumberRange on real Correios complements", () => {
  const cases: Array<[string, NumberRange | null]> = [
    ["de 612 a 1510 - lado par", { kind: "range", min: 612, max: 1510, side: "even" }],
    ["até 609 - lado ímpar", { kind: "range", max: 609, side: "odd" }],
    ["de 3252 ao fim - lado par", { kind: "range", min: 3252, side: "even" }],
    ["de 1600/1601 a 2230/2231", { kind: "range", min: 1600, max: 2231 }],
    ["até 894/0895", { kind: "range", max: 895 }],
    ["de 0896/897 a 1598/1599", { kind: "range", min: 896, max: 1599 }],
    ["de 2752/2753 ao fim", { kind: "range", min: 2752 }],
    ["lado ímpar", { kind: "range", side: "odd" }],
    ["LADO PAR", { kind: "range", side: "even" }],
    ["2064", { kind: "building", numbers: [2064] }],
    ["1374 12 Andar", { kind: "building", numbers: [1374] }],
    ["2092 Loja 35", { kind: "building", numbers: [2092] }],
    ["1795/1827", { kind: "building", numbers: [1795, 1827] }],
    ["", null],
    ["Bloco A", null],
  ];

  it.each(cases)("%p", (text, expected) => {
    expect(parseNumberRange(text)).toEqual(expected);
  });

  it("returns null for a missing complement", () => {
    expect(parseNumberRange(undefined)).toBeNull();
    expect(parseNumberRange(null)).toBeNull();
  });
});

describe("verify: isNumberInRange", () => {
  const evenSide = parseNumberRange("de 612 a 1510 - lado par")!;

  it("checks both bounds inclusively and the side of the street", () => {
    expect(isNumberInRange(612, evenSide)).toBe(true);
    expect(isNumberInRange(1000, evenSide)).toBe(true);
    expect(isNumberInRange(1510, evenSide)).toBe(true);
    expect(isNumberInRange(610, evenSide)).toBe(false);
    expect(isNumberInRange(1512, evenSide)).toBe(false);
    expect(isNumberInRange(1001, evenSide)).toBe(false);
  });

  it("applies each side's bound of a Correios pair", () => {
    const pair = parseNumberRange("de 0896/897 a 1598/1599")!;
    expect(isNumberInRange(895, pair)).toBe(false);
    expect(isNumberInRange(896, pair)).toBe(true);
    expect(isNumberInRange(897, pair)).toBe(true);
    expect(isNumberInRange(1598, pair)).toBe(true);
    expect(isNumberInRange(1599, pair)).toBe(true);
    expect(isNumberInRange(1600, pair)).toBe(false);
  });

  it("handles ranges open at either end", () => {
    const toTheEnd = parseNumberRange("de 2752/2753 ao fim")!;
    expect(isNumberInRange(2750, toTheEnd)).toBe(false);
    expect(isNumberInRange(99999, toTheEnd)).toBe(true);
    expect(isNumberInRange(1, parseNumberRange("até 609 - lado ímpar")!)).toBe(true);
  });

  it("matches a single-building CEP only on its own numbers", () => {
    const building = parseNumberRange("1795/1827")!;
    expect(isNumberInRange(1795, building)).toBe(true);
    expect(isNumberInRange(1827, building)).toBe(true);
    expect(isNumberInRange(1800, building)).toBe(false);
  });

  it("rejects fractional and negative numbers", () => {
    expect(isNumberInRange(700.5, evenSide)).toBe(false);
    expect(isNumberInRange(-700, evenSide)).toBe(false);
  });
});

describe("verify: parseHouseNumber", () => {
  it.each<[string | number, number | null]>([
    [1578, 1578],
    ["1578", 1578],
    [" 1578-A ", 1578],
    ["nº 1578", 1578],
    ["n. 12", 12],
    ["N° 7", 7],
    ["S/N", null],
    ["sn", null],
    ["km 12", null],
    ["", null],
    [12.5, null],
    [-3, null],
  ])("%p → %p", (value, expected) => {
    expect(parseHouseNumber(value)).toBe(expected);
  });
});

import { MAX_FIELD_LENGTH } from "./text";
import type { NumberRange } from "./types";

const BOUND = "(\\d+)(?:\\s*/\\s*(\\d+))?";
/** "de 612 a 1510", "de 0896/897 a 1598/1599" */
const FROM_TO = new RegExp(`^de\\s+${BOUND}\\s+(?:a|ate)\\s+${BOUND}`);
/** "de 3252 ao fim", "de 2752/2753 ao fim" */
const FROM_START_TO_END = new RegExp(`^de\\s+${BOUND}\\s+ao\\s+fim`);
/** "até 609", "até 894/0895" */
const UP_TO = new RegExp(`^ate\\s+${BOUND}`);
const SIDE = /\blado\s+(par|impar)\b/;
/** Single-building CEPs carry the building's own number: "2064", "1374 12 Andar", "1795/1827". */
const BUILDING = /^(\d+)(?:\s*\/\s*(\d+))?(?!\d)/;

/**
 * A Correios pair such as "1600/1601" gives the bound for each side of the street. The
 * two numbers are adjacent, so for integers taking the lower one as a minimum (or the
 * higher one as a maximum) covers exactly the same house numbers on both sides.
 */
function bound(first: string, second: string | undefined, pick: (a: number, b: number) => number): number {
  return second === undefined ? Number(first) : pick(Number(first), Number(second));
}

function numberRange(min: number | undefined, max: number | undefined, side: "even" | "odd" | undefined): NumberRange {
  const range: NumberRange = { kind: "range" };
  if (min !== undefined) range.min = min;
  if (max !== undefined) range.max = max;
  if (side !== undefined) range.side = side;
  return range;
}

/**
 * @function parseNumberRange
 * @description Parses the house numbers a CEP serves from the Correios complement that
 * ViaCEP and OpenCEP return: "de 612 a 1510 - lado par", "até 609 - lado ímpar",
 * "de 1600/1601 a 2230/2231", "de 3252 ao fim - lado par", "lado ímpar", or a
 * single-building number such as "2064".
 * @returns {NumberRange | null} `null` when the text carries no numbering (empty, "Bloco A").
 */
export function parseNumberRange(text: string | null | undefined): NumberRange | null {
  const value = String(text ?? "")
    .slice(0, MAX_FIELD_LENGTH)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!value) return null;

  const sideMatch = SIDE.exec(value);
  const side = sideMatch ? (sideMatch[1] === "par" ? "even" : "odd") : undefined;

  let match = FROM_START_TO_END.exec(value);
  if (match) return numberRange(bound(match[1], match[2], Math.min), undefined, side);
  match = FROM_TO.exec(value);
  if (match) return numberRange(bound(match[1], match[2], Math.min), bound(match[3], match[4], Math.max), side);
  match = UP_TO.exec(value);
  if (match) return numberRange(undefined, bound(match[1], match[2], Math.max), side);
  if (side) return numberRange(undefined, undefined, side);

  match = BUILDING.exec(value);
  if (match) {
    const numbers = [Number(match[1])];
    if (match[2] !== undefined) numbers.push(Number(match[2]));
    return { kind: "building", numbers };
  }
  return null;
}

/**
 * @function isNumberInRange
 * @description Whether a house number is served by a CEP's numbering range.
 */
export function isNumberInRange(houseNumber: number, range: NumberRange): boolean {
  if (!Number.isInteger(houseNumber) || houseNumber < 0) return false;
  if (range.kind === "building") return range.numbers.includes(houseNumber);
  if (range.side !== undefined && range.side !== (houseNumber % 2 === 0 ? "even" : "odd")) return false;
  if (range.min !== undefined && houseNumber < range.min) return false;
  if (range.max !== undefined && houseNumber > range.max) return false;
  return true;
}

/**
 * Leading house number of a typed value: `1578`, `"1578"`, `"nº 1578-A"`.
 * `null` when there is none, as in "S/N" or "km 12".
 */
export function parseHouseNumber(value: string | number): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  const match = /^\s*(?:n[º°o]?\.?\s*)?(\d+)/i.exec(String(value).slice(0, MAX_FIELD_LENGTH));
  return match ? Number(match[1]) : null;
}

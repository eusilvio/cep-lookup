import type { Address } from "../types";
import { stateInfoByUf } from "../offline/data";
import { HONORIFICS, MAX_FIELD_LENGTH, STREET_TYPES, foldText, tokenizeAddressText } from "./text";
import { textSimilarity } from "./similarity";
import { isNumberInRange, parseHouseNumber, parseNumberRange } from "./number-range";
import type {
  AddressInput,
  AddressVerification,
  CompareOptions,
  FieldMatch,
  FieldVerification,
  NumberRange,
  VerifiableField,
  VerificationStatus,
} from "./types";

const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_STRICT_FIELDS: readonly VerifiableField[] = ["state", "city", "street", "number"];
/** Same name under another street type ("Rua Paulista" / "Avenida Paulista"): close, never equivalent. */
const TYPE_CONFLICT_PENALTY = 0.9;
const FIELD_WEIGHTS: Readonly<Record<VerifiableField, number>> = {
  street: 0.35,
  city: 0.25,
  state: 0.15,
  number: 0.15,
  neighborhood: 0.1,
};

type Fields = AddressVerification["fields"];

interface StreetParts {
  street: string;
  range: NumberRange | null;
  rangeText: string;
}

interface StreetForm {
  words: string[];
  core: string[];
  type?: string;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_LENGTH) : "";
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && foldText(value) !== "";
}

function hasNumber(value: unknown): value is string | number {
  return (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.trim() !== "");
}

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index]);
}

function field(match: FieldMatch, input: string, expected: string, similarity: number): FieldVerification {
  return { match, input, expected, similarity: round(similarity) };
}

function resolveThreshold(threshold: number | undefined): number {
  return typeof threshold === "number" && threshold >= 0 && threshold <= 1 ? threshold : DEFAULT_THRESHOLD;
}

/**
 * Some providers append the numbering range to the street itself
 * ("Avenida Paulista - de 612 a 1510 - lado par"). Split it off so the name compares
 * cleanly and the range still verifies the house number.
 */
function splitStreet(street: string): StreetParts {
  const separator = /\s+[-\u{2013}]\s+/gu;
  let match: RegExpExecArray | null;
  while ((match = separator.exec(street)) !== null) {
    const rangeText = street.slice(match.index + match[0].length).trim();
    const range = parseNumberRange(rangeText);
    if (range?.kind === "range") {
      return { street: clean(street.slice(0, match.index)), range, rangeText };
    }
  }
  return { street, range: null, rangeText: "" };
}

let stateNameWords: ReadonlyArray<readonly [string, string[]]> | undefined;

function stateNames(): ReadonlyArray<readonly [string, string[]]> {
  stateNameWords ??= Object.entries(stateInfoByUf).map(([uf, info]) => [uf, tokenizeAddressText(info.name)] as const);
  return stateNameWords;
}

function stateWords(value: string): string[] {
  const words = tokenizeAddressText(value);
  return words.length > 1 && words[0] === "estado" ? words.slice(1) : words;
}

function isUf(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(stateInfoByUf, value);
}

/**
 * Resolves a UF or a state name, even slightly misspelled, to its UF.
 * @internal
 */
export function stateCode(value: string): string | undefined {
  const text = clean(value);
  if (/^[a-z]{2}$/i.test(text)) {
    return isUf(text.toUpperCase()) ? text.toUpperCase() : undefined;
  }
  const words = stateWords(text);
  let bestUf: string | undefined;
  let best = 0;
  for (const [uf, nameWords] of stateNames()) {
    const similarity = sameTokens(words, nameWords) ? 1 : textSimilarity(words, nameWords);
    if (similarity > best) {
      best = similarity;
      bestUf = uf;
    }
  }
  return best >= DEFAULT_THRESHOLD ? bestUf : undefined;
}

function compareState(input: string, expected: string, threshold: number): FieldVerification {
  const typed = clean(input);
  const expectedUf = clean(expected).toUpperCase();
  if (!expectedUf) return field("unverifiable", typed, "", 0);
  if (typed.toUpperCase() === expectedUf) return field("exact", typed, expectedUf, 1);
  if (/^[a-z]{2}$/i.test(typed)) return field("mismatch", typed, expectedUf, 0);

  const words = stateWords(typed);
  let bestUf = "";
  let best = 0;
  let expectedSimilarity = 0;
  for (const [uf, nameWords] of stateNames()) {
    if (sameTokens(words, nameWords)) {
      return uf === expectedUf ? field("equivalent", typed, expectedUf, 1) : field("mismatch", typed, expectedUf, 0);
    }
    const similarity = textSimilarity(words, nameWords);
    if (uf === expectedUf) expectedSimilarity = similarity;
    if (similarity > best) {
      best = similarity;
      bestUf = uf;
    }
  }
  // A close name only counts when no other state is closer: "Mato Grosso" must never pass for MS.
  if (bestUf === expectedUf && best >= threshold) return field("similar", typed, expectedUf, best);
  return field("mismatch", typed, expectedUf, expectedSimilarity);
}

function compareText(input: string, expected: string, threshold: number): FieldVerification {
  const typed = clean(input);
  const actual = clean(expected);
  if (!actual) return field("unverifiable", typed, "", 0);
  if (typed.toLowerCase() === actual.toLowerCase()) return field("exact", typed, actual, 1);
  const a = tokenizeAddressText(typed);
  const b = tokenizeAddressText(actual);
  if (sameTokens(a, b)) return field("equivalent", typed, actual, 1);
  const similarity = textSimilarity(a, b);
  return field(similarity >= threshold ? "similar" : "mismatch", typed, actual, similarity);
}

function withoutHonorifics(words: string[]): string[] {
  const core = words.filter((word) => !HONORIFICS.has(word));
  return core.length > 0 ? core : words;
}

/**
 * A street compares both as typed and without its leading type: "Campo Grande" is a
 * name, but "Rua Campo Grande" is the type "rua" plus that name.
 */
function streetForms(street: string): StreetForm[] {
  const words = tokenizeAddressText(street);
  const forms: StreetForm[] = [{ words, core: withoutHonorifics(words) }];
  if (words.length > 1 && STREET_TYPES.has(words[0])) {
    const name = words.slice(1);
    forms.push({ words: name, core: withoutHonorifics(name), type: words[0] });
  }
  return forms;
}

function compareStreet(input: string, expected: string, threshold: number): FieldVerification {
  const typed = clean(input);
  const actual = clean(expected);
  if (!actual) return field("unverifiable", typed, "", 0);
  if (typed.toLowerCase() === actual.toLowerCase()) return field("exact", typed, actual, 1);

  const expectedForms = streetForms(actual);
  let similarity = 0;
  for (const a of streetForms(typed)) {
    for (const b of expectedForms) {
      const typeConflict = a.type !== undefined && b.type !== undefined && a.type !== b.type;
      if (!typeConflict && (sameTokens(a.words, b.words) || sameTokens(a.core, b.core))) {
        return field("equivalent", typed, actual, 1);
      }
      similarity = Math.max(similarity, textSimilarity(a.core, b.core) * (typeConflict ? TYPE_CONFLICT_PENALTY : 1));
    }
  }
  return field(similarity >= threshold ? "similar" : "mismatch", typed, actual, similarity);
}

function compareNumber(input: string | number, range: NumberRange | null, rangeText: string): FieldVerification {
  const typed = clean(String(input));
  const houseNumber = parseHouseNumber(typeof input === "number" ? input : typed);
  if (!range || houseNumber === null) {
    return field("unverifiable", typed, range ? rangeText : "", 0);
  }
  return isNumberInRange(houseNumber, range) ? field("exact", typed, rangeText, 1) : field("mismatch", typed, rangeText, 0);
}

function decideStatus(fields: Fields, strictFields: ReadonlySet<VerifiableField>, partial: boolean): VerificationStatus {
  const results = Object.entries(fields) as Array<[VerifiableField, FieldVerification]>;
  if (results.some(([name, result]) => result.match === "mismatch" && strictFields.has(name))) {
    return "conflict";
  }
  if (partial) return "unverifiable";
  if (results.some(([, result]) => result.match === "similar" || result.match === "mismatch")) {
    return "plausible";
  }
  return "confirmed";
}

function scoreFields(fields: Fields, partial: boolean): number {
  let weighted = 0;
  let weights = 0;
  for (const [name, result] of Object.entries(fields) as Array<[VerifiableField, FieldVerification]>) {
    if (result.match === "unverifiable") continue;
    weighted += FIELD_WEIGHTS[name] * result.similarity;
    weights += FIELD_WEIGHTS[name];
  }
  // Nothing to weigh: a resolved CEP still vouches for itself, an offline one does not.
  if (weights === 0) return partial ? 0 : 1;
  return round(weighted / weights);
}

function buildSuggestion(input: AddressInput, reference: Address, street: StreetParts): Address {
  const suggestion: Address = {
    ...reference,
    city: clean(reference.city) || clean(input.city),
    neighborhood: clean(reference.neighborhood) || clean(input.neighborhood),
    street: street.street || clean(input.street),
  };
  if (!reference.complement && street.rangeText) {
    suggestion.complement = street.rangeText;
  }
  return suggestion;
}

/**
 * @function compareAddress
 * @description Compares a typed address with an already resolved one, field by field -
 * synchronous, zero network. Use it when you already hold the reference address (your
 * own database, a gateway, an earlier lookup); `verifyAddress` resolves the CEP for you
 * and searches for corrections. Each field is compared up to 200 characters.
 * @param {AddressInput} input - The address as typed. Only the fields present are checked.
 * @param {Address} reference - The address the CEP resolves to.
 * @param {CompareOptions} [options] - Similarity threshold and strict fields.
 * @returns {AddressVerification} Status, score, per-field outcome and a suggestion.
 */
export function compareAddress(input: AddressInput, reference: Address, options: CompareOptions = {}): AddressVerification {
  const threshold = resolveThreshold(options.threshold);
  const strictFields = new Set<VerifiableField>(options.strictFields ?? DEFAULT_STRICT_FIELDS);
  // `clean` collapses whitespace first, which also keeps the separator regex linear.
  const street = splitStreet(clean(reference.street));
  const complementRange = parseNumberRange(reference.complement);
  const range = complementRange ?? street.range;
  const rangeText = complementRange ? clean(reference.complement) : street.rangeText;

  const fields: Fields = {};
  if (hasText(input.state)) fields.state = compareState(input.state, reference.state ?? "", threshold);
  if (hasText(input.city)) fields.city = compareText(input.city, reference.city ?? "", threshold);
  if (hasText(input.neighborhood)) fields.neighborhood = compareText(input.neighborhood, reference.neighborhood ?? "", threshold);
  if (hasText(input.street)) fields.street = compareStreet(input.street, street.street, threshold);
  if (hasNumber(input.number)) fields.number = compareNumber(input.number, range, rangeText);

  const partial = reference.partial === true;
  const status = decideStatus(fields, strictFields, partial);
  const verification: AddressVerification = {
    status,
    score: scoreFields(fields, partial),
    cep: reference.cep,
    fields,
    reference,
  };
  if (status !== "conflict") {
    verification.suggestion = buildSuggestion(input, reference, street);
  }
  return verification;
}

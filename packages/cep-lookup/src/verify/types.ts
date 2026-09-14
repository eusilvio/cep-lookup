import type { Address, LookupOptions, SearchByAddressOptions } from "../types";

/**
 * Overall verdict for an address checked against its CEP.
 *
 * - `confirmed`: every field that could be checked matches, exactly or equivalently.
 * - `plausible`: nothing contradicts the CEP, but a field only looks similar (a typo,
 *   another street type) or a non-strict field disagrees - offer the `suggestion`.
 * - `conflict`: a strict field contradicts the CEP - wrong CEP or wrong address.
 * - `unverifiable`: the CEP only resolved offline, at state level, so city,
 *   neighborhood and street could not be checked.
 * - `not_found`: the CEP is well-formed but does not exist.
 * - `invalid`: the CEP does not have 8 digits.
 */
export type VerificationStatus = "confirmed" | "plausible" | "conflict" | "unverifiable" | "not_found" | "invalid";

export type VerifiableField = "state" | "city" | "neighborhood" | "street" | "number";

/**
 * How a single field compares with the CEP's data.
 *
 * - `exact`: same text, ignoring case and extra spaces. For `number`: inside the CEP's numbering range.
 * - `equivalent`: same value written differently - accents, abbreviations ("Av." / "Avenida"),
 *   an omitted street type or title, numbers spelled out ("XV" / "15"), state name instead of UF.
 * - `similar`: different, but within the similarity threshold - a typo or a variant.
 * - `mismatch`: a different value.
 * - `unverifiable`: the CEP's data has nothing to compare with (a single-CEP town has no
 *   street, most CEPs have no numbering range).
 */
export type FieldMatch = "exact" | "equivalent" | "similar" | "mismatch" | "unverifiable";

/** An address as typed by a user. Only the fields present are checked. */
export interface AddressInput {
  /** CEP in any formatting - non-digits are stripped. Required by `verifyAddress`. */
  cep?: string;
  /** UF ("SP") or state name ("São Paulo"). */
  state?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  /** House number: `1578`, `"1578"`, `"1578-A"`. `"S/N"` is accepted and left unverified. */
  number?: string | number;
}

export interface FieldVerification {
  match: FieldMatch;
  /** The value as typed, trimmed. */
  input: string;
  /** The CEP's value. For `number`, the numbering range text, e.g. "de 612 a 1510 - lado par". */
  expected: string;
  /** Similarity between the normalized values, from 0 to 1. */
  similarity: number;
}

export interface CompareOptions {
  /** Minimum similarity (0-1) for a differing value to count as `similar` instead of `mismatch`. Default: 0.8 */
  threshold?: number;
  /**
   * Fields whose `mismatch` turns the whole address into a `conflict`; a mismatch on any
   * other field only lowers it to `plausible`. Default: `["state", "city", "street", "number"]` -
   * neighborhood names diverge from the Correios database too often to be strict by default.
   */
  strictFields?: VerifiableField[];
}

export interface VerifyOptions extends CompareOptions {
  /**
   * Allow reverse searches (`searchByAddress`), only when they are needed: to find the CEP
   * that actually serves the typed street when the typed CEP conflicts, does not exist or is
   * malformed (up to two requests), and to fetch the numbering range when the provider that
   * answered does not return complements (one request). Default: true.
   */
  reverseSearch?: boolean;
  /**
   * Deadline in ms for each reverse search. A search that fails or runs past it is skipped:
   * the verification comes back without that correction or range instead of hanging. Default: 5000
   */
  searchTimeout?: number;
  /** Aborts the lookup and any reverse search, rejecting the verification. */
  signal?: AbortSignal;
}

export interface AddressVerification {
  status: VerificationStatus;
  /** Weighted agreement (0-1) over the fields that could be checked. */
  score: number;
  /** The verified CEP, digits only. */
  cep: string;
  /** Outcome for every field present in the input. */
  fields: Partial<Record<VerifiableField, FieldVerification>>;
  /** What the CEP resolved to. Absent for `not_found` and `invalid`. */
  reference?: Address;
  /**
   * The address worth storing: the CEP's data, with gaps filled from the input. On a
   * `conflict`, `not_found` or `invalid` it exists only when the correction search found
   * the right CEP - compare `suggestion.cep` with `cep`.
   */
  suggestion?: Address;
  /** Set instead of `suggestion` when the correction search found several equally good CEPs. */
  candidates?: Address[];
}

/**
 * Anything that resolves CEPs - a `CepLookup` instance fits as-is. `searchByAddress`
 * is only needed for correction searches.
 */
export interface AddressResolver {
  lookup(cep: string, options?: LookupOptions): Promise<Address>;
  searchByAddress?(state: string, city: string, street: string, options?: SearchByAddressOptions): Promise<Address[]>;
}

/**
 * House numbers served by a CEP, parsed from the Correios complement
 * ("de 612 a 1510 - lado par", "até 894/0895", "2064").
 */
export type NumberRange =
  | {
      kind: "range";
      /** Lowest number covered, inclusive. Absent: from the start of the street. */
      min?: number;
      /** Highest number covered, inclusive. Absent: to the end of the street. */
      max?: number;
      /** Only this side of the street. Absent: both sides. */
      side?: "even" | "odd";
    }
  | {
      kind: "building";
      /** Exact numbers of a single-building CEP (a Correios "grande usuário"). */
      numbers: number[];
    };

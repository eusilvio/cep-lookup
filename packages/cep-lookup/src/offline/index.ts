import { Address } from "../types";
import { validateCep } from "../validate";
import { dddByState } from "../data/ddd-by-state";
import { cepRanges, stateInfoByUf, Region, StateInfo } from "./data";

export { cepRanges, stateInfoByUf };
export type { Region, StateInfo };

/**
 * @interface OfflineCepInfo
 * @description Everything the library can tell about a CEP without touching the
 * network: which state the CEP belongs to (from the official Correios allocation
 * map) plus state-level metadata.
 */
export interface OfflineCepInfo {
  /** The cleaned, 8-digit CEP. */
  cep: string;
  /** Two-letter state abbreviation (UF), e.g. "SP". */
  state: string;
  /** Full state name, e.g. "São Paulo". */
  stateName: string;
  /** Macro-region of the state, e.g. "Sudeste". */
  region: Region;
  /** State capital, e.g. "São Paulo". */
  capital: string;
  /** DDD of the state capital (state-level fallback, not street-accurate). */
  ddd: string;
  /** Two-digit IBGE code of the state (not the 7-digit city code). */
  ibgeState: string;
}

/** Binary search over the sorted allocation ranges. Returns the UF or null. */
function findUf(cepNumber: number): string | null {
  let low = 0;
  let high = cepRanges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const [start, end, uf] = cepRanges[mid];
    if (cepNumber < start) {
      high = mid - 1;
    } else if (cepNumber > end) {
      low = mid + 1;
    } else {
      return uf;
    }
  }
  return null;
}

/**
 * @function resolveCepOffline
 * @description Resolves state-level information for a CEP synchronously, with
 * zero network access, from the official Correios CEP allocation map.
 * @param {string} cep - CEP in `NNNNNNNN` or `NNNNN-NNN` format.
 * @returns {OfflineCepInfo | null} State-level info, or `null` when the CEP is
 * well-formed but falls outside every allocated range.
 * @throws {CepValidationError} If the CEP format is invalid.
 */
export function resolveCepOffline(cep: string): OfflineCepInfo | null {
  const cleanedCep = validateCep(cep);
  const uf = findUf(Number(cleanedCep));
  if (!uf) {
    return null;
  }
  const info = stateInfoByUf[uf];
  return {
    cep: cleanedCep,
    state: uf,
    stateName: info.name,
    region: info.region,
    capital: info.capital,
    ddd: dddByState[uf],
    ibgeState: info.ibge,
  };
}

/**
 * @function stateFromCep
 * @description Returns the UF that owns a CEP, or `null` for unallocated ranges.
 * @throws {CepValidationError} If the CEP format is invalid.
 */
export function stateFromCep(cep: string): string | null {
  return findUf(Number(validateCep(cep)));
}

/**
 * @function isCepAllocated
 * @description Whether a well-formed CEP falls inside an allocated Correios
 * range. A `false` here means no provider can possibly resolve it — useful to
 * short-circuit doomed lookups (and catch typos) before any network call.
 * @throws {CepValidationError} If the CEP format is invalid.
 */
export function isCepAllocated(cep: string): boolean {
  return stateFromCep(cep) !== null;
}

/**
 * @function cepMatchesState
 * @description Cross-field form validation in 0ms: checks that a CEP belongs to
 * the given state (UF, case-insensitive). Returns `false` for unallocated CEPs
 * and unknown UFs.
 * @throws {CepValidationError} If the CEP format is invalid.
 */
export function cepMatchesState(cep: string, state: string): boolean {
  const uf = stateFromCep(cep);
  if (!uf) {
    return false;
  }
  return uf === (state || "").trim().toUpperCase();
}

/**
 * @function toPartialAddress
 * @description Shapes an `OfflineCepInfo` into the library's `Address` format.
 * City/street fields are empty strings and the result is flagged `partial: true`
 * so consumers can distinguish it from a provider-resolved address.
 */
export function toPartialAddress(info: OfflineCepInfo): Address {
  return {
    cep: info.cep,
    state: info.state,
    city: "",
    neighborhood: "",
    street: "",
    service: "offline",
    ddd: info.ddd,
    partial: true,
  };
}

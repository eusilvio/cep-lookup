/**
 * Address verification: does the address a user typed match its CEP - and when it
 * does not, which CEP is the right one?
 *
 * Standalone subpath (`@eusilvio/cep-lookup/verify`), so the main entry point does not
 * grow. Works with any `CepLookup` instance and inherits its resilience: cache,
 * circuit breaker, retries and offline fallback.
 */
import type { Address } from "../types";
import { stateFromCep } from "../offline";
import { compareAddress, stateCode } from "./compare";
import { parseHouseNumber, parseNumberRange } from "./number-range";
import { MAX_FIELD_LENGTH, streetSearchKeyword, streetSearchPhrase } from "./text";
import type { AddressInput, AddressResolver, AddressVerification, VerificationStatus, VerifyOptions } from "./types";

export { compareAddress };
export { normalizeAddressText } from "./text";
export { parseNumberRange, isNumberInRange } from "./number-range";
export type {
  AddressInput,
  AddressResolver,
  AddressVerification,
  CompareOptions,
  FieldMatch,
  FieldVerification,
  NumberRange,
  VerifiableField,
  VerificationStatus,
  VerifyOptions,
} from "./types";

const MAX_CANDIDATES = 5;
const DEFAULT_SEARCH_TIMEOUT_MS = 5000;
const MAX_TIMER_MS = 2147483647;

/** Providers whose answer already carries the Correios complement whenever the CEP has one. */
const RANGE_AWARE_SERVICES: ReadonlySet<string> = new Set(["ViaCEP", "OpenCEP", "ApiCEP"]);

type Search = NonNullable<AddressResolver["searchByAddress"]>;

interface Candidate {
  suggestion: Address;
  tier: number;
  score: number;
}

interface SearchQuery {
  state: string;
  city: string;
  streets: string[];
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError(signal);
}

// Subpaths bundle their own copy of the error classes, so `instanceof` would fail
// against errors thrown by the main entry point. Every library error carries `.code`.
function errorCode(error: unknown): unknown {
  return typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
}

function digitsOf(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function searchOf(resolver: AddressResolver, options: VerifyOptions): Search | undefined {
  return options.reverseSearch === false ? undefined : resolver.searchByAddress;
}

/**
 * Runs one best-effort reverse search. Resolves `undefined` when the search fails or
 * outlives `searchTimeout`; rejects only when the caller's own signal aborts.
 */
async function runSearch(
  resolver: AddressResolver,
  search: Search,
  state: string,
  city: string,
  street: string,
  options: VerifyOptions
): Promise<Address[] | undefined> {
  const { signal } = options;
  throwIfAborted(signal);

  const timeout = options.searchTimeout;
  const timeoutMs = typeof timeout === "number" && timeout > 0 && timeout <= MAX_TIMER_MS ? timeout : DEFAULT_SEARCH_TIMEOUT_MS;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(undefined);
    }, timeoutMs);
  });
  // Races the caller's signal too, so a resolver that ignores `signal` cannot hold up an abort.
  const cancelled = new Promise<never>((_, reject) => {
    if (!signal) return;
    onAbort = () => {
      controller.abort();
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    const results = await Promise.race([
      search.call(resolver, state, city, street, { signal: controller.signal }),
      expired,
      cancelled,
    ]);
    if (results === undefined) return undefined;
    return Array.isArray(results) ? results : [];
  } catch (error) {
    if (signal?.aborted) throw error;
    // Reverse searches are best-effort: a failed one never fails the verification itself.
    return undefined;
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * BrasilAPI and most custom providers never return the Correios complement, so a CEP
 * resolved by them looks like it has no numbering range. When a house number is at stake,
 * fetch the range from a reverse search of the CEP's own street.
 */
async function withNumberingRange(
  resolver: AddressResolver,
  input: AddressInput,
  reference: Address,
  options: VerifyOptions
): Promise<Address> {
  const search = searchOf(resolver, options);
  const hasHouseNumber = input.number !== undefined && input.number !== null && parseHouseNumber(input.number) !== null;
  if (!search || !hasHouseNumber || reference.partial || reference.complement || RANGE_AWARE_SERVICES.has(reference.service)) {
    return reference;
  }
  const street = streetSearchPhrase(reference.street ?? "");
  const city = reference.city ?? "";
  if (!reference.state || city.length < 3 || street.length < 3) return reference;

  const results = await runSearch(resolver, search, reference.state, city, street, options);
  const match = results?.find((address) => digitsOf(address?.cep) === digitsOf(reference.cep) && !!address.complement);
  return match ? { ...reference, complement: match.complement } : reference;
}

function buildSearchQuery(input: AddressInput, verification: AddressVerification): SearchQuery | undefined {
  if (typeof input.street !== "string") return undefined;
  const reference = verification.reference;
  const typedState = typeof input.state === "string" ? stateCode(input.state) : undefined;
  const cepState = verification.cep.length === 8 ? stateFromCep(verification.cep) ?? undefined : undefined;
  const state = typedState || reference?.state || cepState;
  const typedCity = typeof input.city === "string" ? input.city.replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_LENGTH) : "";
  const city = typedCity || reference?.city || "";
  const phrase = streetSearchPhrase(input.street);
  // ViaCEP requires at least 3 characters for both city and street.
  if (!state || city.length < 3 || phrase.length < 3) return undefined;
  const keyword = streetSearchKeyword(input.street);
  return { state, city, streets: keyword && keyword !== phrase ? [phrase, keyword] : [phrase] };
}

/**
 * Number evidence, best first: the typed number falls inside a street range, then it is
 * a single building's own number, then the CEP simply carries no numbering.
 */
function numberTier(verification: AddressVerification, candidate: Address): number {
  const building = parseNumberRange(candidate.complement)?.kind === "building";
  const match = verification.fields.number?.match;
  if (match === "exact") return building ? 2 : 3;
  if (match === "mismatch") return -1;
  return building ? 0 : 1;
}

function rankCandidates(input: AddressInput, results: Address[], originalCep: string, options: VerifyOptions): Candidate[] {
  const seen = new Set<string>([originalCep]);
  const candidates: Candidate[] = [];
  for (const address of results) {
    const cep = digitsOf(address?.cep);
    if (cep.length !== 8 || seen.has(cep)) continue;
    seen.add(cep);
    const verification = compareAddress(input, address, options);
    const street = verification.fields.street;
    if (!verification.suggestion || !street || street.match === "mismatch" || street.match === "unverifiable") {
      continue;
    }
    candidates.push({
      suggestion: verification.suggestion,
      tier: (street.match === "similar" ? 0 : 10) + numberTier(verification, address),
      score: verification.score,
    });
  }
  return candidates.sort((a, b) => b.tier - a.tier || b.score - a.score);
}

async function searchCorrection(
  resolver: AddressResolver,
  input: AddressInput,
  verification: AddressVerification,
  options: VerifyOptions
): Promise<AddressVerification> {
  const search = searchOf(resolver, options);
  const query = search ? buildSearchQuery(input, verification) : undefined;
  if (!search || !query) return verification;

  for (const street of query.streets) {
    const results = await runSearch(resolver, search, query.state, query.city, street, options);
    if (results === undefined) return verification;
    const ranked = rankCandidates(input, results, verification.cep, options);
    if (ranked.length === 0) continue;

    const [best] = ranked;
    const tied = ranked.filter((candidate) => candidate.tier === best.tier && candidate.score === best.score);
    return tied.length === 1
      ? { ...verification, suggestion: best.suggestion }
      : { ...verification, candidates: ranked.slice(0, MAX_CANDIDATES).map((candidate) => candidate.suggestion) };
  }
  return verification;
}

/**
 * @function verifyAddress
 * @description Resolves the CEP through the engine and checks the typed address against
 * it: state, city, neighborhood, street and the house number against the CEP's numbering
 * range. When the CEP conflicts with the address, does not exist or is malformed, it
 * searches the typed street for the CEP that actually serves it.
 *
 * Bad data never throws - it comes back as a status. Only infrastructure failures
 * (every provider down with no `offlineFallback`, rate limit) and aborts reject.
 * @param {AddressResolver} resolver - A `CepLookup` instance, or anything with the same `lookup`/`searchByAddress`.
 * @param {AddressInput} input - The address as typed. Only the fields present are checked.
 * @param {VerifyOptions} [options] - Threshold, strict fields, reverse search and abort signal.
 * @returns {Promise<AddressVerification>} Status, score, per-field outcome and a suggestion.
 * @example
 * const result = await verifyAddress(cep, {
 *   cep: "01310-100", street: "Av. Paulista", number: "1578", city: "Sao Paulo", state: "SP",
 * });
 * result.status;          // "conflict" - 1578 is outside "de 612 a 1510 - lado par"
 * result.suggestion?.cep; // "01310200" - the CEP that serves Avenida Paulista, 1578
 */
export async function verifyAddress(
  resolver: AddressResolver,
  input: AddressInput,
  options: VerifyOptions = {}
): Promise<AddressVerification> {
  const { signal } = options;
  throwIfAborted(signal);

  const cep = digitsOf(input.cep);
  if (cep.length !== 8) {
    return searchCorrection(resolver, input, { status: "invalid", score: 0, cep, fields: {} }, options);
  }

  let reference: Address;
  try {
    reference = await resolver.lookup(cep, { signal });
  } catch (error) {
    const code = errorCode(error);
    if (code !== "NOT_FOUND" && code !== "INVALID_CEP") throw error;
    const status: VerificationStatus = code === "NOT_FOUND" ? "not_found" : "invalid";
    return searchCorrection(resolver, input, { status, score: 0, cep, fields: {} }, options);
  }

  const resolved = await withNumberingRange(resolver, input, reference, options);
  const verification = compareAddress(input, resolved, options);
  return verification.status === "conflict" ? searchCorrection(resolver, input, verification, options) : verification;
}

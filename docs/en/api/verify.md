# Verify

Address verification against the CEP, with CEP correction. It lives in its own subpath, so the main entry point does not grow:

```ts
import {
  verifyAddress,
  compareAddress,
  normalizeAddressText,
  parseNumberRange,
  isNumberInRange,
} from "@eusilvio/cep-lookup/verify";
```

The types are also exported from `@eusilvio/cep-lookup` (types only). Guide: [Address verification](/en/guide/verification).

## verifyAddress

```ts
verifyAddress(
  resolver: AddressResolver,
  input: AddressInput,
  options?: VerifyOptions,
): Promise<AddressVerification>
```

Resolves the CEP through the engine and checks the typed address against it. When the CEP conflicts, doesn't exist or is malformed, it looks for the right CEP with a reverse search.

```ts
const result = await verifyAddress(cep, {
  cep: "01310-100",
  street: "Av. Paulista",
  number: "1578",
  city: "Sao Paulo",
  state: "SP",
});
// { status: "conflict", score: 0.8333, cep: "01310100", fields: { ... },
//   reference: { cep: "01310100", ... }, suggestion: { cep: "01310200", ... } }
```

**Never throws** on bad data: a malformed, missing or conflicting CEP comes back as a status. **Rejects** on infrastructure failures the engine could not degrade from (`AllProvidersFailedError`, `RateLimitError`) and with `AbortError` when the `signal` aborts.

### VerifyOptions

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `threshold` | `number` | `0.8` | Minimum similarity (0 to 1) for a different value to count as `similar` instead of `mismatch` |
| `strictFields` | `VerifiableField[]` | `["state", "city", "street", "number"]` | Fields whose `mismatch` makes a `conflict` |
| `reverseSearch` | `boolean` | `true` | Allows reverse searches: numbering range and CEP correction |
| `searchTimeout` | `number` | `5000` | Deadline in ms for each reverse search; past it, the search is skipped |
| `signal` | `AbortSignal` | - | Aborts the lookup and searches, rejecting the verification |

## compareAddress

```ts
compareAddress(
  input: AddressInput,
  reference: Address,
  options?: CompareOptions, // { threshold?, strictFields? }
): AddressVerification
```

The same comparison against an address you already hold - synchronous, zero network, no correction search. Never returns `not_found` or `invalid`.

```ts
compareAddress({ street: "Av Paulsita" }, reference);
// { status: "plausible", score: 0.9375,
//   fields: { street: { match: "similar", input: "Av Paulsita", expected: "Avenida Paulista", similarity: 0.9375 } },
//   suggestion: { street: "Avenida Paulista", ... } }
```

## AddressInput

```ts
interface AddressInput {
  cep?: string;             // any formatting; required by verifyAddress
  state?: string;           // UF or state name
  city?: string;
  neighborhood?: string;
  street?: string;
  number?: string | number; // 1578, "1578", "1578-A"; "S/N" stays unverified
}
```

Only the fields present are checked. Empty or punctuation-only fields are ignored. Each field is compared up to 200 characters - plenty for any Correios street name, and a cost ceiling against hostile payloads on a public endpoint.

## AddressVerification

```ts
interface AddressVerification {
  status: VerificationStatus;
  score: number;          // 0 to 1, weighted over the checked fields
  cep: string;            // verified CEP, digits only
  fields: Partial<Record<VerifiableField, FieldVerification>>;
  reference?: Address;    // what the CEP resolved to; absent for not_found and invalid
  suggestion?: Address;   // the address worth storing; may carry another CEP
  candidates?: Address[]; // instead of suggestion, when several CEPs fit equally
}

type VerificationStatus = "confirmed" | "plausible" | "conflict" | "unverifiable" | "not_found" | "invalid";
type VerifiableField = "state" | "city" | "neighborhood" | "street" | "number";
```

`suggestion` is the CEP's address with gaps filled from the input - a whole-town CEP has no street, so the typed one stays. On `conflict`, `not_found` and `invalid` it only exists when the correction search found the right CEP.

Weight of each field in `score`: street 0.35, city 0.25, state 0.15, number 0.15 and neighborhood 0.10. `unverifiable` fields are left out.

## FieldVerification

```ts
interface FieldVerification {
  match: FieldMatch;
  input: string;      // typed value, extra spaces removed
  expected: string;   // the CEP's value; for number, the range text
  similarity: number; // 0 to 1
}

type FieldMatch = "exact" | "equivalent" | "similar" | "mismatch" | "unverifiable";
```

## normalizeAddressText

```ts
normalizeAddressText(text: string): string
```

Canonical form of an address fragment: accents stripped, abbreviations expanded, numbers as digits, parenthesized notes and the connectives de, da, do, das, dos removed.

```ts
normalizeAddressText("Av. Brig. Faria Lima"); // "avenida brigadeiro faria lima"
normalizeAddressText("R. XV de Novembro");    // "rua 15 novembro"
normalizeAddressText("Pça. D. Pedro 2º");     // "praca dom pedro 2"
```

## parseNumberRange

```ts
parseNumberRange(complement: string | null | undefined): NumberRange | null
```

Reads the numbering range from the Correios complement:

```ts
type NumberRange =
  | { kind: "range"; min?: number; max?: number; side?: "even" | "odd" }
  | { kind: "building"; numbers: number[] }; // single-building CEP
```

```ts
parseNumberRange("de 612 a 1510 - lado par");  // { kind: "range", min: 612, max: 1510, side: "even" }
parseNumberRange("até 894/0895");              // { kind: "range", max: 895 }
parseNumberRange("de 3252 ao fim - lado par"); // { kind: "range", min: 3252, side: "even" }
parseNumberRange("2064");                      // { kind: "building", numbers: [2064] }
parseNumberRange("Bloco A");                   // null
```

In a pair such as `894/0895`, each number bounds one side of the street. Since they are adjacent, `max: 895` covers exactly the same house numbers.

## isNumberInRange

```ts
isNumberInRange(houseNumber: number, range: NumberRange): boolean
```

```ts
const range = parseNumberRange("de 612 a 1510 - lado par")!;

isNumberInRange(1000, range); // true
isNumberInRange(1001, range); // false - odd side
isNumberInRange(1578, range); // false - outside the range
```

## AddressResolver

```ts
interface AddressResolver {
  lookup(cep: string, options?: LookupOptions): Promise<Address>;
  searchByAddress?(state: string, city: string, street: string, options?: SearchByAddressOptions): Promise<Address[]>;
}
```

A `CepLookup` instance fits as-is. So does any object with the same shape - a client for your own gateway, a mock in tests. Without `searchByAddress`, verification works with no reverse searches.

# Offline

A synchronous, zero-network API powered by the official Correios CEP allocation map bundled with the library (~2 KB). Importable standalone:

```ts
import {
  resolveCepOffline,
  stateFromCep,
  isCepAllocated,
  cepMatchesState,
  toPartialAddress,
} from "@eusilvio/cep-lookup/offline";
```

Also re-exported from the main entry point (`@eusilvio/cep-lookup`) if you already use the engine.

## OfflineCepInfo

```ts
interface OfflineCepInfo {
  cep: string;        // cleaned, 8 digits
  state: string;      // two-letter state abbreviation, e.g. "SP"
  stateName: string;  // e.g. "São Paulo"
  region: Region;     // e.g. "Sudeste"
  capital: string;    // state capital
  ddd: string;        // capital's area code (state-level, not street-accurate)
  ibgeState: string;  // two-digit IBGE state code
}
```

## resolveCepOffline

```ts
resolveCepOffline(cep: string): OfflineCepInfo | null
```

```ts
resolveCepOffline("01310-100");
// { cep: '01310100', state: 'SP', stateName: 'São Paulo', region: 'Sudeste',
//   capital: 'São Paulo', ddd: '11', ibgeState: '35' }
```

Returns `null` when the CEP is well-formed but falls outside every allocated range. **Throws** `CepValidationError` on an invalid format.

## stateFromCep

```ts
stateFromCep(cep: string): string | null
```

Shortcut for the state abbreviation:

```ts
stateFromCep("01310-100"); // "SP"
stateFromCep("00500-000"); // null
```

## isCepAllocated

```ts
isCepAllocated(cep: string): boolean
```

Tells whether the CEP falls inside any Correios-allocated range. It rules out the impossible - it doesn't confirm the real.

```ts
isCepAllocated("01310100"); // true
isCepAllocated("00500000"); // false → no provider would ever resolve it
```

## cepMatchesState

```ts
cepMatchesState(cep: string, state: string): boolean
```

0ms CEP↔state cross-field validation - catches the classic checkout typo before any request:

```ts
cepMatchesState("01310-100", "SP"); // true
cepMatchesState("01310-100", "RJ"); // false
```

## toPartialAddress

```ts
toPartialAddress(info: OfflineCepInfo): Address
```

Converts an `OfflineCepInfo` into the partial `Address` that `offlineFallback` returns:

```ts
const info = resolveCepOffline("01310-100")!;
toPartialAddress(info);
// { cep: '01310100', state: 'SP', ddd: '11',
//   city: '', neighborhood: '', street: '', service: 'offline', partial: true }
```

## Raw data

```ts
import { cepRanges, stateInfoByUf } from "@eusilvio/cep-lookup/offline";
import type { Region, StateInfo } from "@eusilvio/cep-lookup/offline";
```

`cepRanges` is the sorted list of `[start, end, uf]` ranges - lookups are binary searches. `stateInfoByUf` maps each state abbreviation to its name, region, capital and IBGE code.

## Limits

The map covers **per-state allocation**, not a street database. It doesn't know city, neighborhood or street, and a CEP inside an allocated range may still not exist.

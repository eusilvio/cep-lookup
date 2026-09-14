---
"@eusilvio/cep-lookup": minor
---

Address verification: check the address a user typed against its CEP, and find the right CEP when the typed one is wrong.

- New `@eusilvio/cep-lookup/verify` subpath. `verifyAddress(lookup, address)` resolves the CEP through the engine and compares state, city, neighborhood, street and house number. It returns a status (`confirmed`, `plausible`, `conflict`, `unverifiable`, `not_found`, `invalid`), a weighted score, a per-field outcome (`exact`, `equivalent`, `similar`, `mismatch`, `unverifiable`) and a suggestion ready to store. Bad data never throws.
- Brazilian address normalization: abbreviations (`Av.`, `R.`, `Pça.`, `Dr.`, `Brig.`, `N. Sra.`), omitted street types and titles, numbers spelled out or in roman numerals (`XV` / `Quinze` / `15`), accents, UF or state name. A near miss never passes for another state.
- House numbers are checked against the Correios numbering range (`de 612 a 1510 - lado par`, `até 894/0895`, single-building CEPs). When the provider that answered does not return complements, the range comes from one reverse search.
- CEP correction: when the CEP conflicts with the address, does not exist or is malformed, a reverse search finds the CEP that serves the typed street and number, or lists `candidates` when several fit equally. Searches are best-effort, bounded by `searchTimeout` (5s by default) and can be turned off with `reverseSearch: false`.
- Zero-network building blocks: `compareAddress`, `normalizeAddressText`, `parseNumberRange` and `isNumberInRange`.
- `searchByAddress()` accepts `{ signal }`, and `openCepProvider` now maps `complemento` to `Address.complement`.

The main entry point does not grow: verification ships only in the `/verify` subpath, and its types are also exported from the main entry.

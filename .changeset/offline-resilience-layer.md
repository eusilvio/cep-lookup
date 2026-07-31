---
"@eusilvio/cep-lookup": minor
---

Offline Resilience Layer: the lookup that never returns empty-handed.

- New `offlineFallback` option — final tier of the fallback ladder (providers race → retries → stale cache → **offline** → error). When every provider fails with an infrastructure error and no stale cache entry is usable, `lookup()` synthesizes a partial, state-level `Address` (`state`, `ddd`, `service: "offline"`, `partial: true`) from the official Correios CEP allocation map bundled with the library (~2 KB). Genuine not-founds are never masked and the partial address is never cached.
- New `offline:fallback` event for observability.
- New `partial?: boolean` field on `Address`, present only on synthesized addresses.
- New zero-network, synchronous API — also available standalone via the `@eusilvio/cep-lookup/offline` subpath export: `resolveCepOffline` (state, state name, region, capital, DDD, IBGE state code), `stateFromCep`, `isCepAllocated`, `cepMatchesState` (0ms CEP↔UF cross-field form validation).

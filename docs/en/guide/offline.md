# Offline layer

The last rung of the fallback ladder. When every provider fails, retries are exhausted and no stale cache entry is usable, `lookup()` can still answer - synthesizing a state-level address from the official Correios CEP allocation map bundled with the library (~2 KB, zero network).

```
provider race → retries → stale cache → offline fallback → error
```

## Turning it on

```ts
const cep = new CepLookup({ providers, offlineFallback: true });

// Internet completely down, cold cache:
await cep.lookup("01310-100");
// {
//   cep: '01310100',
//   state: 'SP',
//   ddd: '11',
//   city: '', neighborhood: '', street: '',
//   service: 'offline',
//   partial: true   // ← degraded answer: state-level data only
// }

cep.on("offline:fallback", ({ cep }) => metrics.increment("cep.offline_fallback"));
```

Two guarantees that matter:

- a genuine not-found is **never** masked - `CepNotFoundError` still throws;
- the partial address is **never** written to the cache.

Use `address.partial` to render a degraded UI - for example, keep state-based shipping estimates working while street and number fall back to manual input:

```ts
const address = await cep.lookup(typedCep);

if (address.partial) {
  form.enableManualAddress({ state: address.state });
}
```

## Zero-network CEP intelligence

The same map powers a standalone, synchronous API, importable on its own from `@eusilvio/cep-lookup/offline` (~2 KB) - no engine, no network:

```ts
import { resolveCepOffline, cepMatchesState, isCepAllocated } from "@eusilvio/cep-lookup/offline";

resolveCepOffline("01310-100");
// { cep: '01310100', state: 'SP', stateName: 'São Paulo', region: 'Sudeste',
//   capital: 'São Paulo', ddd: '11', ibgeState: '35' }

cepMatchesState("01310-100", "RJ"); // false → flag the typo before any request
isCepAllocated("00500-000");        // false → outside every allocated range, skip the lookup
```

### Form validation in 0ms

The classic checkout mistake: the user pastes a CEP from one state and leaves the state dropdown on another. That's detectable with no network:

```ts
import { cepMatchesState, isCepAllocated } from "@eusilvio/cep-lookup/offline";

if (!isCepAllocated(form.cep)) {
  return showError("This CEP falls outside every Correios range.");
}

if (!cepMatchesState(form.cep, form.uf)) {
  return showError(`This CEP does not belong to ${form.uf}.`);
}

// Only now spend a network call:
const address = await cep.lookup(form.cep);
```

`isCepAllocated` also saves doomed lookups: unallocated ranges will never resolve at any provider.

## What the offline layer does not know

The map covers **allocation ranges per state**, not a street database. It answers:

- which state a CEP belongs to;
- state name, region, capital, area code and the state's IBGE code;
- whether the CEP falls inside any allocated range.

It does **not** answer city, neighborhood or street. A CEP inside an allocated range may still not exist - `isCepAllocated` rules out the impossible, it doesn't confirm the real.

## API reference

See [API · Offline](/en/api/offline) for full signatures.

# Address verification

Resolving a CEP tells you where it is. It doesn't tell you whether the address the user typed matches it - and that gap is where returned deliveries come from: the old CEP left in a profile, the number on the other side of the avenue, a street typed under the CEP of another block.

`@eusilvio/cep-lookup/verify` checks the address field by field against its CEP, understands how Brazilians write addresses, checks the house number against the Correios numbering range and, when the CEP is wrong, finds the right one.

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

const cep = new CepLookup({ providers: [viaCepProvider, brasilApiProvider] });

const result = await verifyAddress(cep, {
  cep: "01310-100",
  street: "Av. Paulista",
  number: "1578",
  city: "Sao Paulo",
  state: "SP",
});

result.status; // "conflict"
result.score;  // 0.8333
result.fields;
// {
//   state:  { match: "exact",      input: "SP",           expected: "SP",               similarity: 1 },
//   city:   { match: "equivalent", input: "Sao Paulo",    expected: "São Paulo",        similarity: 1 },
//   street: { match: "equivalent", input: "Av. Paulista", expected: "Avenida Paulista", similarity: 1 },
//   number: { match: "mismatch",   input: "1578",         expected: "de 612 a 1510 - lado par", similarity: 0 }
// }
result.suggestion;
// { cep: "01310200", street: "Avenida Paulista", complement: "de 1512 a 2132 - lado par",
//   neighborhood: "Bela Vista", city: "São Paulo", state: "SP", service: "ViaCEP", ... }
```

Street and city match, but 01310-100 only serves even numbers from 612 to 1510. Number 1578 belongs to 01310-200 - and the verification found that on its own.

Bad data never throws: it comes back as a status. `verifyAddress` only rejects on infrastructure failures (every provider down with no `offlineFallback`, rate limit) or when the `signal` aborts.

## Statuses

| Status | Means | What to do in the UI |
| --- | --- | --- |
| `confirmed` | Everything that could be checked matches | Carry on; store `suggestion`, which has the official spelling |
| `plausible` | Nothing contradicts the CEP, but something looks like a typo | "Did you mean...?" with `suggestion` |
| `conflict` | A field contradicts the CEP | Highlight the `mismatch` fields; offer `suggestion` or `candidates` when present |
| `unverifiable` | Providers down, the offline fallback answered: only the state was checked | Carry on with what was typed, or ask for confirmation |
| `not_found` | The CEP doesn't exist | Offer `suggestion` or `candidates` when present |
| `invalid` | The CEP doesn't have 8 digits | Same |

When the correction search finds the right CEP, `suggestion.cep` differs from `result.cep`:

```ts
if (result.suggestion && result.suggestion.cep !== result.cep) {
  showCorrection(`The CEP for this address is ${result.suggestion.cep}`);
}
```

## Per-field outcome

Every field present in the input gets a `match`:

| `match` | When |
| --- | --- |
| `exact` | Same text, ignoring case and spacing. For `number`: inside the CEP's range |
| `equivalent` | Same value written differently: accents, abbreviations, an omitted street type or title, a number spelled out, the state name instead of the UF |
| `similar` | Different, but above `threshold` (0.8 by default): a typo, another street type |
| `mismatch` | A different value |
| `unverifiable` | The CEP has no data to compare with: a whole-town CEP with no street, a CEP with no numbering range |

`state`, `city`, `street` and `number` are strict: a `mismatch` on any of them makes a `conflict`. The neighborhood isn't - official Correios names diverge from what residents call a place far too often ("Jardins" for "Jardim Paulista"), so a different neighborhood only lowers the status to `plausible`. Change it with `strictFields`:

```ts
await verifyAddress(cep, address, {
  strictFields: ["state", "city", "neighborhood", "street", "number"],
});
```

`fields` only marks what was checked: a `confirmed` with `number: { match: "unverifiable" }` means the CEP serves the whole street, not that the number was validated. If your operation needs a verified number, check `result.fields.number?.match === "exact"`.

## How Brazilians write addresses

The comparison normalizes both sides before measuring differences:

| Typed | Matches |
| --- | --- |
| `Av. Brig. Faria Lima` | `Avenida Brigadeiro Faria Lima` |
| `Faria Lima` | `Avenida Brigadeiro Faria Lima` (street type and title omitted) |
| `R. XV de Novembro`, `Rua 15 de Novembro` | `Rua Quinze de Novembro` |
| `Av. N. Sra. de Copacabana` | `Avenida Nossa Senhora de Copacabana` |
| `Rua Vinte e Cinco de Março` | `Rua 25 de Março` |
| `sao paulo`, `Estado de São Paulo` | `SP` |
| `Jardim Imperador` | `Jardim Imperador (Zona Leste)` |

And it avoids the false positives that matter: `Rua 7 de Setembro` is not `Rua 17 de Setembro`, `Rua Paulista` is only similar to `Avenida Paulista` (`similar`, never `equivalent`), and `Mato Grosso` never passes for `MS`.

The same normalization is exposed for deduplication keys and search indexes:

```ts
import { normalizeAddressText } from "@eusilvio/cep-lookup/verify";

normalizeAddressText("Av. Brig. Faria Lima");   // "avenida brigadeiro faria lima"
normalizeAddressText("Rua Quinze de Novembro"); // "rua 15 novembro"
```

## House number vs. the Correios range

Long avenues get one CEP per stretch and per side. ViaCEP and OpenCEP return that range in `complement`, and verification checks the number against it:

| Range | Serves |
| --- | --- |
| `de 612 a 1510 - lado par` | even numbers from 612 to 1510 |
| `até 609 - lado ímpar` | odd numbers up to 609 |
| `de 0896/897 a 1598/1599` | even 896 to 1598 and odd 897 to 1599 |
| `de 3252 ao fim - lado par` | even numbers from 3252 on |
| `2064` | number 2064 only (a single-building CEP) |

When the provider that answered doesn't return complements (BrasilAPI, custom providers), the range comes from a reverse search of the CEP's own street. The same functions are available on their own:

```ts
import { parseNumberRange, isNumberInRange } from "@eusilvio/cep-lookup/verify";

const range = parseNumberRange("de 612 a 1510 - lado par");
// { kind: "range", min: 612, max: 1510, side: "even" }

isNumberInRange(1578, range!); // false
```

## CEP correction

When the CEP conflicts with the address, doesn't exist or is malformed, verification searches the typed street in the typed city and picks the CEP that serves the typed number:

```ts
const result = await verifyAddress(cep, {
  cep: "80020-310", // only serves up to 894/895
  street: "Rua 15 de Novembro",
  number: "1000",
  city: "Curitiba",
  state: "PR",
});

result.status;          // "conflict"
result.suggestion?.cep; // "80060000" - Rua XV de Novembro, de 0896/897 a 1598/1599
```

Ranking prefers a street range over a single-building CEP, breaks ties by neighborhood and score, and never guesses: when several CEPs fit equally well, `suggestion` stays empty and `candidates` lists up to five options for the user to pick from.

```ts
// São Paulo has more than one "Rua São Marcos"
const result = await verifyAddress(cep, {
  cep: "04513-080",
  street: "Rua São Marcos",
  city: "São Paulo",
  state: "SP",
});

result.suggestion; // undefined
result.candidates; // [{ cep: "05283010", neighborhood: "Residencial Sol Nascente", ... }, ...]
```

Pass the neighborhood and the ambiguity goes away.

## Network cost

- **Happy path: one CEP lookup**, with the engine's cache, circuit breaker, retries and fallback.
- **Reverse searches only when they help**: one to fetch the numbering range (a provider without complements and a house number typed) and up to two for correction (the full phrase and, when it finds nothing, the street's most distinctive word).
- **No search stalls verification**: each one gets `searchTimeout` (5000ms by default). Past it, or on failure, verification comes back without that correction.
- **`reverseSearch: false`** turns searches off: no request beyond the CEP lookup.

Reverse searches go straight to the provider that implements `searchByAddress` (ViaCEP) and skip the engine's cache and `rateLimit`.

## Zero network: compareAddress

Already holding the reference address - from your database, a gateway, an earlier lookup? `compareAddress` runs the same comparison synchronously, with zero network:

```ts
import { compareAddress } from "@eusilvio/cep-lookup/verify";

const result = compareAddress(
  { street: "R. Quinze de Novembro", number: 1000, city: "curitiba", state: "Paraná" },
  {
    cep: "80060000",
    state: "PR",
    city: "Curitiba",
    neighborhood: "Centro",
    street: "Rua XV de Novembro",
    complement: "de 0896/897 a 1598/1599",
    service: "ViaCEP",
  },
);

result.status; // "confirmed"
```

## When providers go down

With `offlineFallback: true` on the engine, verification degrades instead of failing: the CEP resolves at state level and the status becomes `unverifiable` - or `conflict`, when the typed state is a different one. Without the fallback, the infrastructure failure rejects the promise, as `lookup()` does.

## Limits

- The numbering range comes from the Correios database. Most CEPs serve a whole street and have no range: the number is then `unverifiable`.
- ViaCEP's reverse search matches literal words and returns at most 50 results. On very common street names the right CEP can be left out - correction is best-effort, not a guarantee.
- Normalization is heuristic and tuned for Brazilian addresses; tune `threshold` and `strictFields` to your tolerance.

## API reference

See [API · Verify](/en/api/verify) for full signatures.

# Providers

A provider is an object with three things: a name, how to build the URL, and how to turn the raw response into an `Address`.

## Built-in providers

```ts
import {
  viaCepProvider,
  brasilApiProvider,
  apicepProvider,
  openCepProvider,
  createGatewayProvider,
} from "@eusilvio/cep-lookup/providers";
```

| Provider | `name` | Notes |
| --- | --- | --- |
| `viaCepProvider` | `ViaCEP` | The only one with reverse search (`searchByAddress`); fills `complement` |
| `brasilApiProvider` | `BrasilAPI` | v2 endpoint; fills `location` (latitude/longitude) |
| `apicepProvider` | `ApiCEP` | Solid third in line |
| `openCepProvider` | `OpenCEP` | Lightweight alternative |
| `createGatewayProvider` | `Gateway` | Factory for your own gateway that already returns `Address` |

Use **at least two** in production. A single provider turns any of its instability into your downtime.

## Race order

The array order breaks the initial tie, but the primary for each lookup is chosen by health score - providers with an open circuit are dropped and the rest are sorted by score. See [How it works](/en/guide/how-it-works#who-the-primary-is).

## Per-provider timeout

Timeout belongs to the provider, not to the engine. The built-in providers are plain objects, so adjust with spread:

```ts
const providers = [
  { ...viaCepProvider,    timeout: 1200 },
  { ...brasilApiProvider, timeout: 1200 },
  { ...apicepProvider,    timeout: 1500 },
];
```

A provider without `timeout` relies on the fetcher's default; during `warmup()` the default is 5000ms.

## Custom provider

Any API - including an internal one - joins the race by implementing the contract:

```ts
import type { Provider, Address } from "@eusilvio/cep-lookup";

const myProvider: Provider = {
  name: "MyAPI",
  timeout: 1500,
  buildUrl: (cep) => `https://api.mycompany.com/address/${cep}`,
  transform: (raw): Address => ({
    cep: raw.postal_code,
    street: raw.street_name,
    city: raw.city_name,
    state: raw.state_code,
    neighborhood: raw.neighborhood,
    service: "MyAPI",
  }),
};

const cep = new CepLookup({ providers: [myProvider, viaCepProvider] });
```

Rules worth knowing:

- `transform` must **throw** when the response means the CEP doesn't exist. The engine normalizes that into `CepNotFoundError`, which never counts against the circuit breaker.
- The returned `cep` must be 8 digits, unmasked.
- `service` identifies the provider in events and in `Address.service`.

## Reverse search

Providers that support address search implement two optional methods:

```ts
const provider: Provider = {
  // ...
  buildSearchUrl: (state, city, street) =>
    `https://viacep.com.br/ws/${state}/${city}/${street}/json/`,
  transformSearch: (raw) => raw.map(toAddress),
};
```

That enables `searchByAddress()`:

```ts
const candidates = await cep.searchByAddress("SP", "São Paulo", "Praça da Sé");
// Address[] - city and street must each be at least 3 characters (ViaCEP requirement)
```

## Your own gateway

If you run a CEP proxy/gateway that already returns a normalized `Address`, use the factory instead of hand-writing a provider:

```ts
import { createGatewayProvider } from "@eusilvio/cep-lookup/providers";

const gateway = createGatewayProvider({ baseUrl: "https://internal.mycompany.com/cep" });
// buildUrl -> https://internal.mycompany.com/cep/v1/cep/{cep}
```

`buildUrl` only produces a URL, so an `apiKey` isn't sent automatically. Inject the header through a custom `fetcher`:

```ts
const cep = new CepLookup({
  providers: [gateway],
  fetcher: (url, signal) =>
    fetch(url, { signal, headers: { "x-api-key": process.env.CEP_GATEWAY_KEY! } })
      .then((r) => r.json()),
});
```

## Custom fetcher

The `fetcher` is global and receives `(url, signal)`. Use it to add headers, swap the HTTP client, instrument, or mock in tests:

```ts
const cep = new CepLookup({
  providers,
  fetcher: async (url, signal) => {
    const started = performance.now();
    const res = await fetch(url, { signal, headers: { "user-agent": "my-app/1.0" } });
    metrics.timing("cep.http", performance.now() - started);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});
```

The `signal` already carries the provider timeout and the `signal` you passed to `lookup()` - always forward it, or cancellation stops working.

# @eusilvio/cep-lookup

[![NPM Version](https://img.shields.io/npm/v/@eusilvio/cep-lookup.svg)](https://www.npmjs.com/package/@eusilvio/cep-lookup)
[![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/@eusilvio/cep-lookup)](https://www.npmjs.com/package/@eusilvio/cep-lookup)
[![Build Status](https://img.shields.io/github/workflow/status/eusilvio/cep-lookup/CI)](https://github.com/eusilvio/cep-lookup/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, flexible, and agnostic CEP (Brazilian postal code) lookup library written in TypeScript.

## About

`@eusilvio/cep-lookup` was created to solve address lookup from a CEP in a different way. Instead of relying on a single data source, it queries multiple services simultaneously and returns the response from the fastest one.

Its agnostic design allows it to be used in any JavaScript environment with any HTTP client, and its powerful "mapper" system allows you to format the data output exactly as you need.

## Key Features

- **Multiple Providers (Race Strategy)**: Queries multiple CEP APIs at the same time and uses the first valid response.
- **Class-Based API**: Create a reusable instance with your settings.
- **Bulk Lookups**: Efficiently look up multiple CEPs with a single method call.
- **Customizable Return Format**: Provide a `mapper` function to transform the address data into any format your application needs.
- **HTTP Client Agnostic**: You provide the fetch function, giving you full control over the requests. Defaults to global `fetch` if not provided.
- **Modular and Extensible Architecture**: Adding a new CEP data source is trivial.
- **Fully Typed**: Developed with TypeScript to ensure type safety and a great developer experience.
- **Caching**: Built-in support for caching to avoid repeated requests for the same CEP.

## Installation

```bash
npm install @eusilvio/cep-lookup
```

## How to Use

`@eusilvio/cep-lookup` is designed to be straightforward. You create a reusable instance of the `CepLookup` class with your desired settings and use its methods to look up single or multiple CEPs. The library also includes a simple in-memory cache to avoid repeated requests, which you can use or replace with your own implementation.

### Example 1: Basic Usage

```typescript
import { CepLookup, Address } from "@eusilvio/cep-lookup";
import {
  viaCepProvider,
  brasilApiProvider,
} from "@eusilvio/cep-lookup/providers";

// 1. Create an instance of CepLookup
const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
});

// 2. Look up a CEP
cepLookup.lookup("01001-000").then((address: Address) => {
  console.log("Address found:", address);
  // Output:
  // {
  //   cep: '01001-000',
  //   state: 'SP',
  //   city: 'São Paulo',
  //   neighborhood: 'Sé',
  //   street: 'Praça da Sé',
  //   service: 'ViaCEP'
  // }
});
```

### Example 2: Custom Return with `mapper`

```typescript
import { CepLookup, Address } from "@eusilvio/cep-lookup";
import { viaCepProvider } from "@eusilvio/cep-lookup/providers";

const cepLookup = new CepLookup({
  providers: [viaCepProvider],
});

// 1. Define your "mapper" function
interface CustomAddress {
  postalCode: string;
  fullAddress: string;
  source: string;
}

const myMapper = (address: Address): CustomAddress => {
  return {
    postalCode: address.cep,
    fullAddress: `${address.street}, ${address.neighborhood} - ${address.city}/${address.state}`,
    source: address.service,
  };
};

// 2. Look up a CEP with the mapper
cepLookup.lookup("01001-000", myMapper).then((customAddress: CustomAddress) => {
  console.log("Address found (custom format):", customAddress);
  // Output:
  // {
  //   postalCode: '01001-000',
  //   fullAddress: 'Praça da Sé, Sé - São Paulo/SP',
  //   source: 'ViaCEP'
  // }
});
```

### Example 3: Bulk CEP Lookup

For scenarios where you need to query multiple CEPs at once, you can use the `lookupCeps` method. It processes the CEPs in parallel with a configurable concurrency limit to avoid overwhelming the providers.

```typescript
import { CepLookup, BulkCepResult } from "@eusilvio/cep-lookup";
import {
  viaCepProvider,
  brasilApiProvider,
} from "@eusilvio/cep-lookup/providers";

const cepsToLookup = ["01001-000", "99999-999", "04538-132"];

// 1. Create an instance with your settings
const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
});

// 2. Look up multiple CEPs
cepLookup.lookupCeps(cepsToLookup, { concurrency: 2 }).then((results: BulkCepResult[]) => {
  console.log("Bulk lookup results:", results);
  // Output:
  // [
  //   {
  //     cep: '01001-000',
  //     data: { cep: '01001-000', state: 'SP', city: 'São Paulo', ... },
  //     provider: 'ViaCEP'
  //   },
  //   {
  //     cep: '99999-999',
  //     data: null,
  //     error: [Error: All providers failed to find the CEP]
  //   },
  //   {
  //     cep: '04538-132',
  //     data: { cep: '04538-132', state: 'SP', city: 'São Paulo', ... },
  //     provider: 'BrasilAPI'
  //   }
  // ]
});
```

## API

### `new CepLookup(options)`

Creates a new `CepLookup` instance.

- `options`: A configuration object.
  - `providers` (Provider[], **required**): An array of providers that will be queried.
  - `fetcher` (Fetcher, _optional_): Your asynchronous function that fetches data from a URL. Defaults to global `fetch` if not provided.
  - `cache` (Cache, _optional_): An instance of a cache that implements the `Cache` interface. Use `InMemoryCache` for a simple in-memory cache.
  - `rateLimit` ({ requests: number, per: number }, _optional_): Configures an in-memory rate limiter (e.g., `{ requests: 10, per: 1000 }` for 10 requests per second).

### `cepLookup.lookup<T = Address>(cep, mapper?): Promise<T>`

Returns a `Promise` that resolves to the address in the default format (`Address`) or in the custom format `T` if a `mapper` is provided.

- `cep` (string, **required**): The CEP to be queried.
- `mapper` ((address: Address) => T, _optional_): A function that receives the default `Address` object and transforms it into a new format `T`.

### `cepLookup.lookupCeps(ceps, options?): Promise<BulkCepResult[]>`

Looks up multiple CEPs in bulk. Returns a `Promise` that resolves to an array of `BulkCepResult` objects, one for each queried CEP.

- `ceps` (string[], **required**): An array of CEP strings to be queried.
- `options` (object, _optional_): An options object.
  - `concurrency` (number): The number of parallel requests to make. Defaults to `5`.

> **Note on Deprecated Functions:**
> Standalone `lookupCep` and `lookupCeps` functions are deprecated and will be removed in a future version. Please use the methods on a `CepLookup` instance instead.

### Observability Events API

Version 2.0.0 introduced an event-based API to monitor the library's behavior. You can listen to events to gather metrics on provider performance, latency, and errors.

```typescript
const cepLookup = new CepLookup({ providers: [...] });

// Fired for each successful provider response
cepLookup.on('success', ({ provider, cep, duration }) => {
  console.log(`[${provider}] Success for CEP ${cep} in ${duration}ms`);
  // myMetrics.timing('cep.latency', duration, { provider });
});

// Fired for each failed provider response
cepLookup.on('failure', ({ provider, cep, error }) => {
  console.error(`[${provider}] Failure for CEP ${cep}: ${error.message}`);
  // myMetrics.increment('cep.failure', { provider });
});

// Fired when a CEP is resolved from the cache
cepLookup.on('cache:hit', ({ cep }) => {
  console.log(`[Cache] CEP ${cep} found in cache.`);
  // myMetrics.increment('cep.cache_hit');
});

// The lookup call remains the same
cepLookup.lookup("01001-000");
```

## Examples

You can find more detailed examples in the `examples/` directory:

- **Basic Usage**: `examples/example.ts`
- **Bulk Lookup**: `examples/bulk-example.ts`
- **Custom Provider**: `examples/custom-provider-example.ts`
- **Node.js Usage**: `examples/node-example.ts`
- **React Component**: `examples/react-example.tsx`
- **React Hook**: `examples/react-hook-example.ts`
- **Angular Component/Service**: `examples/angular-example.ts`
- **Cache Usage**: `examples/cache-example.ts`

## Creating a Custom Provider

Your custom provider must always transform the API response to the library's default `Address` interface. The user's `mapper` will handle the final customization.

```typescript
import { Provider, Address } from "@eusilvio/cep-lookup";

const myCustomProvider: Provider = {
  name: "MyCustomAPI",
  buildUrl: (cep: string) => `https://myapi.com/cep/${cep}`,
  transform: (response: any): Address => {
    // Transforms the response from "MyCustomAPI" to the "Address" format
    return {
      cep: response.postal_code,
      state: response.data.state_short,
      city: response.data.city_name,
      neighborhood: response.data.neighborhood,
      street: response.data.street_name,
      service: "MyCustomAPI",
    };
  },
};
```

## Running Tests

```bash
npm test
```

## License

Distributed under the MIT License.
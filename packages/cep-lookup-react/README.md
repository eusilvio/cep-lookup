# @eusilvio/cep-lookup-react

React hook for [`@eusilvio/cep-lookup`](https://www.npmjs.com/package/@eusilvio/cep-lookup).

Provides a flexible and easy-to-use React hook (`useCepLookup`) to look up Brazilian postal codes (CEPs), with built-in debounce, caching, and full configuration via a React Context Provider.

## Installation

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-react react
# or
yarn add @eusilvio/cep-lookup @eusilvio/cep-lookup-react react
```

## Basic Usage

Wrap your application or component tree with the `CepProvider` and use the `useCepLookup` hook anywhere inside it.

```jsx
import React from 'react';
import { CepProvider, useCepLookup } from '@eusilvio/cep-lookup-react';

const CepDisplay = () => {
  const [cep, setCep] = React.useState('01001000');
  const { address, loading, error } = useCepLookup(cep);

  return (
    <div>
      <input value={cep} onChange={(e) => setCep(e.target.value)} />
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error.message}</p>}
      {address && (
        <pre>{JSON.stringify(address, null, 2)}</pre>
      )}
    </div>
  );
};

const App = () => (
  <CepProvider>
    <CepDisplay />
  </CepProvider>
);

export default App;
```

## Advanced Configuration

You can pass any `CepLookupOptions` to the `CepProvider` to customize its behavior, such as changing providers, adding a custom cache, or setting a rate limit.

### Example: Using only the ViaCEP provider

```jsx
import { CepProvider } from '@eusilvio/cep-lookup-react';
import { viaCepProvider } from '@eusilvio/cep-lookup/providers';

const App = () => (
  <CepProvider providers={[viaCepProvider]}>
    {/* Your components here */}
  </CepProvider>
);
```

## API

### `<CepProvider />`

A React component that provides the `CepLookup` instance to its children.

**Props**

It accepts all options from `CepLookupOptions` as props:

- `providers` (optional): `Provider[]` - An array of CEP providers. Defaults to `[viaCepProvider, brasilApiProvider, apicepProvider]`.
- `cache` (optional): `Cache` - A cache instance (e.g., `new InMemoryCache()`). Defaults to a new `InMemoryCache` instance.
- `rateLimit` (optional): `RateLimitOptions` - Options for rate limiting.
- `fetcher` (optional): `Fetcher` - A custom fetch implementation.

### `useCepLookup(cep: string, debounceTime?: number)`

A React hook that performs the CEP lookup.

**Parameters**

- `cep`: `string` - The CEP to look up.
- `debounceTime` (optional): `number` - The debounce time in milliseconds before the lookup is triggered. Defaults to `500`.

**Returns**

An object with the following properties:

- `address`: `Address | null` - The found address object, or `null` if not found or not yet loaded.
- `loading`: `boolean` - `true` when a lookup is in progress.
- `error`: `Error | null` - An `Error` object if the lookup fails, otherwise `null`.

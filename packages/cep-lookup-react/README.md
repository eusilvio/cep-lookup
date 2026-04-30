# @eusilvio/cep-lookup-react

React hooks/provider for [`@eusilvio/cep-lookup`](https://www.npmjs.com/package/@eusilvio/cep-lookup).

## Installation

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-react react react-dom
```

## Compatibility

- React: `>= 16.8`
- Node.js (tooling/tests): `20.x`, `22.x`, `24.x`
- Core peer: `@eusilvio/cep-lookup ^2.6.0`

## Basic Usage

```tsx
import React from "react";
import { CepProvider, useCepLookup } from "@eusilvio/cep-lookup-react";

function CepField() {
  const [cep, setCep] = React.useState("01001000");
  const { address, loading, error, warmup } = useCepLookup(cep);

  return (
    <div>
      <input
        value={cep}
        onFocus={() => warmup()}
        onChange={(e) => setCep(e.target.value)}
      />
      {loading && <p>Loading...</p>}
      {error && <p>{error.message}</p>}
      {address && <pre>{JSON.stringify(address, null, 2)}</pre>}
    </div>
  );
}

export default function App() {
  return (
    <CepProvider>
      <CepField />
    </CepProvider>
  );
}
```

## Resilience Example (Provider Options)

```tsx
import { CepProvider } from "@eusilvio/cep-lookup-react";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

<CepProvider
  providers={[viaCepProvider, brasilApiProvider]}
  circuitBreaker={{ enabled: true, failureThreshold: 3, cooldownMs: 30000 }}
  retries={1}
  rateLimit={{ requests: 60, per: 60_000 }}
>
  {/* app */}
</CepProvider>
```

## Events Example

```tsx
<CepProvider
  onSuccess={({ provider, duration }) => console.log("success", provider, duration)}
  onFailure={({ provider, error }) => console.log("failure", provider, error.message)}
  onCacheHit={({ cep }) => console.log("cache hit", cep)}
>
  {/* app */}
</CepProvider>
```

## API

### `useCepLookup<T = Address>(cep: string, delay?: number)`

Returns `{ address, error, loading, warmup }`.

### `useBulkCepLookup<T = Address>(ceps: string[], options?)`

Returns `{ results, error, loading, refresh }`.

### `<CepProvider />`

Accepts `CepLookupOptions` as props (`providers`, `cache`, `rateLimit`, `retries`, `retryDelay`, `circuitBreaker`, `staggerDelay`, `fetcher`) plus:

- `mapper`
- `onSuccess`
- `onFailure`
- `onCacheHit`

## Community

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)
- [SECURITY.md](../../SECURITY.md)

## Production docs

- [Best Practices](../../docs/BEST_PRACTICES.md)
- [Cookbook](../../docs/COOKBOOK.md)

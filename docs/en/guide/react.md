# React

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-react
```

The core is a peer dependency: install both. Requires React `>= 16.8`.

## Provider

Wrap the tree with `CepProvider`. It accepts every `CepLookupOptions` field, plus event handlers and a `mapper`:

```tsx
import { CepProvider } from "@eusilvio/cep-lookup-react";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

function App() {
  return (
    <CepProvider
      providers={[viaCepProvider, brasilApiProvider, apicepProvider]}
      circuitBreaker={{ enabled: true, failureThreshold: 3, cooldownMs: 30_000 }}
      retries={1}
      retryDelay={300}
      rateLimit={{ requests: 60, per: 60_000 }}
      onFailure={({ provider, error }) => console.warn(provider, error.message)}
    >
      <AddressForm />
    </CepProvider>
  );
}
```

| Prop | Type | Note |
| --- | --- | --- |
| `providers`, `cache`, `rateLimit`, `staggerDelay`, `fetcher`, ... | `Partial<CepLookupOptions>` | any engine option |
| `mapper` | `(address: Address) => T` | reshapes what the hooks return |
| `onSuccess` | `(e: EventMap['success']) => void` | shortcut for `instance.on('success')` |
| `onFailure` | `(e: EventMap['failure']) => void` | same for failures |
| `onCacheHit` | `(e: EventMap['cache:hit']) => void` | same for cache hits |

Without a `CepProvider` in the tree, the hooks fall back to a default instance with the four bundled providers and an in-memory cache - fine for a prototype, not for production.

## useCepLookup

```tsx
import { useCepLookup } from "@eusilvio/cep-lookup-react";
import { CepNotFoundError } from "@eusilvio/cep-lookup";

function AddressForm() {
  const [cep, setCep] = useState("");
  const { address, loading, error, warmup } = useCepLookup(cep);

  useEffect(() => { warmup(); }, []); // optional: pre-rank providers

  return (
    <>
      <input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="CEP" />
      {loading && <p>Loading...</p>}
      {error instanceof CepNotFoundError && <p>CEP not found.</p>}
      {address && <p>{address.street}, {address.city} - {address.state}</p>}
    </>
  );
}
```

Signature: `useCepLookup<T = Address>(cep: string, delay = 500)`.

What the hook does for you:

- **500ms debounce** (configurable via the second argument) - typing doesn't fire eight lookups.
- **Automatic cleanup**: it only searches with exactly 8 digits; below that it clears `address` and `error`.
- **Real cancellation**: the in-flight request is aborted with an `AbortSignal` when the CEP changes or the component unmounts. A late response can never overwrite fresh state.

## useBulkCepLookup

```tsx
const { results, loading, error, refresh } = useBulkCepLookup(
  ["01001-000", "04538-133", "99999-999"],
  { concurrency: 3 },
);

results.forEach(({ cep, data, error }) => {
  if (error) console.error(`${cep}: failed`);
  else console.log(`${cep}: ${data?.street}`);
});
```

Each item is `{ cep, data, provider?, error? }` - one failing CEP doesn't take the others down. `refresh()` re-runs the current batch.

::: warning Pass a stable array
The hook fires whenever the list changes. If you build the array inline during render, memoize it with `useMemo` or keep it in state - otherwise every render schedules another batch.
:::

## Mapper: shape Address to your form

```tsx
<CepProvider
  providers={[viaCepProvider, brasilApiProvider]}
  mapper={(a) => ({ zip: a.cep, line1: a.street, town: a.city, uf: a.state })}
>
  <Form />
</CepProvider>;

// address is now { zip, line1, town, uf }
const { address } = useCepLookup<{ zip: string; line1: string; town: string; uf: string }>(cep);
```

## Reaching the instance

```tsx
import { useCepLookupInstance } from "@eusilvio/cep-lookup-react";

function ProviderHealthPanel() {
  const { instance } = useCepLookupInstance();
  const health = instance.getProviderHealth();

  return (
    <ul>
      {health.map((p) => (
        <li key={p.provider}>
          {p.provider}: {p.score} {p.isOpen ? "(circuit open)" : ""}
        </li>
      ))}
    </ul>
  );
}
```

`useCepLookupInstance()` returns `{ instance, mapper, options }` - use it to call `searchByAddress()`, `lookupCeps()`, read metrics or register events by hand.

## Manual cancellation outside the hooks

If you call the engine directly in an effect, replicate the cancellation pattern:

```tsx
useEffect(() => {
  const controller = new AbortController();
  instance.lookup(cep, { signal: controller.signal }).then(setAddress).catch(() => {});
  return () => controller.abort();
}, [cep, instance]);
```

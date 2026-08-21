# React

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-react
```

O core é peer dependency: instale os dois. Requer React `>= 16.8`.

## Provider

Envolva a árvore com `CepProvider`. Ele aceita todas as opções de `CepLookupOptions`, mais handlers de evento e um `mapper`:

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

| Prop | Tipo | Nota |
| --- | --- | --- |
| `providers`, `cache`, `rateLimit`, `staggerDelay`, `fetcher`, ... | `Partial<CepLookupOptions>` | qualquer opção do motor |
| `mapper` | `(address: Address) => T` | molda o retorno dos hooks para o seu shape |
| `onSuccess` | `(e: EventMap['success']) => void` | atalho para `instance.on('success')` |
| `onFailure` | `(e: EventMap['failure']) => void` | idem para falhas |
| `onCacheHit` | `(e: EventMap['cache:hit']) => void` | idem para cache hit |

Sem `CepProvider` na árvore, os hooks caem numa instância padrão com os quatro provedores incluídos e cache em memória - bom para protótipo, não para produção.

## useCepLookup

```tsx
import { useCepLookup } from "@eusilvio/cep-lookup-react";
import { CepNotFoundError } from "@eusilvio/cep-lookup";

function AddressForm() {
  const [cep, setCep] = useState("");
  const { address, loading, error, warmup } = useCepLookup(cep);

  useEffect(() => { warmup(); }, []); // opcional: pré-ordena provedores

  return (
    <>
      <input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="CEP" />
      {loading && <p>Buscando...</p>}
      {error instanceof CepNotFoundError && <p>CEP não encontrado.</p>}
      {address && <p>{address.street}, {address.city} - {address.state}</p>}
    </>
  );
}
```

Assinatura: `useCepLookup<T = Address>(cep: string, delay = 500)`.

O que o hook faz por você:

- **Debounce de 500ms** (configurável no segundo argumento) - o usuário digita, não dispara oito buscas.
- **Limpeza automática**: só busca quando sobram exatamente 8 dígitos; abaixo disso zera `address` e `error`.
- **Cancelamento real**: a requisição em voo é abortada com `AbortSignal` quando o CEP muda ou o componente desmonta. Resposta atrasada nunca sobrescreve estado novo.

## useBulkCepLookup

```tsx
const { results, loading, error, refresh } = useBulkCepLookup(
  ["01001-000", "04538-133", "99999-999"],
  { concurrency: 3 },
);

results.forEach(({ cep, data, error }) => {
  if (error) console.error(`${cep}: falhou`);
  else console.log(`${cep}: ${data?.street}`);
});
```

Cada item traz `{ cep, data, provider?, error? }` - um CEP que falha não derruba os demais. `refresh()` refaz a busca do lote atual.

::: warning Passe um array estável
O hook dispara sempre que a lista muda. Se você monta o array dentro do render, memoize com `useMemo` ou mantenha-o em estado - caso contrário cada render agenda uma nova busca.
:::

## Mapper: molde o Address ao seu formulário

```tsx
<CepProvider
  providers={[viaCepProvider, brasilApiProvider]}
  mapper={(a) => ({ zip: a.cep, line1: a.street, town: a.city, uf: a.state })}
>
  <Form />
</CepProvider>;

// address agora é { zip, line1, town, uf }
const { address } = useCepLookup<{ zip: string; line1: string; town: string; uf: string }>(cep);
```

## Acessando a instância

```tsx
import { useCepLookupInstance } from "@eusilvio/cep-lookup-react";

function ProviderHealthPanel() {
  const { instance } = useCepLookupInstance();
  const health = instance.getProviderHealth();

  return (
    <ul>
      {health.map((p) => (
        <li key={p.provider}>
          {p.provider}: {p.score} {p.isOpen ? "(circuito aberto)" : ""}
        </li>
      ))}
    </ul>
  );
}
```

`useCepLookupInstance()` devolve `{ instance, mapper, options }` - use para chamar `searchByAddress()`, `lookupCeps()`, ler métricas ou registrar eventos manualmente.

## Cancelamento manual fora dos hooks

Se você chamar o motor direto num efeito, replique o padrão de cancelamento:

```tsx
useEffect(() => {
  const controller = new AbortController();
  instance.lookup(cep, { signal: controller.signal }).then(setAddress).catch(() => {});
  return () => controller.abort();
}, [cep, instance]);
```

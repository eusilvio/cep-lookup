# ZIP dos EUA

`@eusilvio/zip-lookup` aplica a mesma arquitetura a códigos postais americanos: corrida entre provedores, circuit breaker, cache com stale-if-error, rate limit, eventos e métricas.

```bash
npm install @eusilvio/zip-lookup
```

## Uso

```ts
import { ZipLookup } from "@eusilvio/zip-lookup";
import { zippopotamProvider, zippopotamPlusProvider } from "@eusilvio/zip-lookup/providers";

const zip = new ZipLookup({
  providers: [zippopotamProvider, zippopotamPlusProvider],
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
});

const address = await zip.lookup("90210");
// {
//   zip: '90210',
//   city: 'Beverly Hills',
//   state: 'California',
//   stateAbbr: 'CA',
//   country: 'United States',
//   latitude: '34.0901',
//   longitude: '-118.4065',
//   service: 'Zippopotam'
// }
```

## ZipAddress

```ts
interface ZipAddress {
  zip: string;
  city: string;
  state: string;      // nome por extenso
  stateAbbr: string;  // sigla de 2 letras
  county?: string;
  country: string;
  latitude?: string;
  longitude?: string;
  timezone?: string;
  service: string;
}
```

## Provedores

```ts
import {
  zippopotamProvider,
  zippopotamPlusProvider,
  createZipcodestackProvider,
  createUspsProvider,
} from "@eusilvio/zip-lookup/providers";
```

| Provedor | Chave de API | Nota |
| --- | --- | --- |
| `zippopotamProvider` | não | gratuito, sem cadastro |
| `zippopotamPlusProvider` | não | variante com campos extras |
| `createZipcodestackProvider(apiKey)` | sim | fábrica: passe a chave |
| `createUspsProvider(apiKey)` | sim | API oficial dos Correios americanos |

```ts
const zip = new ZipLookup({
  providers: [
    zippopotamProvider,
    createZipcodestackProvider(process.env.ZIPCODESTACK_KEY!),
  ],
});
```

`ZipProvider` aceita um `fetcher` **por provedor** - útil quando uma API fala XML em vez de JSON, como a da USPS:

```ts
const provider: ZipProvider = {
  name: "MyAPI",
  buildUrl: (zip) => `https://api.example.com/zip/${zip}`,
  transform: (raw) => ({ /* ... */ }),
  fetcher: async (url, signal) => parseXml(await (await fetch(url, { signal })).text()),
};
```

## Diferenças em relação ao cep-lookup

| | `cep-lookup` | `zip-lookup` |
| --- | --- | --- |
| Classe | `CepLookup` | `ZipLookup` |
| Retorno | `Address` | `ZipAddress` |
| Erro de não encontrado | `CepNotFoundError` | `ZipNotFoundError` |
| Fallback offline | sim (mapa dos Correios) | não |
| Busca reversa | sim (ViaCEP) | não |
| Adaptadores de cache persistente | sim | apenas `InMemoryCache` |
| `fetcher` por provedor | não (só global) | sim |
| Eventos | inclui `offline:fallback` | `success`, `failure`, `cache:hit`, `cache:stale` |

O restante - `staleIfError`, `negativeCacheTtl`, coalescência, `warmup()`, `getProviderHealth()`, `getProviderMetrics()`, rate limit com `strategy` - funciona igual. Veja [Resiliência](/guide/resilience) e [Observabilidade](/guide/observability).

## Erros

```ts
import {
  ZipValidationError,      // INVALID_ZIP
  ZipNotFoundError,        // NOT_FOUND
  ProviderTimeoutError,    // TIMEOUT
  RateLimitError,          // RATE_LIMITED
  AllProvidersFailedError, // ALL_PROVIDERS_FAILED
  ProviderUnavailableError,// PROVIDER_UNAVAILABLE
} from "@eusilvio/zip-lookup";
```

# Provedores

Um provedor é um objeto com três coisas: um nome, como montar a URL e como converter a resposta bruta em `Address`.

## Provedores incluídos

```ts
import {
  viaCepProvider,
  brasilApiProvider,
  apicepProvider,
  openCepProvider,
  createGatewayProvider,
} from "@eusilvio/cep-lookup/providers";
```

| Provedor | `name` | Observações |
| --- | --- | --- |
| `viaCepProvider` | `ViaCEP` | Único com busca reversa (`searchByAddress`); preenche `complement` |
| `brasilApiProvider` | `BrasilAPI` | Endpoint v2; preenche `location` (latitude/longitude) |
| `apicepProvider` | `ApiCEP` | Terceira opção sólida |
| `openCepProvider` | `OpenCEP` | Alternativa leve |
| `createGatewayProvider` | `Gateway` | Fábrica para gateway próprio que já devolve `Address` |

Use **pelo menos dois** em produção. Um provedor só transforma qualquer instabilidade dele em indisponibilidade sua.

## Ordem da corrida

A ordem do array define o desempate inicial, mas quem escolhe o primário de cada busca é o health score - provedores com circuito aberto são removidos e o restante é ordenado por score. Veja [Como funciona](/guide/how-it-works#quem-e-o-primario).

## Timeout por provedor

O timeout é propriedade do provedor, não global. Como os provedores prontos são objetos simples, ajuste com spread:

```ts
const providers = [
  { ...viaCepProvider,    timeout: 1200 },
  { ...brasilApiProvider, timeout: 1200 },
  { ...apicepProvider,    timeout: 1500 },
];
```

Um provedor sem `timeout` usa o padrão do fetcher; no `warmup()` o padrão é 5000ms.

## Provedor customizado

Qualquer API - inclusive interna - entra na corrida implementando o contrato:

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

Regras que valem a pena conhecer:

- `transform` deve **lançar** quando a resposta indicar CEP inexistente. O motor normaliza isso para `CepNotFoundError`, que não conta para o circuit breaker.
- `cep` no retorno deve ter 8 dígitos, sem máscara.
- `service` identifica o provedor nos eventos e no `Address.service`.

## Busca reversa

Provedores que suportam busca por endereço implementam dois métodos opcionais:

```ts
const provider: Provider = {
  // ...
  buildSearchUrl: (state, city, street) =>
    `https://viacep.com.br/ws/${state}/${city}/${street}/json/`,
  transformSearch: (raw) => raw.map(toAddress),
};
```

Com isso, `searchByAddress()` passa a funcionar:

```ts
const candidatos = await cep.searchByAddress("SP", "São Paulo", "Praça da Sé");
// Address[] - cidade e rua precisam ter no mínimo 3 caracteres (exigência do ViaCEP)
```

## Gateway próprio

Se você roda um proxy/gateway de CEP que já devolve o `Address` normalizado, use a fábrica em vez de escrever um provedor à mão:

```ts
import { createGatewayProvider } from "@eusilvio/cep-lookup/providers";

const gateway = createGatewayProvider({ baseUrl: "https://internal.mycompany.com/cep" });
// buildUrl -> https://internal.mycompany.com/cep/v1/cep/{cep}
```

`buildUrl` só produz uma URL, então uma `apiKey` não é enviada automaticamente. Injete o header por um `fetcher` customizado:

```ts
const cep = new CepLookup({
  providers: [gateway],
  fetcher: (url, signal) =>
    fetch(url, { signal, headers: { "x-api-key": process.env.CEP_GATEWAY_KEY! } })
      .then((r) => r.json()),
});
```

## Fetcher customizado

O `fetcher` é global e recebe `(url, signal)`. Use para adicionar headers, trocar o cliente HTTP, instrumentar ou mockar em teste:

```ts
const cep = new CepLookup({
  providers,
  fetcher: async (url, signal) => {
    const started = performance.now();
    const res = await fetch(url, { signal, headers: { "user-agent": "meu-app/1.0" } });
    metrics.timing("cep.http", performance.now() - started);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});
```

O `signal` já vem encadeado com o timeout do provedor e com o `signal` que você passou em `lookup()` - repasse-o sempre, ou o cancelamento para de funcionar.

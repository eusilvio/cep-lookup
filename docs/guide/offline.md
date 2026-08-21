# Camada offline

O último degrau da escada de fallback. Quando todos os provedores falham, os retries acabaram e não há entrada stale utilizável, `lookup()` ainda consegue responder - sintetizando um endereço em nível de UF a partir do mapa oficial de faixas de CEP dos Correios, embutido na biblioteca (~2 KB, zero rede).

```
corrida entre provedores → retries → cache stale → fallback offline → erro
```

## Ligando o fallback

```ts
const cep = new CepLookup({ providers, offlineFallback: true });

// Internet totalmente fora, cache frio:
await cep.lookup("01310-100");
// {
//   cep: '01310100',
//   state: 'SP',
//   ddd: '11',
//   city: '', neighborhood: '', street: '',
//   service: 'offline',
//   partial: true   // ← resposta degradada: só dados de UF
// }

cep.on("offline:fallback", ({ cep }) => metrics.increment("cep.offline_fallback"));
```

Duas garantias importantes:

- um not-found genuíno **nunca** é mascarado - `CepNotFoundError` continua sendo lançado;
- o endereço parcial **nunca** é gravado no cache.

Use `address.partial` para renderizar uma UI degradada - por exemplo, manter o cálculo de frete por UF funcionando enquanto rua e número voltam a ser digitados à mão:

```ts
const address = await cep.lookup(cepDigitado);

if (address.partial) {
  form.enableManualAddress({ state: address.state });
}
```

## Inteligência de CEP sem rede

O mesmo mapa alimenta uma API síncrona e independente, importável sozinha em `@eusilvio/cep-lookup/offline` (~2 KB) - sem instanciar motor nenhum e sem tocar a rede:

```ts
import { resolveCepOffline, cepMatchesState, isCepAllocated } from "@eusilvio/cep-lookup/offline";

resolveCepOffline("01310-100");
// { cep: '01310100', state: 'SP', stateName: 'São Paulo', region: 'Sudeste',
//   capital: 'São Paulo', ddd: '11', ibgeState: '35' }

cepMatchesState("01310-100", "RJ"); // false → acusa o erro antes de qualquer requisição
isCepAllocated("00500-000");        // false → fora de toda faixa alocada, nem tente buscar
```

### Validação de formulário em 0ms

O erro clássico de checkout: o usuário cola um CEP de um estado e deixa o select de UF em outro. Isso é detectável sem rede:

```ts
import { cepMatchesState, isCepAllocated } from "@eusilvio/cep-lookup/offline";

if (!isCepAllocated(form.cep)) {
  return showError("Este CEP não existe em nenhuma faixa dos Correios.");
}

if (!cepMatchesState(form.cep, form.uf)) {
  return showError(`Este CEP não pertence a ${form.uf}.`);
}

// Só agora gaste uma chamada de rede:
const address = await cep.lookup(form.cep);
```

`isCepAllocated` também poupa buscas condenadas: faixas não alocadas jamais serão resolvidas por provedor nenhum.

## Limites do que a camada offline sabe

O mapa é de **faixas de alocação por UF**, não uma base de logradouros. Ele responde:

- a qual estado o CEP pertence;
- nome do estado, região, capital, DDD e código IBGE do estado;
- se o CEP está dentro de alguma faixa alocada.

Ele **não** responde cidade, bairro nem rua. Um CEP dentro de uma faixa alocada também pode não existir de fato - `isCepAllocated` elimina o impossível, não confirma o existente.

## Referência da API

Veja [API · Offline](/api/offline) para as assinaturas completas.

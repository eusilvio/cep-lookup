# Offline

API síncrona, sem rede, alimentada pelo mapa oficial de faixas de CEP dos Correios embutido na biblioteca (~2 KB). Importável isolada:

```ts
import {
  resolveCepOffline,
  stateFromCep,
  isCepAllocated,
  cepMatchesState,
  toPartialAddress,
} from "@eusilvio/cep-lookup/offline";
```

Também reexportada do entry point principal (`@eusilvio/cep-lookup`), caso você já use o motor.

## OfflineCepInfo

```ts
interface OfflineCepInfo {
  cep: string;        // 8 dígitos, limpo
  state: string;      // UF, ex.: "SP"
  stateName: string;  // ex.: "São Paulo"
  region: Region;     // ex.: "Sudeste"
  capital: string;    // capital do estado
  ddd: string;        // DDD da capital (nível estadual, não preciso por rua)
  ibgeState: string;  // código IBGE do estado, 2 dígitos
}
```

## resolveCepOffline

```ts
resolveCepOffline(cep: string): OfflineCepInfo | null
```

```ts
resolveCepOffline("01310-100");
// { cep: '01310100', state: 'SP', stateName: 'São Paulo', region: 'Sudeste',
//   capital: 'São Paulo', ddd: '11', ibgeState: '35' }
```

Devolve `null` quando o CEP é bem formado mas cai fora de toda faixa alocada. **Lança** `CepValidationError` se o formato for inválido.

## stateFromCep

```ts
stateFromCep(cep: string): string | null
```

Atalho para a UF:

```ts
stateFromCep("01310-100"); // "SP"
stateFromCep("00500-000"); // null
```

## isCepAllocated

```ts
isCepAllocated(cep: string): boolean
```

Diz se o CEP cai dentro de alguma faixa alocada pelos Correios. Elimina o impossível - não confirma o existente.

```ts
isCepAllocated("01310100"); // true
isCepAllocated("00500000"); // false → nenhum provedor resolveria
```

## cepMatchesState

```ts
cepMatchesState(cep: string, state: string): boolean
```

Validação cruzada CEP↔UF em 0ms - pega o erro clássico de checkout antes de qualquer requisição:

```ts
cepMatchesState("01310-100", "SP"); // true
cepMatchesState("01310-100", "RJ"); // false
```

## toPartialAddress

```ts
toPartialAddress(info: OfflineCepInfo): Address
```

Converte um `OfflineCepInfo` no `Address` parcial que o `offlineFallback` retorna:

```ts
const info = resolveCepOffline("01310-100")!;
toPartialAddress(info);
// { cep: '01310100', state: 'SP', ddd: '11',
//   city: '', neighborhood: '', street: '', service: 'offline', partial: true }
```

## Dados brutos

```ts
import { cepRanges, stateInfoByUf } from "@eusilvio/cep-lookup/offline";
import type { Region, StateInfo } from "@eusilvio/cep-lookup/offline";
```

`cepRanges` é a lista ordenada de faixas `[inicio, fim, uf]` - a busca é binária. `stateInfoByUf` mapeia cada UF para nome, região, capital e código IBGE.

## Limites

O mapa é de **alocação por UF**, não uma base de logradouros. Ele não sabe cidade, bairro nem rua, e um CEP dentro de faixa alocada ainda pode não existir de fato.

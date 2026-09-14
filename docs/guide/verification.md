# Verificação de endereço

Resolver o CEP diz onde ele fica. Não diz se o endereço que o usuário digitou bate com ele - e é nessa lacuna que nascem as entregas devolvidas: o CEP antigo que ficou no cadastro, o número do outro lado da avenida, a rua digitada no CEP de outra quadra.

`@eusilvio/cep-lookup/verify` confere o endereço campo a campo contra o CEP, entende como brasileiro escreve endereço, confere o número contra a faixa de numeração dos Correios e, quando o CEP está errado, encontra o certo.

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";
import { verifyAddress } from "@eusilvio/cep-lookup/verify";

const cep = new CepLookup({ providers: [viaCepProvider, brasilApiProvider] });

const result = await verifyAddress(cep, {
  cep: "01310-100",
  street: "Av. Paulista",
  number: "1578",
  city: "Sao Paulo",
  state: "SP",
});

result.status; // "conflict"
result.score;  // 0.8333
result.fields;
// {
//   state:  { match: "exact",      input: "SP",           expected: "SP",               similarity: 1 },
//   city:   { match: "equivalent", input: "Sao Paulo",    expected: "São Paulo",        similarity: 1 },
//   street: { match: "equivalent", input: "Av. Paulista", expected: "Avenida Paulista", similarity: 1 },
//   number: { match: "mismatch",   input: "1578",         expected: "de 612 a 1510 - lado par", similarity: 0 }
// }
result.suggestion;
// { cep: "01310200", street: "Avenida Paulista", complement: "de 1512 a 2132 - lado par",
//   neighborhood: "Bela Vista", city: "São Paulo", state: "SP", service: "ViaCEP", ... }
```

Rua e cidade batem, mas o 01310-100 só atende os números pares de 612 a 1510. O 1578 fica no 01310-200 - e a verificação encontrou isso sozinha.

Dado ruim nunca lança erro: volta como status. `verifyAddress` só rejeita em falha de infraestrutura (todos os provedores fora e sem `offlineFallback`, rate limit) ou quando o `signal` aborta.

## Status

| Status | Significa | O que fazer na UI |
| --- | --- | --- |
| `confirmed` | Tudo que dava para conferir bate | Siga; salve `suggestion`, que traz a grafia oficial |
| `plausible` | Nada contradiz o CEP, mas algo parece erro de digitação | "Você quis dizer...?" com `suggestion` |
| `conflict` | Um campo contradiz o CEP | Destaque os campos com `mismatch`; ofereça `suggestion` ou `candidates`, se vierem |
| `unverifiable` | Provedores fora, o fallback offline respondeu: só a UF foi conferida | Siga com o que foi digitado ou peça confirmação |
| `not_found` | O CEP não existe | Ofereça `suggestion` ou `candidates`, se vierem |
| `invalid` | O CEP não tem 8 dígitos | Idem |

Quando a busca de correção encontra o CEP certo, `suggestion.cep` difere de `result.cep`:

```ts
if (result.suggestion && result.suggestion.cep !== result.cep) {
  showCorrection(`O CEP deste endereço é ${result.suggestion.cep}`);
}
```

## Resultado por campo

Cada campo presente na entrada ganha um `match`:

| `match` | Quando |
| --- | --- |
| `exact` | Mesmo texto, ignorando caixa e espaços. No `number`: dentro da faixa do CEP |
| `equivalent` | Mesmo valor escrito de outro jeito: acento, abreviação, tipo ou título omitido, número por extenso, nome do estado no lugar da UF |
| `similar` | Diferente, mas acima do `threshold` (padrão 0,8): erro de digitação, outro tipo de logradouro |
| `mismatch` | Outro valor |
| `unverifiable` | O CEP não tem o dado: CEP de cidade inteira sem logradouro, CEP sem faixa de numeração |

`state`, `city`, `street` e `number` são estritos: um `mismatch` em qualquer um deles vira `conflict`. O bairro não - o nome oficial dos Correios diverge do nome popular com frequência demais ("Jardins" para "Jardim Paulista"), então um bairro diferente só rebaixa o status para `plausible`. Mude isso com `strictFields`:

```ts
await verifyAddress(cep, endereco, {
  strictFields: ["state", "city", "neighborhood", "street", "number"],
});
```

`fields` marca só o que foi conferido: um `confirmed` com `number: { match: "unverifiable" }` significa que o CEP atende a rua inteira, não que o número foi validado. Se a sua operação exige número conferido, cheque `result.fields.number?.match === "exact"`.

## Como brasileiro escreve endereço

A comparação normaliza os dois lados antes de medir diferenças:

| Digitado | Casa com |
| --- | --- |
| `Av. Brig. Faria Lima` | `Avenida Brigadeiro Faria Lima` |
| `Faria Lima` | `Avenida Brigadeiro Faria Lima` (tipo e título omitidos) |
| `R. XV de Novembro`, `Rua 15 de Novembro` | `Rua Quinze de Novembro` |
| `Av. N. Sra. de Copacabana` | `Avenida Nossa Senhora de Copacabana` |
| `Rua Vinte e Cinco de Março` | `Rua 25 de Março` |
| `sao paulo`, `Estado de São Paulo` | `SP` |
| `Jardim Imperador` | `Jardim Imperador (Zona Leste)` |

E evita os falsos positivos que importam: `Rua 7 de Setembro` não é `Rua 17 de Setembro`, `Rua Paulista` é só parecida com `Avenida Paulista` (`similar`, nunca `equivalent`) e `Mato Grosso` nunca passa por `MS`.

A mesma normalização está exposta para chaves de deduplicação e índices de busca:

```ts
import { normalizeAddressText } from "@eusilvio/cep-lookup/verify";

normalizeAddressText("Av. Brig. Faria Lima");   // "avenida brigadeiro faria lima"
normalizeAddressText("Rua Quinze de Novembro"); // "rua 15 novembro"
```

## Número contra a faixa dos Correios

Avenidas longas têm um CEP por trecho e por lado. O ViaCEP e o OpenCEP devolvem essa faixa no `complement`, e a verificação confere o número contra ela:

| Faixa | Atende |
| --- | --- |
| `de 612 a 1510 - lado par` | pares de 612 a 1510 |
| `até 609 - lado ímpar` | ímpares até 609 |
| `de 0896/897 a 1598/1599` | pares de 896 a 1598 e ímpares de 897 a 1599 |
| `de 3252 ao fim - lado par` | pares a partir de 3252 |
| `2064` | só o número 2064 (CEP exclusivo de grande usuário) |

Quando quem respondeu foi um provedor que não devolve complemento (BrasilAPI, provedores customizados), a faixa vem de uma busca reversa pela própria rua do CEP. As mesmas funções estão disponíveis soltas:

```ts
import { parseNumberRange, isNumberInRange } from "@eusilvio/cep-lookup/verify";

const range = parseNumberRange("de 612 a 1510 - lado par");
// { kind: "range", min: 612, max: 1510, side: "even" }

isNumberInRange(1578, range!); // false
```

## Correção de CEP

Quando o CEP conflita com o endereço, não existe ou está malformado, a verificação procura o logradouro digitado na cidade digitada e escolhe o CEP que atende aquele número:

```ts
const result = await verifyAddress(cep, {
  cep: "80020-310", // atende só até o 894/895
  street: "Rua 15 de Novembro",
  number: "1000",
  city: "Curitiba",
  state: "PR",
});

result.status;          // "conflict"
result.suggestion?.cep; // "80060000" - Rua XV de Novembro, de 0896/897 a 1598/1599
```

A escolha prefere uma faixa de rua a um CEP de grande usuário, desempata pelo bairro e pelo score e nunca chuta: quando mais de um CEP serve igualmente bem, `suggestion` fica vazio e `candidates` traz até cinco opções para o usuário escolher.

```ts
// Há mais de uma "Rua São Marcos" em São Paulo
const result = await verifyAddress(cep, {
  cep: "04513-080",
  street: "Rua São Marcos",
  city: "São Paulo",
  state: "SP",
});

result.suggestion; // undefined
result.candidates; // [{ cep: "05283010", neighborhood: "Residencial Sol Nascente", ... }, ...]
```

Informe o bairro e a ambiguidade some.

## Custo de rede

- **Caminho feliz: uma consulta de CEP**, com cache, circuit breaker, retries e fallback do motor.
- **Buscas reversas só quando ajudam**: uma para buscar a faixa de numeração (provedor sem complemento e número informado) e até duas para a correção (a frase completa e, se ela não encontrar nada, a palavra mais distintiva do logradouro).
- **Nenhuma busca trava a verificação**: cada uma tem `searchTimeout` (padrão 5000ms). Estourou ou falhou, a verificação volta sem aquela correção.
- **`reverseSearch: false`** desliga as buscas: nenhuma requisição além da consulta do CEP.

As buscas reversas vão direto ao provedor que implementa `searchByAddress` (o ViaCEP) e não passam pelo cache nem pelo `rateLimit` do motor.

## Sem rede: compareAddress

Já tem o endereço de referência - do seu banco, de um gateway, de uma consulta anterior? `compareAddress` faz a mesma comparação de forma síncrona, sem rede:

```ts
import { compareAddress } from "@eusilvio/cep-lookup/verify";

const result = compareAddress(
  { street: "R. Quinze de Novembro", number: 1000, city: "curitiba", state: "Paraná" },
  {
    cep: "80060000",
    state: "PR",
    city: "Curitiba",
    neighborhood: "Centro",
    street: "Rua XV de Novembro",
    complement: "de 0896/897 a 1598/1599",
    service: "ViaCEP",
  },
);

result.status; // "confirmed"
```

## Quando os provedores caem

Com `offlineFallback: true` no motor, a verificação degrada em vez de falhar: o CEP resolve em nível de UF e o status vira `unverifiable` - ou `conflict`, se a UF digitada for de outro estado. Sem fallback, a falha de infraestrutura rejeita a promise, como em `lookup()`.

## Limites

- A faixa de numeração vem do cadastro dos Correios. A maioria dos CEPs atende a rua inteira e não tem faixa: aí o número fica `unverifiable`.
- A busca reversa do ViaCEP casa palavras literais e devolve no máximo 50 resultados. Em logradouros muito comuns, o CEP certo pode ficar de fora - a correção é melhor esforço, não garantia.
- A normalização é heurística e afinada para endereços brasileiros; ajuste `threshold` e `strictFields` à sua tolerância.

## Referência da API

Veja [API · Verificação](/api/verify) para as assinaturas completas.

# Verificação

Verificação de endereço contra o CEP, com correção de CEP. Fica num subpath próprio, então o entry point principal não cresce:

```ts
import {
  verifyAddress,
  compareAddress,
  normalizeAddressText,
  parseNumberRange,
  isNumberInRange,
} from "@eusilvio/cep-lookup/verify";
```

Os tipos também são exportados de `@eusilvio/cep-lookup` (só os tipos). Guia: [Verificação de endereço](/guide/verification).

## verifyAddress

```ts
verifyAddress(
  resolver: AddressResolver,
  input: AddressInput,
  options?: VerifyOptions,
): Promise<AddressVerification>
```

Resolve o CEP pelo motor e confere o endereço digitado contra ele. Quando o CEP conflita, não existe ou está malformado, procura o CEP certo por busca reversa.

```ts
const result = await verifyAddress(cep, {
  cep: "01310-100",
  street: "Av. Paulista",
  number: "1578",
  city: "Sao Paulo",
  state: "SP",
});
// { status: "conflict", score: 0.8333, cep: "01310100", fields: { ... },
//   reference: { cep: "01310100", ... }, suggestion: { cep: "01310200", ... } }
```

**Nunca lança** por dado ruim: CEP malformado, inexistente ou divergente volta como status. **Rejeita** em falha de infraestrutura que o motor não conseguiu degradar (`AllProvidersFailedError`, `RateLimitError`) e com `AbortError` quando o `signal` aborta.

### VerifyOptions

| Opção | Tipo | Padrão | Descrição |
| --- | --- | --- | --- |
| `threshold` | `number` | `0.8` | Similaridade mínima (0 a 1) para um valor diferente contar como `similar` em vez de `mismatch` |
| `strictFields` | `VerifiableField[]` | `["state", "city", "street", "number"]` | Campos cujo `mismatch` vira `conflict` |
| `reverseSearch` | `boolean` | `true` | Permite buscas reversas: faixa de numeração e correção de CEP |
| `searchTimeout` | `number` | `5000` | Prazo, em ms, de cada busca reversa; estourou, a busca é ignorada |
| `signal` | `AbortSignal` | - | Aborta a consulta e as buscas, rejeitando a verificação |

## compareAddress

```ts
compareAddress(
  input: AddressInput,
  reference: Address,
  options?: CompareOptions, // { threshold?, strictFields? }
): AddressVerification
```

A mesma comparação contra um endereço que você já tem - síncrona, sem rede, sem busca de correção. Nunca devolve `not_found` nem `invalid`.

```ts
compareAddress({ street: "Av Paulsita" }, referencia);
// { status: "plausible", score: 0.9375,
//   fields: { street: { match: "similar", input: "Av Paulsita", expected: "Avenida Paulista", similarity: 0.9375 } },
//   suggestion: { street: "Avenida Paulista", ... } }
```

## AddressInput

```ts
interface AddressInput {
  cep?: string;             // qualquer formatação; obrigatório em verifyAddress
  state?: string;           // UF ou nome do estado
  city?: string;
  neighborhood?: string;
  street?: string;
  number?: string | number; // 1578, "1578", "1578-A"; "S/N" fica sem conferência
}
```

Só os campos presentes são conferidos. Campo vazio ou só com pontuação é ignorado. Cada campo é comparado até 200 caracteres - folga de sobra para qualquer logradouro dos Correios e um teto de custo contra payload hostil num endpoint público.

## AddressVerification

```ts
interface AddressVerification {
  status: VerificationStatus;
  score: number;          // 0 a 1, ponderado pelos campos conferidos
  cep: string;            // CEP verificado, só dígitos
  fields: Partial<Record<VerifiableField, FieldVerification>>;
  reference?: Address;    // o que o CEP resolveu; ausente em not_found e invalid
  suggestion?: Address;   // endereço para salvar; pode trazer outro CEP
  candidates?: Address[]; // no lugar de suggestion, quando vários CEPs servem igualmente
}

type VerificationStatus = "confirmed" | "plausible" | "conflict" | "unverifiable" | "not_found" | "invalid";
type VerifiableField = "state" | "city" | "neighborhood" | "street" | "number";
```

`suggestion` é o endereço do CEP com as lacunas preenchidas pela entrada - um CEP de cidade inteira não tem logradouro, então fica o digitado. Em `conflict`, `not_found` e `invalid`, só existe quando a busca de correção encontrou o CEP certo.

Peso de cada campo no `score`: logradouro 0,35, cidade 0,25, UF 0,15, número 0,15 e bairro 0,10. Campos `unverifiable` ficam fora da conta.

## FieldVerification

```ts
interface FieldVerification {
  match: FieldMatch;
  input: string;      // valor digitado, sem espaços extras
  expected: string;   // valor do CEP; no number, o texto da faixa
  similarity: number; // 0 a 1
}

type FieldMatch = "exact" | "equivalent" | "similar" | "mismatch" | "unverifiable";
```

## normalizeAddressText

```ts
normalizeAddressText(text: string): string
```

Forma canônica de um trecho de endereço: sem acento, abreviações expandidas, números em dígitos, notas entre parênteses e conectivos (de, da, do, das, dos) removidos.

```ts
normalizeAddressText("Av. Brig. Faria Lima"); // "avenida brigadeiro faria lima"
normalizeAddressText("R. XV de Novembro");    // "rua 15 novembro"
normalizeAddressText("Pça. D. Pedro 2º");     // "praca dom pedro 2"
```

## parseNumberRange

```ts
parseNumberRange(complement: string | null | undefined): NumberRange | null
```

Lê a faixa de numeração do complemento dos Correios:

```ts
type NumberRange =
  | { kind: "range"; min?: number; max?: number; side?: "even" | "odd" }
  | { kind: "building"; numbers: number[] }; // CEP exclusivo de grande usuário
```

```ts
parseNumberRange("de 612 a 1510 - lado par");  // { kind: "range", min: 612, max: 1510, side: "even" }
parseNumberRange("até 894/0895");              // { kind: "range", max: 895 }
parseNumberRange("de 3252 ao fim - lado par"); // { kind: "range", min: 3252, side: "even" }
parseNumberRange("2064");                      // { kind: "building", numbers: [2064] }
parseNumberRange("Bloco A");                   // null
```

Num par como `894/0895`, cada número é o limite de um lado da rua. Como são vizinhos, `max: 895` cobre exatamente os mesmos números.

## isNumberInRange

```ts
isNumberInRange(houseNumber: number, range: NumberRange): boolean
```

```ts
const range = parseNumberRange("de 612 a 1510 - lado par")!;

isNumberInRange(1000, range); // true
isNumberInRange(1001, range); // false - lado ímpar
isNumberInRange(1578, range); // false - fora da faixa
```

## AddressResolver

```ts
interface AddressResolver {
  lookup(cep: string, options?: LookupOptions): Promise<Address>;
  searchByAddress?(state: string, city: string, street: string, options?: SearchByAddressOptions): Promise<Address[]>;
}
```

Uma instância de `CepLookup` serve como está. Qualquer objeto com a mesma forma também - o cliente do seu próprio gateway, um mock nos testes. Sem `searchByAddress`, a verificação funciona sem buscas reversas.

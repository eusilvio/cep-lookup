# Como funciona

## O caminho de uma requisição

```
lookup("01001000")
        │
        ▼
  valida e normaliza (8 dígitos)
        │
        ▼
  cache negativo? ──► CepNotFoundError (sem rede)
        │
        ▼
  cache hit? ──► retorna (evento cache:hit)
        │
        ▼
  já existe requisição igual em voo? ──► compartilha o mesmo resultado
        │
        ▼
  ┌─────────────────────────────────────────┐
  │  Circuit breaker                        │
  │  pula provedores com openUntil > agora  │
  └──────────────┬──────────────────────────┘
                 │
       ┌─────────┴──────────┐
       ▼                    ▼
  ViaCEP (primário)   BrasilAPI (escalonado +100ms)
       │                    │
   sucesso ──────────────► resultado retornado
                            │
    falha                   │
       └──────────────────► fallback assume

  esgotou tudo? → retries → cache stale → fallback offline → erro
```

## Corrida escalonada, não paralela cega

Disparar todos os provedores ao mesmo tempo desperdiça quota de API e gera carga inútil. O motor elege um provedor primário, dispara só ele e libera os demais **em bloco** depois de `staggerDelay` (padrão 100ms) - ou imediatamente, se o primário falhar antes disso. Na prática, quando o primário está saudável, os backups quase nunca chegam a disparar.

```ts
const cep = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  staggerDelay: 150, // backups só saem 150ms depois do primário
});
```

A primeira resposta **válida** vence; assim que ela chega, as demais requisições são abortadas.

## Quem é o primário

O primário não é simplesmente o primeiro do array. A cada busca o motor:

1. remove os provedores com circuito aberto;
2. ordena os restantes por **health score** (maior primeiro);
3. usa o primeiro colocado como primário e o resto como backup.

O score é calculado assim:

```
score = taxaDeSucesso * 0.8 + (1 - min(latenciaMedia / 1000, 1)) * 0.2 - (circuitoAberto ? 1 : 0)
```

Provedor novo, sem histórico, pontua `1.0` - então **na primeira busca a ordem do array vale**, porque o empate preserva a ordem original. Conforme falhas e latências acumulam, o ranking se ajusta sozinho.

Se todos os circuitos estiverem abertos, `lookup()` falha rápido com `AllProvidersFailedError` em vez de martelar provedores que já se sabem fora.

## Warmup reordena antes da primeira busca

`warmup()` pinga todos os provedores, mede a latência real e reordena a lista base:

```ts
await cep.warmup(); // reordena pela resposta mais rápida
```

Cada provedor tem timeout próprio no warmup (`provider.timeout ?? 5000ms`), então um provedor travado nunca bloqueia os outros.

## Normalização

Todo provedor entrega um formato diferente. O `transform` de cada um converte a resposta bruta no mesmo `Address`:

```ts
interface Address {
  cep: string;          // sempre 8 dígitos, sem hífen
  state: string;        // UF
  city: string;
  neighborhood: string;
  street: string;
  service: string;      // qual provedor respondeu
  ibge?: string;
  ddd?: string;
  complement?: string;  // ViaCEP
  location?: { latitude: number; longitude: number }; // BrasilAPI v2
  partial?: boolean;    // true apenas no fallback offline
}
```

Campos string são trimados antes de sair. `service` diz qual provedor respondeu - útil para depurar diferença de dados entre APIs.

## Coalescência de requisições

Chamadas concorrentes para o mesmo CEP compartilham uma única requisição em voo, mesmo sem cache configurado:

```ts
// Uma única ida à rede acontece aqui.
await Promise.all([
  cep.lookup("01001000"),
  cep.lookup("01001000"),
  cep.lookup("01001000"),
]);
```

Cada chamador ainda recebe seu próprio resultado mapeado, se usar `mapper`.

## Custo interno

O overhead da camada de resiliência é desprezível no caminho quente (medido com [tinybench](https://github.com/tinylibs/tinybench), sem rede):

| Operação | Latência média | Throughput |
| --- | --- | --- |
| Validação de CEP (regex) | 123 ns | 10M ops/s |
| Leitura no `InMemoryCache` | 48 ns | 21M ops/s |
| `lookup()` completo com cache hit | 605 ns | 2.6M ops/s |
| Disparo de evento | 63 ns | 17M ops/s |

Rode localmente:

```bash
npx tsx benchmarks/lookup.bench.ts
```

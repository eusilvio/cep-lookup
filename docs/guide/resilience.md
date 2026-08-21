# Resiliência

Quatro mecanismos independentes protegem sua aplicação de provedores instáveis: circuit breaker, retries, rate limit e warmup.

## Circuit breaker

Cada provedor tem seu próprio circuito. Depois de N falhas consecutivas de infraestrutura, ele é isolado por um período de cooldown e nem é tentado.

```ts
const cep = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
  circuitBreaker: {
    enabled: true,          // padrão: true
    failureThreshold: 3,    // abre após 3 falhas consecutivas
    cooldownMs: 30_000,     // tenta de novo depois de 30s
  },
});
```

### Half-open: a volta é cautelosa

Quando o cooldown expira, o circuito **não** fecha de imediato. Exatamente uma requisição de sondagem é liberada:

- sonda com sucesso → circuito fecha de vez;
- sonda com falha → circuito reabre por um novo cooldown.

Isso evita o pingue-pongue clássico de circuit breakers ingênuos, que voltam a mandar 100% do tráfego para um provedor ainda doente.

### CEP inexistente não abre circuito

`CepNotFoundError` é resposta correta do provedor, não falha de infraestrutura. Ele entra em `notFoundErrors`/`failureCount` para observabilidade, mas **nunca** incrementa `consecutiveFailures` nem abre o circuito.

### Todos abertos

Se todos os circuitos estiverem abertos, `lookup()` falha rápido com `AllProvidersFailedError` contendo um `ProviderUnavailableError` por provedor - em vez de gastar timeout batendo em APIs que já se sabem fora.

## Retries

`retries` repete a **corrida inteira**, não um provedor específico. O backoff é exponencial a partir de `retryDelay`.

```ts
const cep = new CepLookup({
  providers,
  retries: 1,       // padrão: 0
  retryDelay: 300,  // padrão: 1000ms; 2ª tentativa em 300ms, 3ª em 600ms...
});
```

Fique em 1 ou 2. Mais que isso multiplica a latência do pior caso e a carga sobre provedores já em dificuldade.

Um not-found genuíno (provedor único, ou todos concordando que não existe) **não é retentado** - falha rápido com `CepNotFoundError`.

## Rate limit

Protege provedores (e sua quota) de rajadas vindas do frontend:

```ts
const cep = new CepLookup({
  providers,
  rateLimit: {
    requests: 60,
    per: 60_000,
    strategy: "wait", // "throw" (padrão) | "wait"
  },
});
```

| Estratégia | Comportamento | Quando usar |
| --- | --- | --- |
| `"throw"` | rejeita na hora com `RateLimitError` | requisição de usuário: falhe rápido e deixe a UI decidir |
| `"wait"` | segura a chamada até abrir uma vaga na janela | jobs e lotes, onde esperar é melhor que tratar erro |

## Warmup

Mede a latência real de cada provedor e reordena a lista antes da primeira busca de verdade. Chame no carregamento da página ou no cold start da função:

```ts
await cep.warmup(); // pinga todos os provedores e reordena
```

Cada provedor recebe seu próprio timeout (`provider.timeout ?? 5000ms`) com `AbortController` dedicado, então um provedor travado nunca bloqueia o warmup dos outros.

## Cancelamento

`lookup()` aceita um `AbortSignal`. Cancelar aborta as requisições em voo e rejeita a promise:

```ts
const controller = new AbortController();
const promise = cep.lookup("01001000", { signal: controller.signal });

// ex.: no unmount do componente, ou quando o usuário digita outro CEP
controller.abort();
```

A forma legada `lookup(cep, mapper)` continua funcionando sem mudanças.

## A escada completa

Com todos os mecanismos ligados, uma busca só lança erro depois de esgotar:

```
cache → coalescência → corrida → retries → cache stale → fallback offline → erro
```

Combinado assim, a única forma de a busca falhar é o CEP realmente não existir ou você não ter configurado os degraus finais:

```ts
const cep = new CepLookup({
  providers,
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
  retries: 1,
  retryDelay: 300,
  cache: new InMemoryCache({ ttl: 10 * 60_000 }),
  staleIfError: { maxAgeMs: 24 * 60 * 60_000 },
  offlineFallback: true,
});
```

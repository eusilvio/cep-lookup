# Observabilidade

Três superfícies complementares: eventos (o que acabou de acontecer), health (em quem confiar agora) e métricas (como foi o comportamento ao longo do tempo).

## Eventos

```ts
cep.on("success", ({ provider, cep, duration, address }) => {
  logger.info(`${provider} resolveu ${cep} em ${duration}ms`);
});

cep.on("failure", ({ provider, cep, duration, error }) => {
  metrics.increment("cep.failure", { provider });
});

cep.on("cache:hit", ({ cep }) => metrics.increment("cep.cache_hit"));

cep.on("cache:stale", ({ cep, address }) => {
  alerting.warn(`Servindo dado vencido para ${cep}`);
});

cep.on("offline:fallback", ({ cep, address }) => {
  metrics.increment("cep.offline_fallback");
});
```

| Evento | Payload | Significado |
| --- | --- | --- |
| `success` | `provider`, `cep`, `duration`, `address` | provedor respondeu e venceu a corrida |
| `failure` | `provider`, `cep`, `duration`, `error` | provedor falhou (inclui timeout e not-found) |
| `cache:hit` | `cep` | resolvido pelo cache, sem rede |
| `cache:stale` | `cep`, `address` | todos fora; serviu entrada vencida |
| `offline:fallback` | `cep`, `address` | todos fora e sem cache; sintetizou UF+DDD |

Remova com `off(evento, listener)`. Um listener que lança **não** quebra o fluxo da busca: o erro é engolido e reportado ao `logger.debug`, se houver logger configurado.

Os três últimos eventos são os que merecem alerta: cada um marca um degrau a mais de degradação.

## Health por provedor

```ts
cep.getProviderHealth();
// [
//   { provider: 'ViaCEP',    score: 0.96, isOpen: false, avgLatencyMs: 48,  p95LatencyMs: 92,  successCount: 24, failureCount: 1, consecutiveFailures: 0 },
//   { provider: 'BrasilAPI', score: 0.91, isOpen: false, avgLatencyMs: 113, p95LatencyMs: 210, successCount: 18, failureCount: 2, consecutiveFailures: 0 },
//   { provider: 'ApiCEP',    score: 0.00, isOpen: true,  avgLatencyMs: 0,   p95LatencyMs: 0,   successCount: 0,  failureCount: 3, consecutiveFailures: 3 },
// ]
```

O retorno vem ordenado por score, do mais saudável para o menos. O cálculo:

```
score = taxaDeSucesso * 0.8 + (1 - min(latenciaMedia / 1000, 1)) * 0.2 - (circuitoAberto ? 1 : 0)
```

Circuito aberto zera (ou negativa) o score, e o provedor é pulado na próxima busca.

## Métricas em runtime

```ts
cep.getProviderMetrics();
// [
//   { provider: 'ViaCEP',    requests: 25, successes: 24, failures: 1, timeoutErrors: 0, notFoundErrors: 1, avgLatencyMs: 48,  p95LatencyMs: 92  },
//   { provider: 'BrasilAPI', requests: 20, successes: 18, failures: 2, timeoutErrors: 1, notFoundErrors: 0, avgLatencyMs: 113, p95LatencyMs: 210 },
// ]
```

## Latência: EWMA e p95

`avgLatencyMs` é uma **média móvel exponencialmente ponderada** - amostras recentes pesam mais que antigas, então uma degradação aparece rápido em vez de ficar diluída no histórico.

`p95LatencyMs` é o percentil 95 aproximado sobre as últimas ~50 amostras de cada provedor. É ele que denuncia a cauda lenta: um provedor com média de 90ms e p95 de 1400ms está falhando para 1 usuário a cada 20, mesmo parecendo saudável na média.

## Endpoint interno

Exponha os dois snapshots para acompanhar SLA de provedor ao longo do tempo:

```ts
app.get("/internal/cep-health", (_req, res) => {
  res.json({
    health: cep.getProviderHealth(),
    metrics: cep.getProviderMetrics(),
  });
});
```

Colete periodicamente e alerte quando:

- algum provedor ficar com `isOpen: true` por mais de alguns minutos;
- `cache:stale` ou `offline:fallback` dispararem em volume não trivial;
- o `p95LatencyMs` de um provedor subir sem que a média acompanhe.

## Logger de debug

Um logger opcional recebe eventos internos de granularidade fina (`provider:start`, `provider:success`, `provider:failure` e afins):

```ts
const cep = new CepLookup({
  providers,
  logger: { debug: (msg, data) => console.debug(msg, data) },
});
```

Útil em desenvolvimento e para investigar um incidente. Em produção, prefira os eventos.

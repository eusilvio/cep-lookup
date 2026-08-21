# Tratamento de erros

Todo erro carrega um `.code` explícito. Nada de comparar mensagem de string.

```ts
import {
  CepValidationError,      // INVALID_CEP
  CepNotFoundError,        // NOT_FOUND
  ProviderTimeoutError,    // TIMEOUT
  RateLimitError,          // RATE_LIMITED
  AllProvidersFailedError, // ALL_PROVIDERS_FAILED
  ProviderUnavailableError,// PROVIDER_UNAVAILABLE
} from "@eusilvio/cep-lookup";
```

| Erro | `code` | Quando acontece | O que fazer |
| --- | --- | --- | --- |
| `CepValidationError` | `INVALID_CEP` | não tem 8 dígitos após limpeza | erro de formulário, não chegou a ir à rede |
| `CepNotFoundError` | `NOT_FOUND` | provedores concordam que o CEP não existe | avise o usuário; não é incidente |
| `ProviderTimeoutError` | `TIMEOUT` | provedor estourou o `timeout` dele | tratado internamente; raramente chega até você |
| `RateLimitError` | `RATE_LIMITED` | limite local excedido com `strategy: "throw"` | faça backoff no cliente |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | provedor com circuito aberto | aparece dentro de `AllProvidersFailedError` |
| `AllProvidersFailedError` | `ALL_PROVIDERS_FAILED` | ninguém respondeu e nenhum fallback resolveu | degrade a UI |

## Padrão de tratamento

```ts
import { CepNotFoundError, AllProvidersFailedError, RateLimitError } from "@eusilvio/cep-lookup";

try {
  const address = await cep.lookup(input);
  preencherFormulario(address);
} catch (error) {
  if (error instanceof CepValidationError) {
    return setFieldError("cep", "Informe um CEP com 8 dígitos.");
  }
  if (error instanceof CepNotFoundError) {
    return setFieldError("cep", "CEP não encontrado.");
  }
  if (error instanceof RateLimitError) {
    return setFieldError("cep", "Muitas tentativas. Aguarde alguns segundos.");
  }
  if (error instanceof AllProvidersFailedError) {
    return habilitarEnderecoManual();
  }
  throw error;
}
```

Prefira `instanceof` no código da aplicação. Use `.code` quando o erro cruza uma fronteira de serialização - resposta HTTP, fila, log estruturado:

```ts
app.get("/cep/:cep", async (req, res) => {
  try {
    res.json(await cep.lookup(req.params.cep));
  } catch (error: any) {
    const status = { INVALID_CEP: 400, NOT_FOUND: 404, RATE_LIMITED: 429 }[error.code] ?? 502;
    res.status(status).json({ code: error.code ?? "UNKNOWN", message: error.message });
  }
});
```

## Dentro do AllProvidersFailedError

Ele agrega os erros individuais de cada provedor, já achatados - útil para logar a causa real:

```ts
catch (error) {
  if (error instanceof AllProvidersFailedError) {
    error.errors.forEach((e: any) => logger.warn({ code: e.code, message: e.message }));
  }
}
```

## Not-found tem tratamento especial

`CepNotFoundError` é resposta correta, não falha de infraestrutura. Por isso:

- não abre circuit breaker (não incrementa `consecutiveFailures`);
- não é retentado quando `retries` está configurado - falha rápido;
- não aciona `staleIfError` nem o fallback offline;
- pode ser memorizado por `negativeCacheTtl` para não repetir a busca.

## Cancelamento não é erro seu

Abortar via `AbortSignal` rejeita a promise com um `AbortError`. Em UI, isso normalmente deve ser ignorado:

```ts
try {
  await cep.lookup(valor, { signal: controller.signal });
} catch (error: any) {
  if (error.name === "AbortError") return; // esperado: o usuário digitou outro CEP
  tratar(error);
}
```

Os hooks de React e Vue já fazem esse descarte internamente.

## Erros de cache nunca vazam

Se o Redis cair, o `lookup()` não quebra: a falha vai para o `onError` do adaptador e é engolida. A busca segue para os provedores como se não houvesse cache.

```ts
new RedisCache({
  client,
  onError: (error, operation) => logger.warn({ error, operation }, "cep cache degradado"),
});
```

# Erros

Todos exportados de `@eusilvio/cep-lookup`. Cada um carrega um `.code` estável.

| Classe | `.code` | Campos extras |
| --- | --- | --- |
| `CepValidationError` | `INVALID_CEP` | - |
| `CepNotFoundError` | `NOT_FOUND` | `cep` |
| `ProviderTimeoutError` | `TIMEOUT` | `provider`, `timeout` |
| `RateLimitError` | `RATE_LIMITED` | - |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | `provider` |
| `AllProvidersFailedError` | `ALL_PROVIDERS_FAILED` | `errors` |

## CepValidationError

Lançado antes de qualquer requisição, quando o CEP não tem 8 dígitos após a limpeza.

```ts
await cep.lookup("123"); // CepValidationError
```

## CepNotFoundError

Os provedores concordam que o CEP não existe. Tratamento especial em todo o motor:

- não abre circuit breaker;
- não é retentado quando `retries` está configurado;
- não aciona `staleIfError` nem o fallback offline;
- pode ser memorizado por `negativeCacheTtl`.

## ProviderTimeoutError

Um provedor estourou o `timeout` dele. Normalmente é tratado internamente (outro provedor vence a corrida) e chega até você apenas dentro de `AllProvidersFailedError`.

## RateLimitError

O limitador local recusou a chamada. Só ocorre com `rateLimit.strategy: "throw"` - o padrão. Com `"wait"`, a chamada é segurada até abrir vaga.

## ProviderUnavailableError

O provedor está com circuito aberto. Aparece dentro de `AllProvidersFailedError` quando todos os circuitos estão abertos.

## AllProvidersFailedError

Ninguém respondeu e nenhum fallback resolveu. Agrega os erros individuais, já achatados:

```ts
catch (error) {
  if (error instanceof AllProvidersFailedError) {
    error.errors.forEach((e: any) =>
      logger.warn({ code: e.code, message: e.message }));
  }
}
```

## Por código, em fronteira de serialização

```ts
const status = { INVALID_CEP: 400, NOT_FOUND: 404, RATE_LIMITED: 429 }[error.code] ?? 502;
```

Dentro da aplicação, prefira `instanceof`. Veja [Tratamento de erros](/guide/errors) para os padrões completos.

## ZIP dos EUA

`@eusilvio/zip-lookup` espelha essa hierarquia, com `ZipValidationError` (`INVALID_ZIP`) e `ZipNotFoundError` (`NOT_FOUND`) no lugar dos equivalentes de CEP.

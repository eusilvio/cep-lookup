# Error handling

Every error carries an explicit `.code`. No string matching.

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

| Error | `code` | When it happens | What to do |
| --- | --- | --- | --- |
| `CepValidationError` | `INVALID_CEP` | not 8 digits after cleaning | form error; nothing hit the network |
| `CepNotFoundError` | `NOT_FOUND` | providers agree the CEP doesn't exist | tell the user; not an incident |
| `ProviderTimeoutError` | `TIMEOUT` | a provider blew its own `timeout` | handled internally; rarely reaches you |
| `RateLimitError` | `RATE_LIMITED` | local limit exceeded with `strategy: "throw"` | back off on the client |
| `ProviderUnavailableError` | `PROVIDER_UNAVAILABLE` | provider with an open circuit | appears inside `AllProvidersFailedError` |
| `AllProvidersFailedError` | `ALL_PROVIDERS_FAILED` | nobody answered and no fallback resolved | degrade the UI |

## Handling pattern

```ts
import { CepNotFoundError, AllProvidersFailedError, RateLimitError } from "@eusilvio/cep-lookup";

try {
  const address = await cep.lookup(input);
  fillForm(address);
} catch (error) {
  if (error instanceof CepValidationError) {
    return setFieldError("cep", "Enter an 8-digit CEP.");
  }
  if (error instanceof CepNotFoundError) {
    return setFieldError("cep", "CEP not found.");
  }
  if (error instanceof RateLimitError) {
    return setFieldError("cep", "Too many attempts. Wait a few seconds.");
  }
  if (error instanceof AllProvidersFailedError) {
    return enableManualAddress();
  }
  throw error;
}
```

Prefer `instanceof` inside application code. Use `.code` when the error crosses a serialization boundary - an HTTP response, a queue, a structured log:

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

## Inside AllProvidersFailedError

It aggregates each provider's individual error, already flattened - useful for logging the real cause:

```ts
catch (error) {
  if (error instanceof AllProvidersFailedError) {
    error.errors.forEach((e: any) => logger.warn({ code: e.code, message: e.message }));
  }
}
```

## Not-found gets special treatment

`CepNotFoundError` is a correct answer, not an infrastructure failure. Therefore it:

- never opens the circuit breaker (doesn't increment `consecutiveFailures`);
- is not retried when `retries` is configured - it fails fast;
- doesn't trigger `staleIfError` or the offline fallback;
- can be remembered via `negativeCacheTtl`.

## Cancellation isn't your error

Aborting via `AbortSignal` rejects the promise with an `AbortError`. In UI code that should usually be ignored:

```ts
try {
  await cep.lookup(value, { signal: controller.signal });
} catch (error: any) {
  if (error.name === "AbortError") return; // expected: the user typed another CEP
  handle(error);
}
```

The React and Vue hooks already discard these internally.

## Cache errors never leak

If Redis goes down, `lookup()` doesn't break: the failure goes to the adapter's `onError` and is swallowed. The lookup proceeds to the providers as if no cache existed.

```ts
new RedisCache({
  client,
  onError: (error, operation) => logger.warn({ error, operation }, "cep cache degraded"),
});
```

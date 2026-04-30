export type CepErrorCode =
  | "INVALID_CEP"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "ALL_PROVIDERS_FAILED"
  | "UNKNOWN";

export class CepValidationError extends Error {
  public readonly cep: string;
  public readonly code: CepErrorCode = "INVALID_CEP";
  constructor(cep: string) {
    super("Invalid CEP format. Use either NNNNNNNN or NNNNN-NNN.");
    this.name = "CepValidationError";
    this.cep = cep;
  }
}

export class RateLimitError extends Error {
  public readonly limit: number;
  public readonly window: number;
  public readonly code: CepErrorCode = "RATE_LIMITED";
  constructor(limit: number, window: number) {
    super(`Rate limit exceeded: ${limit} requests per ${window}ms.`);
    this.name = "RateLimitError";
    this.limit = limit;
    this.window = window;
  }
}

export class ProviderTimeoutError extends Error {
  public readonly provider: string;
  public readonly timeout: number;
  public readonly code: CepErrorCode = "TIMEOUT";
  constructor(provider: string, timeout: number) {
    super(`Timeout from ${provider}`);
    this.name = "ProviderTimeoutError";
    this.provider = provider;
    this.timeout = timeout;
  }
}

export class CepNotFoundError extends Error {
  public readonly cep: string;
  public readonly provider?: string;
  public readonly code: CepErrorCode = "NOT_FOUND";
  constructor(cep: string, provider?: string) {
    super("CEP not found");
    this.name = "CepNotFoundError";
    this.cep = cep;
    this.provider = provider;
  }
}

export class AllProvidersFailedError extends Error {
  public readonly errors: Error[];
  public readonly code: CepErrorCode = "ALL_PROVIDERS_FAILED";
  constructor(errors: Error[]) {
    super("All providers failed to resolve the CEP.");
    this.name = "AllProvidersFailedError";
    this.errors = errors;
  }
}

export class ProviderUnavailableError extends Error {
  public readonly provider: string;
  public readonly code: CepErrorCode = "PROVIDER_UNAVAILABLE";
  constructor(provider: string) {
    super(`Provider ${provider} is temporarily unavailable (circuit open).`);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
  }
}

export function normalizeProviderError(error: unknown, cep: string, provider: string): Error {
  if (error instanceof Error) {
    if (
      error instanceof CepValidationError ||
      error instanceof RateLimitError ||
      error instanceof ProviderTimeoutError ||
      error instanceof CepNotFoundError ||
      error instanceof ProviderUnavailableError ||
      error instanceof AllProvidersFailedError
    ) {
      return error;
    }

    const message = error.message?.toLowerCase?.() || "";
    if (message.includes("cep not found") || message.includes("not found") || message.includes("status: 404")) {
      return new CepNotFoundError(cep, provider);
    }
    if (error.name === "AbortError") {
      return error;
    }
    return error;
  }
  return new Error(String(error));
}

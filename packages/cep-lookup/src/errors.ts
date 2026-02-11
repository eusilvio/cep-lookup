export class CepValidationError extends Error {
  public readonly cep: string;
  constructor(cep: string) {
    super("Invalid CEP format. Use either NNNNNNNN or NNNNN-NNN.");
    this.name = "CepValidationError";
    this.cep = cep;
  }
}

export class RateLimitError extends Error {
  public readonly limit: number;
  public readonly window: number;
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
  constructor(cep: string, provider?: string) {
    super("CEP not found");
    this.name = "CepNotFoundError";
    this.cep = cep;
    this.provider = provider;
  }
}

export class AllProvidersFailedError extends Error {
  public readonly errors: Error[];
  constructor(errors: Error[]) {
    super("All providers failed to resolve the CEP.");
    this.name = "AllProvidersFailedError";
    this.errors = errors;
  }
}

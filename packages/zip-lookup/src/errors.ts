export type ZipErrorCode =
  | "INVALID_ZIP"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NOT_FOUND"
  | "PROVIDER_UNAVAILABLE"
  | "ALL_PROVIDERS_FAILED"
  | "UNKNOWN";

export class ZipValidationError extends Error {
  public readonly zip: string;
  public readonly code: ZipErrorCode = "INVALID_ZIP";
  constructor(zip: string) {
    super("Invalid ZIP code format. Use NNNNN or NNNNN-NNNN.");
    this.name = "ZipValidationError";
    this.zip = zip;
  }
}

export class RateLimitError extends Error {
  public readonly limit: number;
  public readonly window: number;
  public readonly code: ZipErrorCode = "RATE_LIMITED";
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
  public readonly code: ZipErrorCode = "TIMEOUT";
  constructor(provider: string, timeout: number) {
    super(`Timeout from ${provider}`);
    this.name = "ProviderTimeoutError";
    this.provider = provider;
    this.timeout = timeout;
  }
}

export class ZipNotFoundError extends Error {
  public readonly zip: string;
  public readonly provider?: string;
  public readonly code: ZipErrorCode = "NOT_FOUND";
  constructor(zip: string, provider?: string) {
    super("ZIP code not found");
    this.name = "ZipNotFoundError";
    this.zip = zip;
    this.provider = provider;
  }
}

export class AllProvidersFailedError extends Error {
  public readonly errors: Error[];
  public readonly code: ZipErrorCode = "ALL_PROVIDERS_FAILED";
  constructor(errors: Error[]) {
    super("All providers failed to resolve the ZIP code.");
    this.name = "AllProvidersFailedError";
    this.errors = errors;
  }
}

export class ProviderUnavailableError extends Error {
  public readonly provider: string;
  public readonly code: ZipErrorCode = "PROVIDER_UNAVAILABLE";
  constructor(provider: string) {
    super(`Provider ${provider} is temporarily unavailable (circuit open).`);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
  }
}

export function normalizeProviderError(error: unknown, zip: string, provider: string): Error {
  if (error instanceof Error) {
    if (
      error instanceof ZipValidationError ||
      error instanceof RateLimitError ||
      error instanceof ProviderTimeoutError ||
      error instanceof ZipNotFoundError ||
      error instanceof ProviderUnavailableError ||
      error instanceof AllProvidersFailedError
    ) {
      return error;
    }

    const message = error.message?.toLowerCase?.() || "";
    if (message.includes("zip not found") || message.includes("not found") || message.includes("status: 404")) {
      return new ZipNotFoundError(zip, provider);
    }
    if (error.name === "AbortError") {
      return error;
    }
    return error;
  }
  return new Error(String(error));
}

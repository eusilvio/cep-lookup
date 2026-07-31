import { CepLookup, RateLimitError } from "../src";
import { createGatewayProvider } from "../src/providers/gateway";
import { Provider, Address } from "../src/types";

describe("Block 4: createGatewayProvider", () => {
  it("should build the /v1/cep/{cep} URL from baseUrl", () => {
    const provider = createGatewayProvider({ baseUrl: "https://api.example.com" });
    expect(provider.buildUrl("01001000")).toBe("https://api.example.com/v1/cep/01001000");
  });

  it("should strip a trailing slash from baseUrl", () => {
    const provider = createGatewayProvider({ baseUrl: "https://api.example.com/" });
    expect(provider.buildUrl("01001000")).toBe("https://api.example.com/v1/cep/01001000");
  });

  it("should use a custom name when provided", () => {
    const provider = createGatewayProvider({ baseUrl: "https://api.example.com", name: "MyGateway" });
    expect(provider.name).toBe("MyGateway");
  });

  it("should transform an already-normalized Address payload", () => {
    const provider = createGatewayProvider({ baseUrl: "https://api.example.com" });
    const response = {
      cep: "01001-000",
      state: "SP",
      city: "São Paulo",
      neighborhood: "Sé",
      street: "Praça da Sé",
      ddd: "11",
    };
    const address = provider.transform(response);
    expect(address.cep).toBe("01001000");
    expect(address.service).toBe("Gateway");
    expect(address.ddd).toBe("11");
  });

  it("should throw when the gateway reports an error", () => {
    const provider = createGatewayProvider({ baseUrl: "https://api.example.com" });
    expect(() => provider.transform({ message: "CEP not found" })).toThrow("CEP not found");
  });

  it("should work end-to-end through CepLookup with a custom fetcher carrying the API key header", async () => {
    const apiKey = "secret-key";
    const provider = createGatewayProvider({ baseUrl: "https://api.example.com", apiKey });
    const seenHeaders: Record<string, string>[] = [];
    const fetcher = jest.fn().mockImplementation((url: string) => {
      seenHeaders.push({ "x-api-key": apiKey });
      return Promise.resolve({
        cep: "01001000", state: "SP", city: "São Paulo", neighborhood: "Sé", street: "Praça da Sé",
      });
    });

    const lookup = new CepLookup({ providers: [provider], fetcher });
    const address = await lookup.lookup("01001000");
    expect(address.service).toBe("Gateway");
    expect(seenHeaders[0]).toEqual({ "x-api-key": apiKey });
  });
});

describe("Block 4: rateLimit.strategy", () => {
  const mockProvider: Provider = {
    name: "Mock",
    buildUrl: (cep: string) => `http://test/${cep}`,
    transform: (r: any): Address => r,
  };
  const mockAddress = {
    cep: "01001000", state: "SP", city: "São Paulo", neighborhood: "Sé", street: "Praça da Sé", service: "Mock",
  };

  it("should default to 'throw' when the limit is exceeded", async () => {
    const fetcher = jest.fn().mockResolvedValue(mockAddress);
    const lookup = new CepLookup({
      providers: [mockProvider],
      fetcher,
      rateLimit: { requests: 1, per: 10000 },
    });

    await lookup.lookup("01001000");
    await expect(lookup.lookup("01001001")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("should hold the call until a slot frees up when strategy is 'wait'", async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn().mockResolvedValue(mockAddress);
    const lookup = new CepLookup({
      providers: [mockProvider],
      fetcher,
      rateLimit: { requests: 1, per: 1000, strategy: "wait" },
    });

    await lookup.lookup("01001000");

    let resolved = false;
    const second = lookup.lookup("01001001").then((r) => {
      resolved = true;
      return r;
    });

    // Let the pending checkRateLimit loop schedule its wait timer.
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1001);
    await second;
    expect(resolved).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it("should never throw RateLimitError when using the 'wait' strategy", async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn().mockResolvedValue(mockAddress);
    const lookup = new CepLookup({
      providers: [mockProvider],
      fetcher,
      rateLimit: { requests: 2, per: 500, strategy: "wait" },
    });

    const results: Promise<any>[] = [
      lookup.lookup("01001000"),
      lookup.lookup("01001001"),
      lookup.lookup("01001002"),
    ];

    await jest.advanceTimersByTimeAsync(2000);
    await expect(Promise.all(results)).resolves.toBeDefined();

    jest.useRealTimers();
  });
});

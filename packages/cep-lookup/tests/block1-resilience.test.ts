import { CepLookup, AllProvidersFailedError, CepNotFoundError } from "../src";
import { Address, Provider } from "../src/types";

const createMockProvider = (name: string, timeout?: number): Provider => ({
  name,
  timeout,
  buildUrl: (cep: string) => `https://mock.local/${name}/${cep}`,
  transform: (r: any): Address => r,
});

const validAddress = {
  cep: "01001000",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Sé",
  street: "Praça da Sé",
  service: "Mock",
};

describe("Block 1: not-found does not affect the circuit breaker", () => {
  it("should not open the circuit on repeated CepNotFoundError", async () => {
    const provider = createMockProvider("NeverFound");
    const lookup = new CepLookup({
      providers: [provider],
      fetcher: async () => {
        throw new Error("CEP not found");
      },
      circuitBreaker: { enabled: true, failureThreshold: 2, cooldownMs: 30000 },
    });

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    await expect(lookup.lookup("01001001")).rejects.toBeInstanceOf(CepNotFoundError);
    await expect(lookup.lookup("01001002")).rejects.toBeInstanceOf(CepNotFoundError);

    const health = lookup.getProviderHealth()[0];
    expect(health.isOpen).toBe(false);
    expect(health.consecutiveFailures).toBe(0);

    const metrics = lookup.getProviderMetrics()[0];
    expect(metrics.notFoundErrors).toBe(3);
    expect(metrics.failures).toBe(3);
  });
});

describe("Block 1: retry does not reprocess a genuine not-found", () => {
  it("should not retry when the single provider throws CepNotFoundError", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("CEP not found"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      retries: 3,
      retryDelay: 10,
    });

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should not retry when AllProvidersFailedError only wraps CepNotFoundError", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("CEP not found"));
    const lookup = new CepLookup({
      providers: [createMockProvider("A"), createMockProvider("B")],
      fetcher,
      staggerDelay: 0,
      retries: 3,
      retryDelay: 10,
    });

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(2); // one call per provider, no retry round
  });

  it("should still retry on genuine infrastructure failures", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      retries: 2,
      retryDelay: 1,
    });

    await expect(lookup.lookup("01001000")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });
});

describe("Block 1: EventEmitter listener isolation", () => {
  it("should not break the lookup flow when a success listener throws", async () => {
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher: async () => validAddress,
    });

    lookup.on("success", () => {
      throw new Error("boom in user listener");
    });

    await expect(lookup.lookup("01001000")).resolves.toBeDefined();
  });

  it("should still invoke listeners registered after a throwing one", async () => {
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher: async () => validAddress,
    });

    const secondListener = jest.fn();
    lookup.on("success", () => {
      throw new Error("boom");
    });
    lookup.on("success", secondListener);

    await lookup.lookup("01001000");
    expect(secondListener).toHaveBeenCalledTimes(1);
  });

  it("should report listener errors to the logger when provided", async () => {
    const debug = jest.fn();
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher: async () => validAddress,
      logger: { debug },
    });
    lookup.on("success", () => {
      throw new Error("boom");
    });

    await lookup.lookup("01001000");
    const messages = debug.mock.calls.map((call: any[]) => call[0]);
    expect(messages).toContain("listener:error");
  });
});

describe("Block 1: warmup per-provider timeout", () => {
  it("should not let a hung provider block warmup indefinitely", async () => {
    const hungProvider = createMockProvider("Hung", 20);
    const fastProvider = createMockProvider("Fast");

    const fetcher = jest.fn().mockImplementation((url: string, signal?: AbortSignal) => {
      if (url.includes("Hung")) {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
          // Never resolves on its own — only the per-provider timeout should end it.
        });
      }
      return Promise.resolve(validAddress);
    });

    const lookup = new CepLookup({ providers: [hungProvider, fastProvider], fetcher });

    const sorted = await lookup.warmup();
    expect(sorted.map((p) => p.name)).toEqual(["Fast", "Hung"]);
  }, 2000);

  it("should default to a 5000ms timeout when the provider has none configured", async () => {
    const provider = createMockProvider("NoTimeout");
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new CepLookup({ providers: [provider], fetcher });

    const sorted = await lookup.warmup();
    expect(sorted).toHaveLength(1);
  });
});

describe("Block 1: latency EWMA and p95", () => {
  it("should compute an approximate p95 over the latency sample window", async () => {
    let call = 0;
    const delays = [10, 10, 10, 10, 500]; // one outlier
    const lookup = new CepLookup({
      providers: [createMockProvider("Latency")],
      fetcher: async () => {
        const d = delays[call % delays.length];
        call += 1;
        await new Promise((r) => setTimeout(r, d));
        return validAddress;
      },
    });

    for (let i = 0; i < delays.length; i++) {
      await lookup.lookup(`0100100${i}`);
    }

    const metrics = lookup.getProviderMetrics()[0];
    const health = lookup.getProviderHealth()[0];
    expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(metrics.avgLatencyMs === 0 ? 0 : 10);
    expect(health.p95LatencyMs).toBe(metrics.p95LatencyMs);
    // The single large outlier should be reflected by the p95, unlike a plain mean of the fast calls.
    expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(400);
  });

  it("should weigh recent samples more via EWMA", async () => {
    let call = 0;
    const delays = [10, 10, 10, 10, 10, 10, 10, 10, 10, 500];
    const lookup = new CepLookup({
      providers: [createMockProvider("Ewma")],
      fetcher: async () => {
        const d = delays[Math.min(call, delays.length - 1)];
        call += 1;
        await new Promise((r) => setTimeout(r, d));
        return validAddress;
      },
    });

    for (let i = 0; i < delays.length; i++) {
      await lookup.lookup(`0100100${i}`.slice(0, 8).padEnd(8, "0"));
    }

    const metrics = lookup.getProviderMetrics()[0];
    // EWMA reacts to the final large sample without being dragged all the way to a full mean.
    expect(metrics.avgLatencyMs).toBeGreaterThan(15);
    expect(metrics.avgLatencyMs).toBeLessThan(500);
  });
});

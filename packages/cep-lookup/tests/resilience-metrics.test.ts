import { AllProvidersFailedError, CepLookup, CepNotFoundError } from "../src";
import { Address, Provider } from "../src/types";

const createMockProvider = (name: string, timeout?: number): Provider => ({
  name,
  timeout,
  buildUrl: (cep: string) => `https://mock.local/${name}/${cep}`,
  transform: (r: any): Address => r,
});

describe("Resilience and provider metrics", () => {
  it("should normalize not found errors as CepNotFoundError", async () => {
    const provider = createMockProvider("Mock");
    const lookup = new CepLookup({
      providers: [provider],
      fetcher: async () => {
        throw new Error("HTTP error! status: 404");
      },
    });

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
  });

  it("should open circuit after configured consecutive failures and recover after cooldown", async () => {
    jest.useFakeTimers();
    const provider = createMockProvider("Flaky");
    const lookup = new CepLookup({
      providers: [provider],
      fetcher: async () => {
        throw new Error("network down");
      },
      retries: 0,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 2,
        cooldownMs: 1000,
      },
    });

    await expect(lookup.lookup("01001000")).rejects.toThrow();
    await expect(lookup.lookup("01001001")).rejects.toThrow();

    const healthOpen = lookup.getProviderHealth()[0];
    expect(healthOpen.isOpen).toBe(true);
    expect(healthOpen.consecutiveFailures).toBeGreaterThanOrEqual(2);

    await expect(lookup.lookup("01001002")).rejects.toBeInstanceOf(AllProvidersFailedError);

    jest.advanceTimersByTime(1001);
    await expect(lookup.lookup("01001003")).rejects.toThrow();

    const healthAfterCooldown = lookup.getProviderHealth()[0];
    expect(healthAfterCooldown.isOpen).toBe(false);
    jest.useRealTimers();
  });

  it("should track provider metrics and timeout/notFound counters", async () => {
    jest.useFakeTimers();
    const timeoutProvider = createMockProvider("TimeoutProvider", 10);
    const notFoundProvider = createMockProvider("NotFoundProvider");
    const successProvider = createMockProvider("SuccessProvider");

    const lookup = new CepLookup({
      providers: [timeoutProvider, notFoundProvider, successProvider],
      staggerDelay: 0,
      fetcher: async (url: string) => {
        if (url.includes("TimeoutProvider")) {
          return new Promise((_resolve) => {
            setTimeout(() => _resolve({}), 100);
          });
        }
        if (url.includes("NotFoundProvider")) {
          throw new Error("CEP not found");
        }
        return {
          cep: "01001000",
          state: "SP",
          city: "São Paulo",
          neighborhood: "Sé",
          street: "Praça da Sé",
          service: "SuccessProvider",
        };
      },
    });

    const lookupPromise = lookup.lookup("01001000");
    jest.advanceTimersByTime(200);
    await expect(lookupPromise).resolves.toBeDefined();

    const metrics = lookup.getProviderMetrics();
    const timeoutMetrics = metrics.find((m) => m.provider === "TimeoutProvider");
    const notFoundMetrics = metrics.find((m) => m.provider === "NotFoundProvider");
    const successMetrics = metrics.find((m) => m.provider === "SuccessProvider");

    expect(timeoutMetrics?.timeoutErrors).toBeGreaterThanOrEqual(1);
    expect(notFoundMetrics?.notFoundErrors).toBeGreaterThanOrEqual(1);
    expect(successMetrics?.successes).toBeGreaterThanOrEqual(1);
    jest.useRealTimers();
  });

  it("should expose provider health score sorted from best to worst", async () => {
    const healthy = createMockProvider("Healthy");
    const flaky = createMockProvider("Flaky");
    let flakyCalls = 0;

    const lookup = new CepLookup({
      providers: [flaky, healthy],
      staggerDelay: 0,
      fetcher: async (url: string) => {
        if (url.includes("Flaky")) {
          flakyCalls += 1;
          if (flakyCalls <= 2) {
            throw new Error("random failure");
          }
        }
        return {
          cep: "01001000",
          state: "SP",
          city: "São Paulo",
          neighborhood: "Sé",
          street: "Praça da Sé",
          service: url.includes("Healthy") ? "Healthy" : "Flaky",
        };
      },
    });

    await expect(lookup.lookup("01001000")).resolves.toBeDefined();
    await expect(lookup.lookup("01001001")).resolves.toBeDefined();
    await expect(lookup.lookup("01001002")).resolves.toBeDefined();

    const health = lookup.getProviderHealth();
    expect(health[0].score).toBeGreaterThanOrEqual(health[1].score);
  });
});

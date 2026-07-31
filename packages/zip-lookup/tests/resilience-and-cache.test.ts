import { ZipLookup, ZipNotFoundError, InMemoryCache, RateLimitError } from "../src";
import { ZipCache, StaleCacheEntry } from "../src/cache";
import { ZipAddress, ZipProvider } from "../src/types";

function makeProvider(name: string, overrides: Partial<ZipProvider> = {}): ZipProvider {
  return {
    name,
    buildUrl: (zip) => `https://example.com/${name}/${zip}`,
    transform: (r: any): ZipAddress => r,
    ...overrides,
  };
}

const validAddress: ZipAddress = {
  zip: "10001",
  city: "New York City",
  state: "New York",
  stateAbbr: "NY",
  country: "United States",
  service: "Mock",
};

describe("Block 1 (zip-lookup): not-found does not affect the circuit breaker", () => {
  it("should not open the circuit on repeated ZipNotFoundError", async () => {
    const provider = makeProvider("NeverFound");
    const lookup = new ZipLookup({
      providers: [provider],
      fetcher: async () => {
        throw new Error("ZIP not found");
      },
      circuitBreaker: { enabled: true, failureThreshold: 2, cooldownMs: 30000 },
    });

    await expect(lookup.lookup("10001")).rejects.toBeInstanceOf(ZipNotFoundError);
    await expect(lookup.lookup("10002")).rejects.toBeInstanceOf(ZipNotFoundError);
    await expect(lookup.lookup("10003")).rejects.toBeInstanceOf(ZipNotFoundError);

    const health = lookup.getProviderHealth()[0];
    expect(health.isOpen).toBe(false);
    expect(health.consecutiveFailures).toBe(0);
  });
});

describe("Block 1 (zip-lookup): retry does not reprocess a genuine not-found", () => {
  it("should not retry when the provider throws ZipNotFoundError", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("ZIP not found"));
    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher,
      retries: 3,
      retryDelay: 10,
    });

    await expect(lookup.lookup("10001")).rejects.toBeInstanceOf(ZipNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should still retry on genuine infrastructure failures", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher,
      retries: 2,
      retryDelay: 1,
    });

    await expect(lookup.lookup("10001")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe("Block 1 (zip-lookup): EventEmitter listener isolation", () => {
  it("should not break the lookup flow when a listener throws", async () => {
    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher: async () => validAddress,
    });
    lookup.on("success", () => {
      throw new Error("boom");
    });

    await expect(lookup.lookup("10001")).resolves.toBeDefined();
  });
});

describe("Block 1 (zip-lookup): warmup per-provider timeout", () => {
  it("should not block warmup on a hung provider", async () => {
    const hungProvider = makeProvider("Hung", { timeout: 20 });
    const fastProvider = makeProvider("Fast");
    const fetcher = jest.fn().mockImplementation((url: string, signal?: AbortSignal) => {
      if (url.includes("Hung")) {
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      return Promise.resolve(validAddress);
    });

    const lookup = new ZipLookup({ providers: [hungProvider, fastProvider], fetcher });
    const sorted = await lookup.warmup();
    expect(sorted.map((p) => p.name)).toEqual(["Fast", "Hung"]);
  }, 2000);
});

describe("Block 1 (zip-lookup): circuit half-open probing", () => {
  it("should allow a single probe after cooldown, closing the circuit on success", async () => {
    jest.useFakeTimers();
    let shouldFail = true;
    const provider = makeProvider("Recovering");
    const lookup = new ZipLookup({
      providers: [provider],
      fetcher: async () => {
        if (shouldFail) throw new Error("network down");
        return validAddress;
      },
      circuitBreaker: { enabled: true, failureThreshold: 2, cooldownMs: 1000 },
    });

    await expect(lookup.lookup("10001")).rejects.toThrow();
    await expect(lookup.lookup("10002")).rejects.toThrow();
    expect(lookup.getProviderHealth()[0].isOpen).toBe(true);

    jest.advanceTimersByTime(1001);
    shouldFail = false;

    await expect(lookup.lookup("10003")).resolves.toBeDefined();
    expect(lookup.getProviderHealth()[0].isOpen).toBe(false);
    jest.useRealTimers();
  });
});

describe("Block 1 (zip-lookup): p95 latency", () => {
  it("should expose p95LatencyMs on health and metrics", async () => {
    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher: async () => validAddress,
    });

    await lookup.lookup("10001");
    const health = lookup.getProviderHealth()[0];
    const metrics = lookup.getProviderMetrics()[0];
    expect(typeof health.p95LatencyMs).toBe("number");
    expect(metrics.p95LatencyMs).toBe(health.p95LatencyMs);
  });
});

class AsyncMapCache implements ZipCache {
  private map = new Map<string, ZipAddress>();
  async get(key: string) { await Promise.resolve(); return this.map.get(key); }
  async set(key: string, value: ZipAddress) { await Promise.resolve(); this.map.set(key, value); }
  async clear() { await Promise.resolve(); this.map.clear(); }
  async delete(key: string) { await Promise.resolve(); this.map.delete(key); }
  async has(key: string) { await Promise.resolve(); return this.map.has(key); }
  async getStale(key: string): Promise<StaleCacheEntry | undefined> {
    await Promise.resolve();
    const value = this.map.get(key);
    return value ? { value, isStale: false } : undefined;
  }
}

describe("Block 2 (zip-lookup): async Cache contract", () => {
  it("should work end-to-end with a fully async custom cache", async () => {
    const cache = new AsyncMapCache();
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new ZipLookup({ providers: [makeProvider("Mock")], fetcher, cache });

    await lookup.lookup("10001");
    await lookup.lookup("10001");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Block 2 (zip-lookup): stale-if-error", () => {
  it("should return a stale address when all providers fail", async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCache({ ttl: 1000 });
    let shouldFail = false;
    const fetcher = jest.fn().mockImplementation(() => {
      if (shouldFail) return Promise.reject(new Error("network down"));
      return Promise.resolve(validAddress);
    });

    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher,
      cache,
      staleIfError: true,
    });

    await lookup.lookup("10001");
    shouldFail = true;
    jest.advanceTimersByTime(1001);

    const staleListener = jest.fn();
    lookup.on("cache:stale", staleListener);
    const result = await lookup.lookup("10001");
    expect(result.service).toBe("Mock");
    expect(staleListener).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("should throw when staleIfError is not configured", async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCache({ ttl: 1000 });
    let shouldFail = false;
    const fetcher = jest.fn().mockImplementation(() => {
      if (shouldFail) return Promise.reject(new Error("network down"));
      return Promise.resolve(validAddress);
    });
    const lookup = new ZipLookup({ providers: [makeProvider("Mock")], fetcher, cache });

    await lookup.lookup("10001");
    shouldFail = true;
    jest.advanceTimersByTime(1001);

    await expect(lookup.lookup("10001")).rejects.toThrow("network down");
    jest.useRealTimers();
  });
});

describe("Block 2 (zip-lookup): request coalescing", () => {
  it("should share the in-flight promise across concurrent identical lookups", async () => {
    let resolveResponse: (v: any) => void;
    const responsePromise = new Promise((resolve) => { resolveResponse = resolve; });
    const fetcher = jest.fn().mockImplementation(() => responsePromise);
    const lookup = new ZipLookup({ providers: [makeProvider("Mock")], fetcher });

    const p1 = lookup.lookup("10001");
    const p2 = lookup.lookup("10001");
    resolveResponse!(validAddress);

    await Promise.all([p1, p2]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should not coalesce different ZIPs", async () => {
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new ZipLookup({ providers: [makeProvider("Mock")], fetcher });
    await Promise.all([lookup.lookup("10001"), lookup.lookup("10002")]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("Block 2 (zip-lookup): negative caching", () => {
  it("should short-circuit subsequent lookups after a confirmed not-found", async () => {
    const cache = new AsyncMapCache();
    const fetcher = jest.fn().mockRejectedValue(new Error("ZIP not found"));
    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher,
      cache,
      negativeCacheTtl: 60000,
    });

    await expect(lookup.lookup("10001")).rejects.toBeInstanceOf(ZipNotFoundError);
    await expect(lookup.lookup("10001")).rejects.toBeInstanceOf(ZipNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("Block 2 (zip-lookup): external AbortSignal", () => {
  it("should abort an in-flight lookup", async () => {
    const controller = new AbortController();
    const fetcher = jest.fn().mockImplementation((_url: string, signal?: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });
    const lookup = new ZipLookup({ providers: [makeProvider("Mock")], fetcher });

    const promise = lookup.lookup("10001", { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("should keep supporting the legacy lookup(zip, mapper) signature", async () => {
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new ZipLookup({ providers: [makeProvider("Mock")], fetcher });
    const result = await lookup.lookup("10001", (a) => a.city.toUpperCase());
    expect(result).toBe("NEW YORK CITY");
  });
});

describe("Block 4 (zip-lookup): rateLimit.strategy = 'wait'", () => {
  it("should hold the call instead of throwing until a slot frees up", async () => {
    jest.useFakeTimers();
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher,
      rateLimit: { requests: 1, per: 1000, strategy: "wait" },
    });

    await lookup.lookup("10001");
    let resolved = false;
    const second = lookup.lookup("10002").then((r) => { resolved = true; return r; });

    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1001);
    await second;
    expect(resolved).toBe(true);
    jest.useRealTimers();
  });

  it("should still throw RateLimitError with the default 'throw' strategy", async () => {
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new ZipLookup({
      providers: [makeProvider("Mock")],
      fetcher,
      rateLimit: { requests: 1, per: 10000 },
    });

    await lookup.lookup("10001");
    await expect(lookup.lookup("10002")).rejects.toBeInstanceOf(RateLimitError);
  });
});

import { CepLookup, CepNotFoundError, AllProvidersFailedError, InMemoryCache } from "../src";
import { Cache, StaleCacheEntry } from "../src/cache";
import { Address, Provider } from "../src/types";

const createMockProvider = (name: string, timeout?: number): Provider => ({
  name,
  timeout,
  buildUrl: (cep: string) => `https://mock.local/${name}/${cep}`,
  transform: (r: any): Address => r,
});

const validAddress: Address = {
  cep: "01001000",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Sé",
  street: "Praça da Sé",
  service: "Mock",
};

/** A cache whose every method is asynchronous, to prove the engine awaits properly. */
class AsyncMapCache implements Cache {
  private map = new Map<string, Address>();

  async get(key: string): Promise<Address | undefined> {
    await Promise.resolve();
    return this.map.get(key);
  }
  async set(key: string, value: Address): Promise<void> {
    await Promise.resolve();
    this.map.set(key, value);
  }
  async clear(): Promise<void> {
    await Promise.resolve();
    this.map.clear();
  }
  async delete(key: string): Promise<void> {
    await Promise.resolve();
    this.map.delete(key);
  }
  async has(key: string): Promise<boolean> {
    await Promise.resolve();
    return this.map.has(key);
  }
  async getStale(key: string): Promise<StaleCacheEntry | undefined> {
    await Promise.resolve();
    const value = this.map.get(key);
    return value ? { value, isStale: false } : undefined;
  }
}

describe("Block 2: async Cache contract", () => {
  it("should work end-to-end with a fully async custom cache", async () => {
    const cache = new AsyncMapCache();
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher, cache });

    const first = await lookup.lookup("01001000");
    expect(first.service).toBe("Mock");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await lookup.lookup("01001000");
    expect(second.service).toBe("Mock");
    expect(fetcher).toHaveBeenCalledTimes(1); // served from the async cache
  });

  it("should emit cache:hit for an async cache too", async () => {
    const cache = new AsyncMapCache();
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher, cache });
    const hitListener = jest.fn();
    lookup.on("cache:hit", hitListener);

    await lookup.lookup("01001000");
    await lookup.lookup("01001000");

    expect(hitListener).toHaveBeenCalledWith({ cep: "01001000" });
  });
});

describe("Block 2: stale-if-error", () => {
  // Uses a real InMemoryCache with a short TTL so the entry naturally expires
  // (get() misses, getStale() still finds it) — the exact condition staleIfError targets.
  it("should return a stale cached address when all providers fail", async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCache({ ttl: 1000 });
    let shouldFail = false;
    const fetcher = jest.fn().mockImplementation(() => {
      if (shouldFail) return Promise.reject(new Error("network down"));
      return Promise.resolve(validAddress);
    });

    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      cache,
      staleIfError: true,
    });

    await lookup.lookup("01001000"); // populate cache
    shouldFail = true;
    jest.advanceTimersByTime(1001); // expire the cache entry

    const staleListener = jest.fn();
    lookup.on("cache:stale", staleListener);

    const result = await lookup.lookup("01001000");
    expect(result.service).toBe("Mock");
    expect(staleListener).toHaveBeenCalledWith(
      expect.objectContaining({ cep: "01001000", address: expect.any(Object) })
    );
    jest.useRealTimers();
  });

  it("should not serve stale data for a genuine not-found", async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCache({ ttl: 1000 });
    const fetcher = jest.fn().mockResolvedValueOnce(validAddress).mockRejectedValue(new Error("CEP not found"));

    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      cache,
      staleIfError: true,
    });

    await lookup.lookup("01001000"); // populate cache with a valid entry
    jest.advanceTimersByTime(1001); // expire it, so the next call goes to the network

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    jest.useRealTimers();
  });

  it("should throw the original error when staleIfError is disabled (default)", async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCache({ ttl: 1000 });
    let shouldFail = false;
    const fetcher = jest.fn().mockImplementation(() => {
      if (shouldFail) return Promise.reject(new Error("network down"));
      return Promise.resolve(validAddress);
    });

    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher, cache });

    await lookup.lookup("01001000");
    shouldFail = true;
    jest.advanceTimersByTime(1001);

    await expect(lookup.lookup("01001000")).rejects.toThrow("network down");
    jest.useRealTimers();
  });

  it("should respect maxAgeMs and refuse an overly old stale entry", async () => {
    jest.useFakeTimers();
    const cache = new InMemoryCache({ ttl: 100 });
    let shouldFail = false;
    const fetcher = jest.fn().mockImplementation(() => {
      if (shouldFail) return Promise.reject(new Error("network down"));
      return Promise.resolve(validAddress);
    });

    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      cache,
      staleIfError: { maxAgeMs: 500 },
    });

    await lookup.lookup("01001000");
    shouldFail = true;
    jest.advanceTimersByTime(2000); // entry is now far older than maxAgeMs

    await expect(lookup.lookup("01001000")).rejects.toThrow("network down");
    jest.useRealTimers();
  });
});

describe("Block 2: request coalescing (singleflight)", () => {
  it("should share a single in-flight request across concurrent identical lookups", async () => {
    let resolveResponse: (v: any) => void;
    const responsePromise = new Promise((resolve) => {
      resolveResponse = resolve;
    });
    const fetcher = jest.fn().mockImplementation(() => responsePromise);

    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    const p1 = lookup.lookup("01001000");
    const p2 = lookup.lookup("01001000");
    const p3 = lookup.lookup("01001000");

    resolveResponse!(validAddress);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should apply each caller's own mapper to the shared result", async () => {
    let resolveResponse: (v: any) => void;
    const responsePromise = new Promise((resolve) => {
      resolveResponse = resolve;
    });
    const fetcher = jest.fn().mockImplementation(() => responsePromise);
    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    const p1 = lookup.lookup("01001000", (a) => a.city);
    const p2 = lookup.lookup("01001000", (a) => a.state);

    resolveResponse!(validAddress);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe("São Paulo");
    expect(r2).toBe("SP");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("should not coalesce lookups for different CEPs", async () => {
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    await Promise.all([lookup.lookup("01001000"), lookup.lookup("01001001")]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("should trigger a fresh request after the previous in-flight one settles", async () => {
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    await lookup.lookup("01001000");
    await lookup.lookup("01001000");
    expect(fetcher).toHaveBeenCalledTimes(2); // no cache configured, so each call re-fetches
  });
});

describe("Block 2: negative caching", () => {
  it("should short-circuit subsequent lookups after a confirmed not-found", async () => {
    const cache = new AsyncMapCache();
    const fetcher = jest.fn().mockRejectedValue(new Error("CEP not found"));

    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      cache,
      negativeCacheTtl: 60000,
    });

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(1);

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(1); // no second network call
  });

  it("should retry the network again once the negative TTL has expired", async () => {
    jest.useFakeTimers();
    const cache = new AsyncMapCache();
    const fetcher = jest.fn().mockRejectedValue(new Error("CEP not found"));

    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      cache,
      negativeCacheTtl: 1000,
    });

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1001);

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  it("should not store a negative marker when negativeCacheTtl is not set", async () => {
    const cache = new AsyncMapCache();
    const fetcher = jest.fn().mockRejectedValue(new Error("CEP not found"));

    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher, cache });

    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    await expect(lookup.lookup("01001000")).rejects.toBeInstanceOf(CepNotFoundError);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("Block 2: external AbortSignal", () => {
  it("should abort an in-flight lookup and reject with an AbortError", async () => {
    const controller = new AbortController();
    const fetcher = jest.fn().mockImplementation((_url: string, signal?: AbortSignal) => {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    });

    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    const promise = lookup.lookup("01001000", { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("should support the legacy lookup(cep, mapper) signature unaffected by the new options object", async () => {
    const fetcher = jest.fn().mockResolvedValue(validAddress);
    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    const result = await lookup.lookup("01001000", (a) => `${a.city}/${a.state}`);
    expect(result).toBe("São Paulo/SP");
  });

  it("should not abort unrelated concurrent lookups for the same CEP", async () => {
    const controller = new AbortController();
    const fetcher = jest.fn().mockImplementation((_url: string, signal?: AbortSignal) => {
      return new Promise((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        setTimeout(() => resolve(validAddress), 20);
      });
    });

    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    const aborted = lookup.lookup("01001000", { signal: controller.signal });
    const unrelated = lookup.lookup("01001000");

    controller.abort();

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    await expect(unrelated).resolves.toBeDefined();
  });
});

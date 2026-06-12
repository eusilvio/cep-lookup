import { ZipLookup } from "../src";
import { ZipValidationError, ZipNotFoundError, AllProvidersFailedError, RateLimitError } from "../src/errors";
import { ZipAddress, ZipProvider } from "../src/types";
import { InMemoryCache } from "../src/cache";

function makeProvider(name: string, overrides: Partial<ZipProvider> = {}): ZipProvider {
  return {
    name,
    buildUrl: (zip) => `https://example.com/${zip}`,
    transform: (): ZipAddress => ({
      zip: "10001",
      city: "New York City",
      state: "New York",
      stateAbbr: "NY",
      country: "United States",
      service: name,
    }),
    ...overrides,
  };
}

function makeFetcher(response: any, delay = 0) {
  return jest.fn().mockImplementation(() =>
    new Promise((resolve) => setTimeout(() => resolve(response), delay))
  );
}

function makeFailingFetcher(error = new Error("Network error")) {
  return jest.fn().mockRejectedValue(error);
}

describe("ZipLookup", () => {
  describe("validateZip", () => {
    const provider = makeProvider("Test");

    it("accepts 5-digit ZIP", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [provider], fetcher });
      await expect(lookup.lookup("10001")).resolves.toBeDefined();
    });

    it("accepts ZIP+4 with hyphen", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [provider], fetcher });
      await expect(lookup.lookup("10001-1234")).resolves.toBeDefined();
    });

    it("accepts 9-digit ZIP without hyphen", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [provider], fetcher });
      await expect(lookup.lookup("100011234")).resolves.toBeDefined();
    });

    it("rejects invalid format", async () => {
      const lookup = new ZipLookup({ providers: [provider] });
      await expect(lookup.lookup("1234")).rejects.toBeInstanceOf(ZipValidationError);
      await expect(lookup.lookup("abcde")).rejects.toBeInstanceOf(ZipValidationError);
      await expect(lookup.lookup("10001-12")).rejects.toBeInstanceOf(ZipValidationError);
    });
  });

  describe("lookup", () => {
    it("returns address from a successful provider", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher });
      const result = await lookup.lookup("10001");
      expect(result.city).toBe("New York City");
      expect(result.stateAbbr).toBe("NY");
      expect(result.service).toBe("A");
    });

    it("falls back to secondary provider when primary fails", async () => {
      const primaryFetcher = makeFailingFetcher();
      const primary = makeProvider("Primary", { fetcher: primaryFetcher });
      const secondary = makeProvider("Secondary");
      const globalFetcher = makeFetcher({});

      const lookup = new ZipLookup({
        providers: [primary, secondary],
        fetcher: globalFetcher,
        staggerDelay: 0,
      });

      const result = await lookup.lookup("10001");
      expect(result.service).toBe("Secondary");
    });

    it("throws AllProvidersFailedError when all providers fail", async () => {
      const fetcher = makeFailingFetcher();
      const lookup = new ZipLookup({
        providers: [makeProvider("A"), makeProvider("B")],
        fetcher,
        staggerDelay: 0,
      });
      await expect(lookup.lookup("10001")).rejects.toBeInstanceOf(AllProvidersFailedError);
    });

    it("applies mapper to the result", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher });
      const result = await lookup.lookup("10001", (addr) => addr.city.toUpperCase());
      expect(result).toBe("NEW YORK CITY");
    });

    it("normalizes ZIP+4 to 5-digit before calling buildUrl", async () => {
      const buildUrl = jest.fn((zip: string) => `https://example.com/${zip}`);
      const provider = makeProvider("A", { buildUrl });
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [provider], fetcher });
      await lookup.lookup("10001-1234");
      expect(buildUrl).toHaveBeenCalledWith("10001");
    });
  });

  describe("cache", () => {
    it("returns cached address on second call", async () => {
      const fetcher = makeFetcher({});
      const cache = new InMemoryCache();
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher, cache });

      await lookup.lookup("10001");
      await lookup.lookup("10001");
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("emits cache:hit event", async () => {
      const fetcher = makeFetcher({});
      const cache = new InMemoryCache();
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher, cache });
      const listener = jest.fn();
      lookup.on("cache:hit", listener);

      await lookup.lookup("10001");
      await lookup.lookup("10001");
      expect(listener).toHaveBeenCalledWith({ zip: "10001" });
    });
  });

  describe("rateLimit", () => {
    it("throws RateLimitError when limit is exceeded", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({
        providers: [makeProvider("A")],
        fetcher,
        rateLimit: { requests: 2, per: 60000 },
      });

      await lookup.lookup("10001");
      await lookup.lookup("10002");
      await expect(lookup.lookup("10003")).rejects.toBeInstanceOf(RateLimitError);
    });
  });

  describe("events", () => {
    it("emits success event", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher });
      const listener = jest.fn();
      lookup.on("success", listener);

      await lookup.lookup("10001");
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "A", zip: "10001" })
      );
    });

    it("emits failure event when provider fails", async () => {
      const primary = makeProvider("Primary", { fetcher: makeFailingFetcher() });
      const secondary = makeProvider("Secondary");
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({
        providers: [primary, secondary],
        fetcher,
        staggerDelay: 0,
      });
      const listener = jest.fn();
      lookup.on("failure", listener);

      await lookup.lookup("10001");
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ provider: "Primary", zip: "10001" })
      );
    });

    it("removes listener with off()", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher });
      const listener = jest.fn();
      lookup.on("success", listener);
      lookup.off("success", listener);

      await lookup.lookup("10001");
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("lookupZips (bulk)", () => {
    it("resolves multiple ZIPs concurrently", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher });
      const results = await lookup.lookupZips(["10001", "90210", "60601"]);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.data !== null)).toBe(true);
    });

    it("returns error entry for failing ZIPs", async () => {
      const goodFetcher = makeFetcher({});
      const provider = makeProvider("A", {
        fetcher: jest.fn()
          .mockResolvedValueOnce({})
          .mockRejectedValue(new Error("Not found")),
      });
      const lookup = new ZipLookup({ providers: [provider], fetcher: goodFetcher, staggerDelay: 0 });
      const results = await lookup.lookupZips(["10001", "00000"]);
      expect(results[0].data).not.toBeNull();
      expect(results[1].data).toBeNull();
      expect(results[1].error).toBeDefined();
    });

    it("returns empty array for empty input", async () => {
      const lookup = new ZipLookup({ providers: [makeProvider("A")] });
      const results = await lookup.lookupZips([]);
      expect(results).toEqual([]);
    });
  });

  describe("getProviderHealth / getProviderMetrics", () => {
    it("returns health and metrics after lookups", async () => {
      const fetcher = makeFetcher({});
      const lookup = new ZipLookup({ providers: [makeProvider("A")], fetcher });
      await lookup.lookup("10001");

      const health = lookup.getProviderHealth();
      expect(health[0].provider).toBe("A");
      expect(health[0].successCount).toBe(1);

      const metrics = lookup.getProviderMetrics();
      expect(metrics[0].successes).toBe(1);
      expect(metrics[0].requests).toBe(1);
    });
  });
});

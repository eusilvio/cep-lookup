import { CepLookup, CepNotFoundError, InMemoryCache } from "../src";
import { Address, Provider } from "../src/types";

const createMockProvider = (name: string, timeout?: number): Provider => ({
  name,
  timeout,
  buildUrl: (cep: string) => `https://mock.local/${name}/${cep}`,
  transform: (r: any): Address => r,
});

const validAddress: Address = {
  cep: "01310100",
  state: "SP",
  city: "São Paulo",
  neighborhood: "Bela Vista",
  street: "Avenida Paulista",
  service: "Mock",
};

describe("offlineFallback: last resilience tier", () => {
  it("returns a partial state-level address when all providers fail", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      offlineFallback: true,
    });

    const result = await lookup.lookup("01310-100");
    expect(result).toEqual({
      cep: "01310100",
      state: "SP",
      city: "",
      neighborhood: "",
      street: "",
      service: "offline",
      ddd: "11",
      partial: true,
    });
  });

  it("is disabled by default", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({ providers: [createMockProvider("Mock")], fetcher });

    await expect(lookup.lookup("01310-100")).rejects.toThrow("network down");
  });

  it("emits the offline:fallback event with the synthesized address", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      offlineFallback: true,
    });
    const listener = jest.fn();
    lookup.on("offline:fallback", listener);

    await lookup.lookup("01310-100");

    expect(listener).toHaveBeenCalledWith({
      cep: "01310100",
      address: expect.objectContaining({ state: "SP", service: "offline", partial: true }),
    });
  });

  it("never masks a genuine not-found", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("CEP not found"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      offlineFallback: true,
    });

    await expect(lookup.lookup("01310-100")).rejects.toBeInstanceOf(CepNotFoundError);
  });

  it("prefers a stale cached address (full data) over the offline fallback", async () => {
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
      offlineFallback: true,
    });

    await lookup.lookup("01310-100"); // populate cache
    shouldFail = true;
    jest.advanceTimersByTime(1001); // expire the entry

    const result = await lookup.lookup("01310-100");
    expect(result.service).toBe("Mock"); // stale full address wins
    expect(result.partial).toBeUndefined();
    jest.useRealTimers();
  });

  it("never writes the partial address to the cache", async () => {
    const cache = new InMemoryCache();
    const setSpy = jest.spyOn(cache, "set");
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      cache,
      offlineFallback: true,
    });

    const result = await lookup.lookup("01310-100");
    expect(result.partial).toBe(true);
    expect(setSpy).not.toHaveBeenCalled();
    expect(await cache.get("01310100")).toBeUndefined();
  });

  it("still throws for a well-formed CEP outside every allocated range", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      offlineFallback: true,
    });

    await expect(lookup.lookup("00500-000")).rejects.toThrow("network down");
  });

  it("only kicks in after retries are exhausted", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      retries: 1,
      retryDelay: 1,
      offlineFallback: true,
    });

    const result = await lookup.lookup("01310-100");
    expect(result.service).toBe("offline");
    expect(fetcher).toHaveBeenCalledTimes(2); // initial attempt + 1 retry
  });

  it("answers instantly when the circuit is open (zero provider calls)", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      circuitBreaker: { enabled: true, failureThreshold: 1, cooldownMs: 60_000 },
      offlineFallback: true,
    });

    const first = await lookup.lookup("01310-100"); // trips the circuit
    expect(first.service).toBe("offline");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await lookup.lookup("20040-002"); // circuit open: no network at all
    expect(second).toEqual(expect.objectContaining({ state: "RJ", service: "offline", partial: true }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("applies the lookup mapper to the offline address", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      offlineFallback: true,
    });

    const state = await lookup.lookup("30130-010", (address) => address.state);
    expect(state).toBe("MG");
  });

  it("flows through lookupCeps so bulk operations degrade instead of erroring", async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error("network down"));
    const lookup = new CepLookup({
      providers: [createMockProvider("Mock")],
      fetcher,
      offlineFallback: true,
    });

    const results = await lookup.lookupCeps(["01310-100", "90010-000"]);
    expect(results).toHaveLength(2);
    expect(results[0].data).toEqual(expect.objectContaining({ state: "SP", partial: true }));
    expect(results[0].provider).toBe("offline");
    expect(results[1].data).toEqual(expect.objectContaining({ state: "RS", partial: true }));
  });
});

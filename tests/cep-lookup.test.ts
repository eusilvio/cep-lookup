
import { CepLookup, lookupCep, InMemoryCache } from "../src";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "../src/providers";
import { Address } from "../src/types";

describe("cep-lookup", () => {
  describe("CepLookup Class", () => {
    let originalFetch: typeof global.fetch;
    let mockFetch: jest.Mock;

    beforeEach(() => {
      originalFetch = global.fetch;
      mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cep: "01001-000",
            logradouro: "Praça da Sé",
            bairro: "Sé",
            localidade: "São Paulo",
            uf: "SP",
          }),
      });
      global.fetch = mockFetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });
    it("should return the address from the fastest provider", async () => {
      const cep = "01001-000";
      const mockFetcher = jest.fn().mockImplementation((url: string) => {
        if (url.includes("viacep")) {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001-000",
                  logradouro: "Praça da Sé",
                  bairro: "Sé",
                  localidade: "São Paulo",
                  uf: "SP",
                }),
              100
            )
          );
        } else {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001000",
                  state: "SP",
                  city: "São Paulo",
                  neighborhood: "Sé",
                  street: "Praça da Sé",
                }),
              200
            )
          );
        }
      });
      const cepLookup = new CepLookup({
        providers: [viaCepProvider, brasilApiProvider],
        fetcher: mockFetcher,
      });

      const address = await cepLookup.lookup(cep);

      expect(address.service).toBe("ViaCEP");
      expect(mockFetcher).toHaveBeenCalledTimes(2); // Both providers are called
    });

    it("should return the address with a custom mapper", async () => {
      const cep = "01001-000";
      const mockFetcher = jest.fn().mockResolvedValue({
        cep: "01001-000",
        logradouro: "Praça da Sé",
        bairro: "Sé",
        localidade: "São Paulo",
        uf: "SP",
      });
      const cepLookup = new CepLookup({
        providers: [viaCepProvider],
        fetcher: mockFetcher,
      });

      interface CustomAddress {
        postalCode: string;
        fullAddress: string;
        source: string;
      }

      const mapper = (address: Address): CustomAddress => {
        return {
          postalCode: address.cep,
          fullAddress: `${address.street}, ${address.neighborhood} - ${address.city}/${address.state}`,
          source: address.service,
        };
      };

      const customAddress = await cepLookup.lookup(cep, mapper);

      expect(customAddress).toEqual({
        postalCode: "01001-000",
        fullAddress: "Praça da Sé, Sé - São Paulo/SP",
        source: "ViaCEP",
      });
      expect(mockFetcher).toHaveBeenCalledTimes(1);
    });

    it("should throw an error for an invalid CEP", async () => {
      const cep = "12345-67";
      const cepLookup = new CepLookup({
        providers: [viaCepProvider],
        fetcher: jest.fn(),
      });

      await expect(cepLookup.lookup(cep)).rejects.toThrow(
        "Invalid CEP format. Use either NNNNNNNN or NNNNN-NNN."
      );
    });

    it("should use the default fetcher if none is provided", async () => {
      const cep = "01001-000";

      const cepLookup = new CepLookup({
        providers: [viaCepProvider],
      });

      const address = await cepLookup.lookup(cep);
      expect(address.service).toBe("ViaCEP");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith("https://viacep.com.br/ws/01001000/json/", expect.any(Object));
    });

    it("should throw a timeout error if a provider takes too long", async () => {
      jest.useFakeTimers();
      const cep = "01001-000";
      const slowProvider = {
        ...viaCepProvider,
        timeout: 50, // 50ms timeout
      };

      const mockFetcher = jest.fn().mockImplementation((url: string, signal?: AbortSignal) => {
        return new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            resolve({
              cep: "01001-000",
              logradouro: "Praça da Sé",
              bairro: "Sé",
              localidade: "São Paulo",
              uf: "SP",
            });
          }, 100); // This will take 100ms, exceeding the 50ms timeout

          signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      });

      const cepLookup = new CepLookup({
        providers: [slowProvider],
        fetcher: mockFetcher,
      });

      const lookupPromise = cepLookup.lookup(cep);

      jest.advanceTimersByTime(100); // Advance time to trigger the timeout

      await expect(lookupPromise).rejects.toThrow(
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.objectContaining({ message: "Timeout from ViaCEP" }),
          ]),
        })
      );
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    it("should abort other requests when one provider succeeds", async () => {
      jest.useFakeTimers();
      const cep = "01001-000";
      const abortSpy = jest.fn();

      const slowProvider = {
        ...brasilApiProvider,
        timeout: 200,
      };

      const fastProvider = {
        ...viaCepProvider,
        timeout: 50,
      };

      const mockFetcher = jest.fn().mockImplementation((url: string, signal?: AbortSignal) => {
        return new Promise((resolve, reject) => {
          let resolved = false;
          const delay = url.includes("viacep") ? 20 : 100; // Fast provider resolves in 20ms, slow in 100ms
          const timeoutId = setTimeout(() => {
            resolved = true; // Set flag to true when resolved
            if (url.includes("viacep")) {
              resolve({
                cep: "01001-000",
                logradouro: "Praça da Sé",
                bairro: "Sé",
                localidade: "São Paulo",
                uf: "SP",
              });
            } else {
              resolve({
                cep: "01001000",
                state: "SP",
                city: "São Paulo",
                neighborhood: "Sé",
                street: "Praça da Sé",
              });
            }
          }, delay);

          signal?.addEventListener('abort', () => {
            clearTimeout(timeoutId);
            if (!resolved) { // Only call abortSpy if the promise has not already resolved
              abortSpy(); // Spy on abort event
              reject(new DOMException('Aborted', 'AbortError'));
            }
          }, { once: true });
        });
      });

      const cepLookup = new CepLookup({
        providers: [slowProvider, fastProvider],
        fetcher: mockFetcher,
      });

      const lookupPromise = cepLookup.lookup(cep);

      jest.advanceTimersByTime(30); // Advance time enough for fastProvider to resolve

      const address = await lookupPromise;

      expect(address.service).toBe("ViaCEP");
      expect(mockFetcher).toHaveBeenCalledTimes(2); // Both requests are initiated
      expect(abortSpy).toHaveBeenCalledTimes(1); // One request should have been aborted
      jest.useRealTimers();
    });

    describe("Cache", () => {
      it("should cache the address after the first lookup", async () => {
        const cep = "01001-000";
        const mockFetcher = jest.fn().mockResolvedValue({
          cep: "01001-000",
          logradouro: "Praça da Sé",
          bairro: "Sé",
          localidade: "São Paulo",
          uf: "SP",
        });

        const cache = new InMemoryCache();
        const cepLookup = new CepLookup({
          providers: [viaCepProvider],
          fetcher: mockFetcher,
          cache,
        });

        const address = await cepLookup.lookup(cep);
        expect(address.service).toBe("ViaCEP");
        expect(mockFetcher).toHaveBeenCalledTimes(1);

        // Second lookup
        const cachedAddress = await cepLookup.lookup(cep);
        expect(cachedAddress.service).toBe("ViaCEP");
        expect(mockFetcher).toHaveBeenCalledTimes(1); // Should not be called again
      });

      it("should not cache if the cache option is not provided", async () => {
        const cep = "01001-000";
        const mockFetcher = jest.fn().mockResolvedValue({
          cep: "01001-000",
          logradouro: "Praça da Sé",
          bairro: "Sé",
          localidade: "São Paulo",
          uf: "SP",
        });

        const cepLookup = new CepLookup({
          providers: [viaCepProvider],
          fetcher: mockFetcher,
        });

        await cepLookup.lookup(cep);
        expect(mockFetcher).toHaveBeenCalledTimes(1);

        // Second lookup
        await cepLookup.lookup(cep);
        expect(mockFetcher).toHaveBeenCalledTimes(2); // Should be called again
      });

      it("should be possible to clear the cache", async () => {
        const cep = "01001-000";
        const mockFetcher = jest.fn().mockResolvedValue({
          cep: "01001-000",
          logradouro: "Praça da Sé",
          bairro: "Sé",
          localidade: "São Paulo",
          uf: "SP",
        });

        const cache = new InMemoryCache();
        const cepLookup = new CepLookup({
          providers: [viaCepProvider],
          fetcher: mockFetcher,
          cache,
        });

        await cepLookup.lookup(cep);
        expect(mockFetcher).toHaveBeenCalledTimes(1);

        cache.clear();

        // Second lookup
        await cepLookup.lookup(cep);
        expect(mockFetcher).toHaveBeenCalledTimes(2); // Should be called again
      });
    });

    describe("Observability Events", () => {
      it("should emit a 'success' event when a provider succeeds", async () => {
        const successListener = jest.fn();
        const cepLookup = new CepLookup({ providers: [viaCepProvider] });
        cepLookup.on('success', successListener);

        await cepLookup.lookup("01001-000");

        expect(successListener).toHaveBeenCalledTimes(1);
        expect(successListener).toHaveBeenCalledWith(expect.objectContaining({
          provider: "ViaCEP",
          cep: "01001000",
          address: expect.any(Object),
          duration: expect.any(Number),
        }));
      });

      it("should emit a 'failure' event when a provider fails", async () => {
        const failureListener = jest.fn();
        mockFetch.mockRejectedValue(new Error("Network Error"));

        const cepLookup = new CepLookup({ providers: [viaCepProvider] });
        cepLookup.on('failure', failureListener);

        await expect(cepLookup.lookup("01001-000")).rejects.toThrow();

        expect(failureListener).toHaveBeenCalledTimes(1);
        expect(failureListener).toHaveBeenCalledWith(expect.objectContaining({
          provider: "ViaCEP",
          cep: "01001000",
          error: expect.any(Error),
          duration: expect.any(Number),
        }));
      });

      it("should emit a 'cache:hit' event when a CEP is found in cache", async () => {
        const cache = new InMemoryCache();
        const cepLookup = new CepLookup({ providers: [viaCepProvider], cache });
        const cacheHitListener = jest.fn();
        cepLookup.on('cache:hit', cacheHitListener);

        // First lookup to populate cache
        await cepLookup.lookup("01001-000");
        expect(cacheHitListener).not.toHaveBeenCalled();

        // Second lookup
        await cepLookup.lookup("01001-000");
        expect(cacheHitListener).toHaveBeenCalledTimes(1);
        expect(cacheHitListener).toHaveBeenCalledWith({ cep: "01001000" });
      });
    });
  });

  describe("lookupCep Function (Backward Compatibility)", () => {
    it("should return the address from the fastest provider", async () => {
      jest.useFakeTimers();
      const cep = "01001-000";
      const mockFetcher = jest.fn().mockImplementation((url: string) => {
        if (url.includes("viacep")) {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001-000",
                  logradouro: "Praça da Sé",
                  bairro: "Sé",
                  localidade: "São Paulo",
                  uf: "SP",
                }),
              100
            )
          );
        } else {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  cep: "01001000",
                  state: "SP",
                  city: "São Paulo",
                  neighborhood: "Sé",
                  street: "Praça da Sé",
                }),
              200
            )
          );
        }
      });

      const lookupPromise = lookupCep({ cep, providers: [viaCepProvider, brasilApiProvider], fetcher: mockFetcher });

      jest.advanceTimersByTime(200); // Advance time enough for both providers to potentially respond

      const address = await lookupPromise;

      expect(address.service).toBe("ViaCEP");
      expect(mockFetcher).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it("should use the default fetcher if none is provided", async () => {
      const cep = "01001-000";
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            cep: "01001-000",
            logradouro: "Praça da Sé",
            bairro: "Sé",
            localidade: "São Paulo",
            uf: "SP",
          }),
      });
      global.fetch = mockFetch;

      const address = await lookupCep({ cep, providers: [viaCepProvider] });

      expect(mockFetch).toHaveBeenCalledWith("https://viacep.com.br/ws/01001000/json/", expect.any(Object));
    });

    it("should use the cache when provided", async () => {
      const cep = "01001-000";
      const mockFetcher = jest.fn().mockResolvedValue({
        cep: "01001-000",
        logradouro: "Praça da Sé",
        bairro: "Sé",
        localidade: "São Paulo",
        uf: "SP",
      });

      const cache = new InMemoryCache();

      // First lookup
      await lookupCep({ cep, providers: [viaCepProvider], fetcher: mockFetcher, cache });
      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // Second lookup
      await lookupCep({ cep, providers: [viaCepProvider], fetcher: mockFetcher, cache });
      expect(mockFetcher).toHaveBeenCalledTimes(1); // Should not be called again
    });
  });
});

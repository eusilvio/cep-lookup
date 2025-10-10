import { lookupCeps, CepLookup } from '../src';
import { Address, Provider } from '../src/types';

// Use jest.spyOn for a more robust mocking strategy
describe('lookupCeps', () => {
  let lookupSpy: jest.SpyInstance;

  const mockProviders: Provider[] = [
    {
      name: 'MockProvider',
      buildUrl: (cep: string) => `http://mock.com/${cep}`,
      transform: (response: any) => response,
    },
  ];

  afterEach(() => {
    // Restore the original spy after each test
    if (lookupSpy) {
      lookupSpy.mockRestore();
    }
  });

  it('should lookup multiple CEPs successfully', async () => {
    const ceps = ['11111111', '22222222', '33333333'];
    const mockAddresses: { [key: string]: Address } = {
      '11111111': { cep: '11111111', city: 'City A', service: 'MockProvider' } as Address,
      '22222222': { cep: '22222222', city: 'City B', service: 'MockProvider' } as Address,
      '33333333': { cep: '33333333', city: 'City C', service: 'MockProvider' } as Address,
    };

    lookupSpy = jest.spyOn(CepLookup.prototype, 'lookup').mockImplementation(async (cep: string) => {
      return Promise.resolve(mockAddresses[cep]);
    });

    const results = await lookupCeps({ ceps, providers: mockProviders });

    expect(results).toHaveLength(3);
    expect(results.map(r => r.data?.city)).toEqual(['City A', 'City B', 'City C']);
    expect(lookupSpy).toHaveBeenCalledTimes(3);
  });

  it('should handle failures for some CEPs', async () => {
    const ceps = ['11111111', '00000000', '33333333'];
    const mockAddress = { cep: '11111111', city: 'City A', service: 'MockProvider' } as Address;
    const mockError = new Error('CEP not found');

    lookupSpy = jest.spyOn(CepLookup.prototype, 'lookup').mockImplementation(async (cep: string) => {
      if (cep === '11111111') return Promise.resolve(mockAddress);
      if (cep === '33333333') return Promise.resolve({ ...mockAddress, cep: '33333333', city: 'City C' });
      return Promise.reject(mockError);
    });

    const results = await lookupCeps({ ceps, providers: mockProviders });

    expect(results).toHaveLength(3);
    const successful = results.filter(r => r.data);
    const failed = results.filter(r => r.error);

    expect(successful).toHaveLength(2);
    expect(failed).toHaveLength(1);
    expect(failed[0].cep).toBe('00000000');
    expect(failed[0].error).toBe(mockError);
  });

  it('should handle an empty array of CEPs', async () => {
    lookupSpy = jest.spyOn(CepLookup.prototype, 'lookup');
    const results = await lookupCeps({ ceps: [], providers: mockProviders });
    expect(results).toEqual([]);
    expect(lookupSpy).not.toHaveBeenCalled();
  });

  it('should respect the concurrency limit', async () => {
    const ceps = ['1', '2', '3', '4', '5'];
    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;

    lookupSpy = jest.spyOn(CepLookup.prototype, 'lookup').mockImplementation(async (cep: string) => {
      concurrentCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      await new Promise(resolve => setTimeout(resolve, 50)); // Simulate network delay
      concurrentCalls--;
      return { cep, city: `City ${cep}`, service: 'Mock' } as Address;
    });

    await lookupCeps({ ceps, providers: mockProviders, concurrency: 2 });

    expect(maxConcurrentCalls).toBe(2);
    expect(lookupSpy).toHaveBeenCalledTimes(5);
  });

  it('should use the cache and only make network requests for non-cached CEPs', async () => {
    const ceps = ['11111111', '22222222', '33333333'];
    const cachedCep = '11111111';
    const mockAddress = { cep: cachedCep, city: 'Cached City', service: 'Cache' } as Address;

    // 1. Spy on the real lookup method just to ensure it's being called.
    lookupSpy = jest.spyOn(CepLookup.prototype, 'lookup');

    // 2. Create a real cache and pre-populate it.
    const { InMemoryCache } = jest.requireActual('../src/cache');
    const cache = new InMemoryCache();
    cache.set(cachedCep, mockAddress);

    // 3. Mock the fetcher function, which is what the real lookup method uses for network calls.
    const mockFetcher = jest.fn().mockImplementation(async (url: string) => {
      // This mock will be called for non-cached CEPs.
      const cep = url.split('/').pop() || '';
      return { cep, city: `City ${cep}`, service: 'MockProvider' };
    });

    // 4. Call lookupCeps with the real cache and the mocked fetcher.
    const results = await lookupCeps({ 
      ceps, 
      providers: mockProviders, 
      cache, 
      fetcher: mockFetcher 
    });

    // 5. Assertions
    // The real lookup method should be called for all CEPs.
    expect(lookupSpy).toHaveBeenCalledTimes(3);

    // The fetcher (network call) should only be called for the 2 non-cached CEPs.
    expect(mockFetcher).toHaveBeenCalledTimes(2);

    // Verify the results are correct
    expect(results).toHaveLength(3);
    const cachedResult = results.find(r => r.cep === cachedCep);
    expect(cachedResult?.data?.city).toBe('Cached City');
    const nonCachedResult = results.find(r => r.cep === '22222222');
    expect(nonCachedResult?.data?.city).toBe('City 22222222');
  });
});

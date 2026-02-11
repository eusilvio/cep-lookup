import { CepLookup, AllProvidersFailedError } from '../src';
import { Address, Provider } from '../src/types';

const mockAddress: Address = {
  cep: '01001000',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Sé',
  street: 'Praça da Sé',
  service: 'Mock',
};

const createMockProvider = (name: string): Provider => ({
  name,
  buildUrl: (cep: string) => `http://test/${cep}`,
  transform: (r: any): Address => r,
});

describe('Retry mechanism', () => {
  it('should succeed on second attempt after first failure', async () => {
    let callCount = 0;
    const fetcher = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 1) {
        return Promise.reject(new Error('Network error'));
      }
      return Promise.resolve(mockAddress);
    });

    const lookup = new CepLookup({
      providers: [createMockProvider('Mock')],
      fetcher,
      retries: 1,
      retryDelay: 10,
    });

    const result = await lookup.lookup('01001000');
    expect(result).toEqual(mockAddress);
    expect(callCount).toBe(2);
  });

  it('should exhaust retries and throw the last error', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('Network error'));

    const lookup = new CepLookup({
      providers: [createMockProvider('Mock')],
      fetcher,
      retries: 2,
      retryDelay: 10,
    });

    await expect(lookup.lookup('01001000')).rejects.toThrow();
  });

  it('should not retry with retries: 0 (default)', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('Fail'));

    const lookup = new CepLookup({
      providers: [createMockProvider('Mock')],
      fetcher,
    });

    await expect(lookup.lookup('01001000')).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('Logger', () => {
  it('should call logger.debug at key lifecycle points', async () => {
    const debug = jest.fn();
    const fetcher = jest.fn().mockResolvedValue(mockAddress);

    const lookup = new CepLookup({
      providers: [createMockProvider('Mock')],
      fetcher,
      logger: { debug },
    });

    await lookup.lookup('01001000');

    const messages = debug.mock.calls.map((call: any[]) => call[0]);
    expect(messages).toContain('lookup:start');
    expect(messages).toContain('provider:start');
    expect(messages).toContain('provider:success');
  });

  it('should log cache:hit when cached', async () => {
    const debug = jest.fn();
    const fetcher = jest.fn().mockResolvedValue(mockAddress);
    const { InMemoryCache } = require('../src');
    const cache = new InMemoryCache();

    const lookup = new CepLookup({
      providers: [createMockProvider('Mock')],
      fetcher,
      cache,
      logger: { debug },
    });

    await lookup.lookup('01001000'); // populates cache
    debug.mockClear();
    await lookup.lookup('01001000'); // cache hit

    const messages = debug.mock.calls.map((call: any[]) => call[0]);
    expect(messages).toContain('cache:hit');
  });

  it('should not throw when no logger is provided', async () => {
    const fetcher = jest.fn().mockResolvedValue(mockAddress);

    const lookup = new CepLookup({
      providers: [createMockProvider('Mock')],
      fetcher,
    });

    await expect(lookup.lookup('01001000')).resolves.toBeDefined();
  });
});

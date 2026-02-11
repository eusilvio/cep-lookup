import { CepValidationError, RateLimitError, ProviderTimeoutError, CepNotFoundError, AllProvidersFailedError } from '../src/errors';
import { CepLookup, InMemoryCache } from '../src';
import { Address, Provider } from '../src/types';

describe('Error Classes', () => {
  it('CepValidationError should have correct properties', () => {
    const err = new CepValidationError('123');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CepValidationError);
    expect(err.name).toBe('CepValidationError');
    expect(err.cep).toBe('123');
    expect(err.message).toBe('Invalid CEP format. Use either NNNNNNNN or NNNNN-NNN.');
  });

  it('RateLimitError should have correct properties', () => {
    const err = new RateLimitError(10, 1000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.name).toBe('RateLimitError');
    expect(err.limit).toBe(10);
    expect(err.window).toBe(1000);
    expect(err.message).toBe('Rate limit exceeded: 10 requests per 1000ms.');
  });

  it('ProviderTimeoutError should have correct properties', () => {
    const err = new ProviderTimeoutError('ViaCEP', 3000);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ProviderTimeoutError);
    expect(err.name).toBe('ProviderTimeoutError');
    expect(err.provider).toBe('ViaCEP');
    expect(err.timeout).toBe(3000);
    expect(err.message).toBe('Timeout from ViaCEP');
  });

  it('CepNotFoundError should have correct properties', () => {
    const err = new CepNotFoundError('01001000', 'ViaCEP');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CepNotFoundError);
    expect(err.name).toBe('CepNotFoundError');
    expect(err.cep).toBe('01001000');
    expect(err.provider).toBe('ViaCEP');
    expect(err.message).toBe('CEP not found');
  });

  it('AllProvidersFailedError should wrap multiple errors', () => {
    const innerErrors = [new Error('err1'), new Error('err2')];
    const err = new AllProvidersFailedError(innerErrors);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(err.name).toBe('AllProvidersFailedError');
    expect(err.errors).toHaveLength(2);
    expect(err.errors[0].message).toBe('err1');
  });
});

describe('Error integration with CepLookup', () => {
  it('should throw CepValidationError for invalid CEP', async () => {
    const mockProvider: Provider = {
      name: 'Mock',
      buildUrl: (cep: string) => `http://test/${cep}`,
      transform: (r: any): Address => r,
    };
    const lookup = new CepLookup({ providers: [mockProvider] });

    await expect(lookup.lookup('123')).rejects.toBeInstanceOf(CepValidationError);
  });

  it('should throw RateLimitError when rate limit exceeded', async () => {
    const mockProvider: Provider = {
      name: 'Mock',
      buildUrl: (cep: string) => `http://test/${cep}`,
      transform: (r: any): Address => r,
    };
    const mockFetcher = jest.fn().mockResolvedValue({
      cep: '01001000', state: 'SP', city: 'SP', neighborhood: 'Sé', street: 'Praça da Sé', service: 'Mock'
    });
    const lookup = new CepLookup({
      providers: [mockProvider],
      fetcher: mockFetcher,
      rateLimit: { requests: 1, per: 10000 },
    });

    await lookup.lookup('01001000'); // first call OK
    await expect(lookup.lookup('01001000')).rejects.toBeInstanceOf(RateLimitError);
  });
});

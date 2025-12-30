import { ref, nextTick } from 'vue';
import { useCepLookup } from '../src';

// Mock the core library
jest.mock('@eusilvio/cep-lookup', () => {
  const actual = jest.requireActual('@eusilvio/cep-lookup');
  return {
    ...actual,
    CepLookup: jest.fn().mockImplementation(() => ({
      lookup: jest.fn().mockImplementation((cep) => {
        if (cep === '01001000') {
          return Promise.resolve({
            cep: '01001000',
            state: 'SP',
            city: 'São Paulo',
            neighborhood: 'Sé',
            street: 'Praça da Sé',
            service: 'ViaCEP'
          });
        }
        return Promise.reject(new Error('CEP not found'));
      }),
      on: jest.fn(),
      off: jest.fn(),
    })),
    InMemoryCache: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn()
    }))
  };
});

describe('useCepLookup (Vue)', () => {
  it('should return address when CEP is valid', async () => {
    const cep = ref('01001000');
    // Use delay: 0 to avoid setTimeout in tests
    const { address, loading } = useCepLookup(cep, { delay: 0 });

    await nextTick();
    // Wait for the promise in lookup to resolve
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(address.value).toEqual({
      cep: '01001000',
      state: 'SP',
      city: 'São Paulo',
      neighborhood: 'Sé',
      street: 'Praça da Sé',
      service: 'ViaCEP'
    });
    expect(loading.value).toBe(false);
  });

  it('should handle errors correctly', async () => {
    const cep = ref('99999999');
    const { address, error } = useCepLookup(cep, { delay: 0 });

    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(address.value).toBeNull();
    expect(error.value?.message).toBe('CEP not found');
  });

  it('should react to CEP changes', async () => {
    const cep = ref('');
    const { address } = useCepLookup(cep, { delay: 0 });

    expect(address.value).toBeNull();

    cep.value = '01001000';
    
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(address.value?.cep).toBe('01001000');
  });
});
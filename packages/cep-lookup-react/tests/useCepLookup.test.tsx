import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { CepProvider, useCepLookup } from '../src';

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
      warmup: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
    })),
  };
});

describe('useCepLookup', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CepProvider>{children}</CepProvider>
  );

  it('should return address when CEP is valid', async () => {
    const { result } = renderHook(() => useCepLookup('01001000'), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.address).toEqual({
      cep: '01001000',
      state: 'SP',
      city: 'São Paulo',
      neighborhood: 'Sé',
      street: 'Praça da Sé',
      service: 'ViaCEP'
    });
    expect(result.current.error).toBeNull();
  });

  it('should return error when CEP is invalid', async () => {
    const { result } = renderHook(() => useCepLookup('99999999'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.address).toBeNull();
    expect(result.current.error?.message).toBe('CEP not found');
  });

  it('should handle mapper correctly', async () => {
    const mapper = (addr: any) => ({ display: `${addr.city}/${addr.state}` });
    
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <CepProvider mapper={mapper}>{children}</CepProvider>
    );

    const { result } = renderHook(() => useCepLookup('01001000'), { wrapper: customWrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.address).toEqual({ display: 'São Paulo/SP' });
  });

  it('should not search if CEP is incomplete', async () => {
    const { result } = renderHook(() => useCepLookup('01001'), { wrapper });

    expect(result.current.loading).toBe(false);
    expect(result.current.address).toBeNull();
  });

  it('should expose warmup function', async () => {
    const { result } = renderHook(() => useCepLookup(''), { wrapper });
    
    expect(typeof result.current.warmup).toBe('function');
    
    await result.current.warmup();
    
    // Check if the instance warmup was called (requires accessing the mock instance)
    // For simplicity, just asserting it exists and is callable in this test
  });
});

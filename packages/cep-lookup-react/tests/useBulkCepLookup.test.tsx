import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { CepProvider, useBulkCepLookup } from '../src';

// Mock the core library
jest.mock('@eusilvio/cep-lookup', () => {
  const actual = jest.requireActual('@eusilvio/cep-lookup');
  return {
    ...actual,
    CepLookup: jest.fn().mockImplementation(() => ({
      lookupCeps: jest.fn().mockImplementation((ceps) => {
        return Promise.resolve(ceps.map((cep: string) => ({
          cep,
          data: cep === '01001000' ? { city: 'São Paulo' } : null,
          error: cep !== '01001000' ? new Error('Not found') : undefined
        })));
      }),
      on: jest.fn(),
      off: jest.fn(),
    })),
  };
});

describe('useBulkCepLookup', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CepProvider>{children}</CepProvider>
  );

  it('should return multiple results', async () => {
    const ceps = ['01001000', '99999999'];
    const { result } = renderHook(() => useBulkCepLookup(ceps), { wrapper });

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0].cep).toBe('01001000');
    expect(result.current.results[1].error).toBeDefined();
  });
});

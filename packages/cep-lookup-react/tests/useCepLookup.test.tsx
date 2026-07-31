import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { CepProvider, useCepLookup } from '../src';

const lookupCalls: { cep: string; signal?: AbortSignal }[] = [];

// Mock the core library
jest.mock('@eusilvio/cep-lookup', () => {
  const actual = jest.requireActual('@eusilvio/cep-lookup');
  return {
    ...actual,
    CepLookup: jest.fn().mockImplementation(() => ({
      lookup: jest.fn().mockImplementation((cep, arg) => {
        const signal = arg && typeof arg === 'object' ? arg.signal : undefined;
        lookupCalls.push({ cep, signal });
        return new Promise((resolve, reject) => {
          signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })), { once: true });
          setTimeout(() => {
            if (signal?.aborted) return;
            if (cep === '01001000') {
              resolve({
                cep: '01001000',
                state: 'SP',
                city: 'São Paulo',
                neighborhood: 'Sé',
                street: 'Praça da Sé',
                service: 'ViaCEP'
              });
            } else {
              reject(new Error('CEP not found'));
            }
          }, 5);
        });
      }),
      warmup: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
    })),
  };
});

beforeEach(() => {
  lookupCalls.length = 0;
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

  it('should call lookup with an AbortSignal', async () => {
    const { result } = renderHook(() => useCepLookup('01001000'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(lookupCalls).toHaveLength(1);
    expect(lookupCalls[0].signal).toBeInstanceOf(AbortSignal);
    expect(lookupCalls[0].signal?.aborted).toBe(false);
  });

  it('should abort the in-flight request when the CEP changes before it settles', async () => {
    const { result, rerender } = renderHook(({ cep }) => useCepLookup(cep, 0), {
      wrapper,
      initialProps: { cep: '01001000' },
    });

    // Let the debounce timer fire and the lookup call start (still pending, 5ms delay in the mock).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(lookupCalls).toHaveLength(1);
    const firstSignal = lookupCalls[0].signal!;
    expect(firstSignal.aborted).toBe(false);

    rerender({ cep: '99999999' });

    // The first request's signal must have been aborted by the cleanup.
    expect(firstSignal.aborted).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('should abort the in-flight request on unmount', async () => {
    const { unmount } = renderHook(() => useCepLookup('01001000', 0), { wrapper });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1));
    });
    expect(lookupCalls).toHaveLength(1);
    const signal = lookupCalls[0].signal!;
    expect(signal.aborted).toBe(false);

    unmount();
    expect(signal.aborted).toBe(true);
  });
});

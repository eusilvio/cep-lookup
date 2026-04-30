import { useState, useEffect, useCallback, useRef } from 'react';
import { Address, BulkCepResult } from '@eusilvio/cep-lookup';
import { useCepLookupInstance } from './CepProvider';

export const useBulkCepLookup = <T = Address>(
  ceps: string[],
  options?: { concurrency?: number }
) => {
  const [results, setResults] = useState<BulkCepResult<T>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { instance: cepLookup, mapper } = useCepLookupInstance();
  const lastRequestCeps = useRef<string[]>([]);
  const lastRawResults = useRef<BulkCepResult<Address>[]>([]);

  const performBulkLookup = useCallback(async () => {
    if (!ceps || ceps.length === 0) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    // Simple check to avoid redundant calls if ceps haven't changed
    const cleanedCeps = ceps.map(cep => cep.replace(/\D/g, ""));
    const cepsKey = cleanedCeps.join(',');
    if (cepsKey === lastRequestCeps.current.join(',')) return;
    
    lastRequestCeps.current = cleanedCeps;
    setLoading(true);
    setError(null);

    try {
      const bulkResults = await cepLookup.lookupCeps<Address>(cleanedCeps, options?.concurrency);
      lastRawResults.current = bulkResults;

      // Apply mapper if available
      const mappedResults = bulkResults.map(result => ({
        ...result,
        data: result.data && mapper ? mapper(result.data) : (result.data as unknown as T),
      })) as BulkCepResult<T>[];

      setResults(mappedResults);
    } catch (e: any) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [ceps, options?.concurrency, cepLookup, mapper]);

  useEffect(() => {
    performBulkLookup();
  }, [performBulkLookup]);

  useEffect(() => {
    if (lastRawResults.current.length === 0) return;
    const remapped = lastRawResults.current.map((result) => ({
      ...result,
      data: result.data && mapper ? mapper(result.data) : (result.data as unknown as T),
    })) as BulkCepResult<T>[];
    setResults(remapped);
  }, [mapper]);

  return { results, loading, error, refresh: performBulkLookup };
};

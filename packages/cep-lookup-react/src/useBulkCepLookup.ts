import { useState, useEffect, useCallback, useRef } from 'react';
import { BulkCepResult } from '@eusilvio/cep-lookup';
import { useCepLookupInstance } from './CepProvider';

export const useBulkCepLookup = <T = any>(
  ceps: string[],
  options?: { concurrency?: number }
) => {
  const [results, setResults] = useState<BulkCepResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { instance: cepLookup, mapper } = useCepLookupInstance();
  const lastRequestCeps = useRef<string[]>([]);

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
      const bulkResults = await cepLookup.lookupCeps(cleanedCeps, options?.concurrency);

      // Apply mapper if available
      const mappedResults = bulkResults.map(result => ({
        ...result,
        data: result.data && mapper ? mapper(result.data) : (result.data as unknown as T),
      }));

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

  return { results, loading, error, refresh: performBulkLookup };
};
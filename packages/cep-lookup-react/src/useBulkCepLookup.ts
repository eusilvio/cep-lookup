import { useState, useEffect, useCallback } from 'react';
import { lookupCeps, BulkCepResult, CepLookupOptions } from '@eusilvio/cep-lookup'; // Removed BulkLookupOptions
import { useCepLookupInstance } from './CepProvider';

export const useBulkCepLookup = (
  ceps: string[],
  options?: { concurrency?: number } // Simplified type for options
) => {
  const [results, setResults] = useState<BulkCepResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { instance: cepLookupInstance, mapper, options: providerOptions } = useCepLookupInstance(); // Get providerOptions

  const performBulkLookup = useCallback(async () => {
    if (!ceps || ceps.length === 0) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const cleanedCeps = ceps.map(cep => cep.replace(/\D/g, ""));
      const bulkResults = await lookupCeps({
        ceps: cleanedCeps,
        providers: providerOptions.providers, // Use providers from providerOptions
        cache: providerOptions.cache,       // Use cache from providerOptions
        fetcher: providerOptions.fetcher,   // Use fetcher from providerOptions
        rateLimit: providerOptions.rateLimit, // Use rateLimit from providerOptions
        concurrency: options?.concurrency, // Pass concurrency from local options
      });

      // Apply mapper if available
      const mappedResults = bulkResults.map(result => ({
        ...result,
        data: result.data && mapper ? mapper(result.data) : result.data,
      }));

      setResults(mappedResults);
    } catch (e: any) {
      setError(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [ceps, options, cepLookupInstance, mapper, providerOptions]); // Added providerOptions to dependencies

  useEffect(() => {
    performBulkLookup();
  }, [performBulkLookup]);

  return { results, loading, error, performBulkLookup };
};
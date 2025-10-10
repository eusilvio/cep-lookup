import { useCallback, useEffect, useState } from "react";
import { Address } from "../../cep-lookup/src";
import { useCepLookupInstance } from "./CepProvider";

// A simple debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => resolve(func(...args)), waitFor);
    });
}

export const useCepLookup = (cep: string, debounceTime = 500) => {
  const [address, setAddress] = useState<any | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const { instance: cepLookup, mapper } = useCepLookupInstance();

  const debouncedLookup = useCallback(
    debounce(async (cepToLookup: string) => {
      setLoading(true);
      setError(null);
      try {
        // The instance from the context already handles caching
        const result = await cepLookup.lookup(cepToLookup);
        setAddress(mapper ? mapper(result) : result);
      } catch (e: any) {
        setError(e);
        setAddress(null); // Clear address on error
      } finally {
        setLoading(false);
      }
    }, debounceTime),
    [debounceTime, cepLookup, mapper]
  );

  useEffect(() => {
    const cleanedCep = cep.replace(/\D/g, "");
    if (cleanedCep.length === 8) {
      debouncedLookup(cleanedCep);
    } else {
      setAddress(null);
      setError(null);
    }
  }, [cep, debouncedLookup]);

  return { address, error, loading };
};

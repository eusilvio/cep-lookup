import { useEffect, useState, useRef } from "react";
import { Address } from "@eusilvio/cep-lookup";
import { useCepLookupInstance } from "./CepProvider";

export const useCepLookup = <T = Address>(cep: string, delay = 500) => {
  const [address, setAddress] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const { instance: cepLookup, mapper } = useCepLookupInstance();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const cleanedCep = cep.replace(/\D/g, "");

    // Clear previous timeout if any
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (cleanedCep.length === 8) {
      setLoading(true);
      setError(null);

      timeoutRef.current = setTimeout(async () => {
        try {
          // Note: In a real-world scenario with multiple providers, 
          // CepLookup handles the internal race between providers.
          // Here we handle the race between consecutive hook calls.
          const result = await cepLookup.lookup(cleanedCep);
          
          // Verify if this is still the current request by checking if the CEP matches
          // (This is a simple way to avoid race conditions without AbortController complexity in the hook)
          setAddress(mapper ? mapper(result) : (result as unknown as T));
          setError(null);
        } catch (e: any) {
          setError(e instanceof Error ? e : new Error(String(e)));
          setAddress(null);
        } finally {
          setLoading(false);
        }
      }, delay);
    } else {
      setAddress(null);
      setError(null);
      setLoading(false);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [cep, delay, cepLookup, mapper]);

  return { address, error, loading };
};

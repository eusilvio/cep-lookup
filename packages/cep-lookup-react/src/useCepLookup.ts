import { useEffect, useState, useRef } from "react";
import { Address } from "@eusilvio/cep-lookup";
import { useCepLookupInstance } from "./CepProvider";

export const useCepLookup = <T = Address>(cep: string, delay = 500) => {
  const [address, setAddress] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const { instance: cepLookup, mapper } = useCepLookupInstance();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentCepRef = useRef<string>("");

  useEffect(() => {
    const cleanedCep = cep.replace(/\D/g, "");
    currentCepRef.current = cleanedCep;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (cleanedCep.length === 8) {
      setLoading(true);
      setError(null);

      timeoutRef.current = setTimeout(async () => {
        try {
          const result = await cepLookup.lookup(cleanedCep);
          if (cleanedCep !== currentCepRef.current) return;
          setAddress(mapper ? mapper(result) : (result as unknown as T));
          setError(null);
        } catch (e: any) {
          if (cleanedCep !== currentCepRef.current) return;
          setError(e instanceof Error ? e : new Error(String(e)));
          setAddress(null);
        } finally {
          if (cleanedCep === currentCepRef.current) {
            setLoading(false);
          }
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

  const warmup = () => {
    return cepLookup.warmup();
  };

  return { address, error, loading, warmup };
};

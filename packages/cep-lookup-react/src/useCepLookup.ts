import { useEffect, useState, useRef } from "react";
import { Address } from "@eusilvio/cep-lookup";
import { useCepLookupInstance } from "./CepProvider";

export const useCepLookup = <T = Address>(cep: string, delay = 500) => {
  const [address, setAddress] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const { instance: cepLookup, mapper } = useCepLookupInstance();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const cleanedCep = cep.replace(/\D/g, "");

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Cancel any request still in flight from a previous CEP/render before starting a new one.
    abortControllerRef.current?.abort();

    if (cleanedCep.length === 8) {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setLoading(true);
      setError(null);

      timeoutRef.current = setTimeout(async () => {
        try {
          const result = await cepLookup.lookup(cleanedCep, { signal: controller.signal });
          if (controller.signal.aborted) return;
          setAddress(mapper ? mapper(result) : (result as unknown as T));
          setError(null);
        } catch (e: any) {
          if (controller.signal.aborted || (e instanceof Error && e.name === "AbortError")) return;
          setError(e instanceof Error ? e : new Error(String(e)));
          setAddress(null);
        } finally {
          if (!controller.signal.aborted) {
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
      // Aborts the in-flight request (if any) so a stale response can never overwrite
      // state after the CEP changed or the component unmounted.
      abortControllerRef.current?.abort();
    };
  }, [cep, delay, cepLookup, mapper]);

  const warmup = () => {
    return cepLookup.warmup();
  };

  return { address, error, loading, warmup };
};

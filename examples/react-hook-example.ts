
import { useState, useCallback } from "react";
import axios from "axios";
import { CepLookup, Address } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

// Create an instance of CepLookup outside the hook to avoid re-creation on every render
const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
});

interface UseCepLookupResult {
  address: Address | null;
  error: string | null;
  loading: boolean;
  lookup: (cep: string) => Promise<void>;
}

export const useCepLookup = (): UseCepLookupResult => {
  const [address, setAddress] = useState<Address | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const lookup = useCallback(async (cep: string) => {
    setLoading(true);
    setError(null);
    setAddress(null);

    try {
      const result = await cepLookup.lookup(cep);
      setAddress(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { address, error, loading, lookup };
};

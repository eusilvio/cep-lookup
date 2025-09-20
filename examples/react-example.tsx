
import React, { useState } from "react";
import axios from "axios";
import { CepLookup, Address } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";

// 1. Create an instance of CepLookup (fetcher is now optional and defaults to global fetch)
const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
});

export const CepLookupComponent: React.FC = () => {
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState<Address | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
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
  };

  return (
    <div>
      <h1>CEP Lookup</h1>
      <input
        type="text"
        value={cep}
        onChange={(e) => setCep(e.target.value)}
        placeholder="Enter CEP"
      />
      <button onClick={handleLookup} disabled={loading}>
        {loading ? "Loading..." : "Lookup"}
      </button>

      {address && (
        <div>
          <h2>Address</h2>
          <p>
            <strong>CEP:</strong> {address.cep}
          </p>
          <p>
            <strong>Street:</strong> {address.street}
          </p>
          <p>
            <strong>Neighborhood:</strong> {address.neighborhood}
          </p>
          <p>
            <strong>City:</strong> {address.city}
          </p>
          <p>
            <strong>State:</strong> {address.state}
          </p>
          <p>
            <strong>Service:</strong> {address.service}
          </p>
        </div>
      )}

      {error && (
        <div>
          <h2>Error</h2>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

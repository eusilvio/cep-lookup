import { CepProvider, useCepLookup } from "@eusilvio/cep-lookup-react";
import React, { useState } from "react";

function CepLookupComponent(): JSX.Element {
  const [cep, setCep] = useState("01001-000");
  const { address, error, loading } = useCepLookup(cep);

  return (
    <div>
      <h1>CEP Lookup</h1>
      <input
        type="text"
        value={cep}
        onChange={(e) => setCep(e.target.value)}
        placeholder="Enter CEP"
      />

      {loading && <p>Loading...</p>}

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
          <p>{error.message}</p>
        </div>
      )}
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <CepProvider>
      <CepLookupComponent />
    </CepProvider>
  );
}

import React, { useState } from 'react';
import { useCepLookup, CepProvider } from '@eusilvio/cep-lookup-react';

/**
 * Smart Warmup React Example
 * 
 * Demonstrates how to use the 'warmup' function returned by the hook
 * to optimize lookup performance by triggering it on an input focus event.
 */

const CepSearchField = () => {
  const [cep, setCep] = useState('');
  
  // The hook now returns the 'warmup' function along with address, loading and error
  const { address, loading, error, warmup } = useCepLookup(cep);

  const handleFocus = async () => {
    console.log("[React] Input focused. Triggering Smart Warmup...");
    // This pings providers in the background to identify the fastest one
    await warmup();
    console.log("[React] Warmup complete. The fastest provider is ready for the real search.");
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h3>🧠 Smart Warmup Example (React)</h3>
      <p>Click on the input to start warming up the providers in the background.</p>
      
      <input
        type="text"
        placeholder="Digite o CEP (ex: 01001000)"
        value={cep}
        onChange={(e) => setCep(e.target.value)}
        onFocus={handleFocus}
        style={{ padding: '8px', fontSize: '16px', width: '250px' }}
      />

      {loading && <p style={{ color: 'blue' }}>⚡ Buscando no provedor mais rápido...</p>}
      
      {error && <p style={{ color: 'red' }}>❌ Erro: {error.message}</p>}
      
      {address && (
        <div style={{ marginTop: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <strong>📍 Endereço Encontrado:</strong>
          <pre>{JSON.stringify(address, null, 2)}</pre>
          <small>Provedor: {address.service}</small>
        </div>
      )}
    </div>
  );
};

// Wrap with CepProvider to use the hook
export const App = () => (
  <CepProvider staggerDelay={150}>
    <CepSearchField />
  </CepProvider>
);

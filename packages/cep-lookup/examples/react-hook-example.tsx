import React, { useState } from 'react';
import { CepProvider, useCepLookup } from '@eusilvio/cep-lookup-react';
import { Address } from '@eusilvio/cep-lookup';

// Custom interface for mapped address
interface SimplifiedAddress {
  display: string;
  cep: string;
}

const mapper = (addr: Address): SimplifiedAddress => ({
  display: `${addr.street}, ${addr.neighborhood} - ${addr.city}/${addr.state}`,
  cep: addr.cep,
});

const CepSearch = () => {
  const [input, setInput] = useState('');
  // The hook automatically infers SimplifiedAddress because of the mapper in CepProvider
  const { address, loading, error } = useCepLookup<SimplifiedAddress>(input);

  return (
    <div>
      <input 
        placeholder="Digite o CEP"
        value={input} 
        onChange={(e) => setInput(e.target.value)} 
      />
      {loading && <span>Buscando...</span>}
      {error && <span style={{ color: 'red' }}>{error.message}</span>}
      {address && (
        <div>
          <p>CEP Normalizado: {address.cep}</p>
          <p>Endereço: {address.display}</p>
        </div>
      )}
    </div>
  );
};

export const App = () => (
  <CepProvider 
    mapper={mapper}
    onSuccess={(ev) => console.log(`Sucesso via ${ev.provider} em ${ev.duration}ms`)}
    onFailure={(ev) => console.error(`Falha no ${ev.provider}:`, ev.error)}
  >
    <CepSearch />
  </CepProvider>
);

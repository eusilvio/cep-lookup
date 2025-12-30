import { Bench } from 'tinybench';
import { CepLookup, InMemoryCache } from '../packages/cep-lookup/src';
import { viaCepProvider } from '../packages/cep-lookup/src/providers/viacep';

async function run() {
  const bench = new Bench({ time: 1000 });

  // Setup
  const cache = new InMemoryCache();
  const cepLookupWithCache = new CepLookup({
    providers: [viaCepProvider],
    cache,
  });

  const validCep = '01001000';
  const addressData = {
    cep: '01001000',
    state: 'SP',
    city: 'São Paulo',
    neighborhood: 'Sé',
    street: 'Praça da Sé',
    service: 'ViaCEP'
  };

  // Warm up cache
  cache.set(validCep, addressData);

  bench
    .add('validateCep (regex)', () => {
      const cepRegex = /^(\d{8}|\d{5}-\d{3})$/;
      cepRegex.test(validCep);
    })
    .add('lookup with Cache Hit', async () => {
      await cepLookupWithCache.lookup(validCep);
    })
    .add('InMemoryCache.get', () => {
      cache.get(validCep);
    })
    .add('EventEmitter.emit (success event)', () => {
      // @ts-ignore
      cepLookupWithCache.emitter.emit('success', {
        provider: 'ViaCEP',
        cep: validCep,
        duration: 10,
        address: addressData
      });
    });

  await bench.run();
  console.table(bench.table());
}

run();
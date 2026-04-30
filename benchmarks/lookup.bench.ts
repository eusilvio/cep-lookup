import { Bench } from 'tinybench';
import { CepLookup, InMemoryCache } from '../packages/cep-lookup/src';
import { viaCepProvider } from '../packages/cep-lookup/src/providers/viacep';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface BenchmarkRow {
  name: string;
  latencyAvgNs: number;
  throughputAvgOps: number;
}

export interface BenchmarkSnapshot {
  generatedAt: string;
  rows: BenchmarkRow[];
}

export async function runBench(): Promise<BenchmarkSnapshot> {
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
  const table = bench.table();
  const rows: BenchmarkRow[] = table.map((row: any) => ({
    name: row['Task name'],
    latencyAvgNs: Number(String(row['Latency avg (ns)']).split(' ')[0]),
    throughputAvgOps: Number(String(row['Throughput avg (ops/s)']).split(' ')[0]),
  }));
  return {
    generatedAt: new Date().toISOString(),
    rows,
  };
}

async function main() {
  const jsonArgIndex = process.argv.indexOf('--json');
  const outputPath = jsonArgIndex >= 0 ? process.argv[jsonArgIndex + 1] : null;
  const snapshot = await runBench();
  console.table(
    snapshot.rows.map((r) => ({
      'Task name': r.name,
      'Latency avg (ns)': r.latencyAvgNs,
      'Throughput avg (ops/s)': r.throughputAvgOps,
    }))
  );
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + '\n');
  }
}

main();

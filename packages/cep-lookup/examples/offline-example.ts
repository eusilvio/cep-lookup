/**
 * Offline Resilience Layer example.
 *
 * 1. `offlineFallback: true` — when every provider fails, retries are exhausted
 *    and no stale cache entry is usable, `lookup()` still answers with a
 *    partial, state-level address instead of throwing.
 * 2. `@eusilvio/cep-lookup/offline` — standalone, synchronous, zero-network
 *    CEP intelligence for instant form validation.
 */
import { CepLookup } from "../src";
import {
  resolveCepOffline,
  stateFromCep,
  isCepAllocated,
  cepMatchesState,
} from "../src/offline";
import { viaCepProvider, brasilApiProvider } from "../src/providers";

async function offlineFallbackExample() {
  const cep = new CepLookup({
    providers: [viaCepProvider, brasilApiProvider],
    // Simulate a total outage: every request fails at the network layer.
    fetcher: () => Promise.reject(new Error("network down")),
    offlineFallback: true,
  });

  cep.on("offline:fallback", ({ cep: failedCep }) => {
    console.log(`[event] offline fallback engaged for ${failedCep}`);
  });

  const address = await cep.lookup("01310-100");
  console.log("Degraded but not dark:", address);
  // {
  //   cep: '01310100', state: 'SP', ddd: '11',
  //   city: '', neighborhood: '', street: '',
  //   service: 'offline', partial: true
  // }

  if (address.partial) {
    console.log("Partial answer → keep state-based flows working, ask for street manually.");
  }
}

function zeroNetworkIntelligenceExample() {
  // Full state-level info, 0ms, no network:
  console.log(resolveCepOffline("30130-010"));
  // { cep: '30130010', state: 'MG', stateName: 'Minas Gerais', region: 'Sudeste',
  //   capital: 'Belo Horizonte', ddd: '31', ibgeState: '31' }

  // Classic checkout cross-validation — CEP vs. UF dropdown:
  console.log(cepMatchesState("01310-100", "SP")); // true
  console.log(cepMatchesState("01310-100", "RJ")); // false → flag the typo instantly

  // Short-circuit lookups no provider could ever resolve:
  console.log(isCepAllocated("00500-000")); // false — outside every Correios range
  console.log(stateFromCep("90010-000")); // 'RS'
}

async function main() {
  await offlineFallbackExample();
  zeroNetworkIntelligenceExample();
}

main();

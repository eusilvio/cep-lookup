/**
 * Address verification example.
 *
 * 1. `verifyAddress` - checks a typed address against its CEP, house number
 *    included, and searches for the right CEP when the typed one is wrong.
 * 2. `compareAddress` - the same comparison against an address you already
 *    hold, synchronous and zero network.
 */
import { CepLookup } from "../src";
import { viaCepProvider, brasilApiProvider } from "../src/providers";
import { compareAddress, normalizeAddressText, verifyAddress } from "../src/verify";

async function checkoutExample() {
  const cep = new CepLookup({ providers: [viaCepProvider, brasilApiProvider] });

  // The customer moved along Avenida Paulista but kept the old CEP.
  const result = await verifyAddress(cep, {
    cep: "01310-100",
    street: "Av. Paulista",
    number: "1578",
    city: "Sao Paulo",
    state: "SP",
  });

  console.log(result.status); // "conflict"
  console.log(result.fields.street); // { match: 'equivalent', input: 'Av. Paulista', expected: 'Avenida Paulista', similarity: 1 }
  console.log(result.fields.number); // { match: 'mismatch', input: '1578', expected: 'de 612 a 1510 - lado par', similarity: 0 }

  if (result.suggestion && result.suggestion.cep !== result.cep) {
    console.log(`The CEP for this address is ${result.suggestion.cep}`); // 01310200
  }
}

function zeroNetworkExample() {
  const reference = {
    cep: "80060000",
    state: "PR",
    city: "Curitiba",
    neighborhood: "Centro",
    street: "Rua XV de Novembro",
    complement: "de 0896/897 a 1598/1599",
    service: "ViaCEP",
  };

  const result = compareAddress(
    { street: "R. Quinze de Novembro", number: 1000, city: "curitiba", state: "Paraná" },
    reference
  );
  console.log(result.status); // "confirmed"

  console.log(normalizeAddressText("Av. Brig. Faria Lima")); // "avenida brigadeiro faria lima"
}

async function main() {
  await checkoutExample();
  zeroNetworkExample();
}

main();

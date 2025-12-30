import { Address, CepLookup } from "@eusilvio/cep-lookup";
import {
  apicepProvider,
  brasilApiProvider,
  viaCepProvider,
} from "@eusilvio/cep-lookup/providers";

// 1. Create an instance of CepLookup (fetcher is now optional and defaults to global fetch)
const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
});

// 2. Define a list of CEPs to look up
const ceps = ["01001-000", "01001-000", "00000-000"];

// 3. Define a custom mapper (optional)
interface CustomAddress {
  postalCode: string;
  fullAddress: string;
  source: string;
}

const myMapper = (address: Address): CustomAddress => {
  return {
    postalCode: address.cep,
    fullAddress: `${address.street}, ${address.neighborhood} - ${address.city}/${address.state}`,
    source: address.service,
  };
};

// 4. Run the lookups
async function run() {
  for (const cep of ceps) {
    console.log(`\n--- Looking up CEP: ${cep} ---\n`);

    // Example 1: Basic usage (The CEP in the result will be normalized to numerical only: 01001000)
    try {
      const address = await cepLookup.lookup(cep);
      console.log("Address found (default format):", address);
    } catch (error) {
      console.error(
        "Failed to fetch CEP (default format):",
        (error as Error).message
      );
    }

    // Example 2: Usage with a custom mapper
    try {
      const customAddress = await cepLookup.lookup(cep, myMapper);
      console.log("Address found (custom format):", customAddress);
    } catch (error) {
      console.error(
        "Failed to fetch CEP (custom format):",
        (error as Error).message
      );
    }
  }
}

run();

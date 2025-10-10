import { CepLookup } from "@eusilvio/cep-lookup";
import {
  apicepProvider,
  brasilApiProvider,
  viaCepProvider,
} from "@eusilvio/cep-lookup/providers";

// 1. Create an instance of CepLookup (fetcher is now optional and defaults to global fetch)
const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider, apicepProvider],
});

// 2. Define a CEP to look up
const cepToLookup = "01001-000";

// 3. Perform the lookup
async function runNodeExample() {
  console.log(`\n--- Looking up CEP: ${cepToLookup} in Node.js ---\n`);

  try {
    const address = await cepLookup.lookup(cepToLookup);
    console.log("Address found (Node.js default format):", address);
  } catch (error) {
    console.error("Failed to fetch CEP in Node.js:", (error as Error).message);
  }
}

runNodeExample();

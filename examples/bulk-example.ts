import { BulkCepResult, InMemoryCache, lookupCeps } from "@eusilvio/cep-lookup";
import { brasilApiProvider, viaCepProvider } from "@eusilvio/cep-lookup/providers";

// Example showing how to use the bulk lookup feature `lookupCeps`.

async function runBulkExample() {
  const cepsToLookup = [
    "01001-000", // Valid, should be found
    "04538-132", // Valid, should be found
    "99999-999", // Invalid, should fail
    "01001-000", // Duplicate, should hit the cache on the second run
  ];

  console.log(`Looking up ${cepsToLookup.length} CEPs...`);

  // Using an InMemoryCache to demonstrate caching during bulk lookups.
  const cache = new InMemoryCache();

  const results = await lookupCeps({
    ceps: cepsToLookup,
    providers: [viaCepProvider, brasilApiProvider],
    cache, // Pass the cache instance
    concurrency: 2, // Limit to 2 parallel requests
  });

  console.log("\n--- Bulk Lookup Results ---");

  results.forEach((result: BulkCepResult) => {
    if (result.data) {
      console.log(
        `✅ SUCCESS for CEP ${result.cep} (from ${result.provider}):`
      );
      console.log(`   ${result.data.street}, ${result.data.city}`);
    } else {
      console.log(`❌ FAILURE for CEP ${result.cep}:`);
      console.log(`   Error: ${result.error?.message}`);
    }
  });

  console.log("\n---------------------------");
}

runBulkExample();

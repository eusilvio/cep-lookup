import { CepLookup } from "../src";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "../src/providers";

/**
 * Smart Warmup Example
 * 
 * This example demonstrates how to use the 'warmup' feature to optimize
 * lookup performance by pre-calculating the fastest provider based on 
 * the current network conditions.
 */

async function runExample() {
  const cepLookup = new CepLookup({
    providers: [viaCepProvider, brasilApiProvider, apicepProvider],
    staggerDelay: 150 // Wait 150ms for the fastest provider before triggering backups
  });

  console.log("--- 🧠 Smart Warmup Example ---");

  // 1. Simulate a UI focus event
  console.log("[UI] User focused the CEP input field. Warming up...");
  
  const startTime = Date.now();
  await cepLookup.warmup();
  const warmupDuration = Date.now() - startTime;
  
  console.log(`[Warmup] Completed in ${warmupDuration}ms. Fastest provider identified.`);

  // 2. Simulate user typing and submitting after a while
  console.log("[UI] User typed '01001-000' and submitted.");
  
  const lookupStart = Date.now();
  const address = await cepLookup.lookup("01001-000");
  const lookupDuration = Date.now() - lookupStart;

  console.log(`[Lookup] Address found: ${address.street}, ${address.city}/${address.state}`);
  console.log(`[Lookup] Served by: ${address.service}`);
  console.log(`[Lookup] Total time: ${lookupDuration}ms`);
  
  if (lookupDuration < 150) {
    console.log("[Analysis] Success! The lookup was served by the fastest provider alone, saving network resources.");
  } else {
    console.log("[Analysis] The fastest provider took longer than the staggerDelay, so backups were triggered to ensure speed.");
  }
}

runExample().catch(console.error);

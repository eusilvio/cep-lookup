import { CepLookup, EventMap } from "../src";
import { viaCepProvider, brasilApiProvider } from "../src/providers";

// Example showing how to use the observability/metrics event API.

async function runMetricsExample() {
  console.log("--- Running Metrics and Observability Example ---");

  const cepLookup = new CepLookup({
    providers: [viaCepProvider, brasilApiProvider],
  });

  // 1. Attach listeners to the events

  cepLookup.on('success', (payload: EventMap['success']) => {
    console.log(
      `[EVENT: SUCCESS] Provider '${payload.provider}' found CEP ${payload.cep} in ${payload.duration}ms.`
    );
    // In a real application, you would send this to your monitoring system:
    // metrics.timing('cep.lookup.duration', payload.duration, { provider: payload.provider });
    // metrics.increment('cep.lookup.success', { provider: payload.provider });
  });

  cepLookup.on('failure', (payload: EventMap['failure']) => {
    console.error(
      `[EVENT: FAILURE] Provider '${payload.provider}' failed for CEP ${payload.cep} in ${payload.duration}ms. Error: ${payload.error.message}`
    );
    // In a real application, you would send this to your monitoring system:
    // metrics.increment('cep.lookup.failure', { provider: payload.provider });
  });

  cepLookup.on('cache:hit', (payload: EventMap['cache:hit']) => {
    console.log(`[EVENT: CACHE HIT] CEP ${payload.cep} was found in the cache.`);
    // metrics.increment('cep.lookup.cache_hit');
  });

  // 2. Run some lookups to trigger the events

  console.log("\n--- Triggering Lookups ---");

  // This will trigger SUCCESS events from both providers
  await cepLookup.lookup("01001-000").catch(() => {});

  console.log("\n");

  // This will trigger FAILURE events from both providers
  await cepLookup.lookup("99999-999").catch(() => {});

  console.log("\n--- Finished ---");
}

runMetricsExample();

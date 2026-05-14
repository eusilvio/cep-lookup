---
title: Basic Usage
description: Learn how to use CEP Lookup
---

# Basic Usage

Learn how to use CEP Lookup for simple CEP lookups.

## Creating an Instance

```typescript
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
});
```

## Simple Lookup

```typescript
const address = await cepLookup.lookup("01001-000");

console.log(address);
// {
//   cep: "01001-000",
//   street: "Praça da Sé",
//   neighborhood: "Centro",
//   city: "São Paulo",
//   state: "SP"
// }
```

## Error Handling

```typescript
import {
  CepNotFoundError,
  ProviderTimeoutError,
  NetworkError,
} from "@eusilvio/cep-lookup";

try {
  const address = await cepLookup.lookup("99999-999");
} catch (error) {
  if (error instanceof CepNotFoundError) {
    console.log("CEP not found in any provider");
  } else if (error instanceof ProviderTimeoutError) {
    console.log("All providers timed out");
  } else if (error instanceof NetworkError) {
    console.log("Network error occurred");
  } else {
    console.error("Unknown error:", error);
  }
}
```

## Batch Lookups

```typescript
const ceps = ["01001-000", "20040020", "30140071"];

const results = await Promise.all(
  ceps.map(cep =>
    cepLookup
      .lookup(cep)
      .then(address => ({ cep, address, error: null }))
      .catch(error => ({ cep, address: null, error }))
  )
);

results.forEach(({ cep, address, error }) => {
  if (error) {
    console.error(`Error looking up ${cep}:`, error.message);
  } else {
    console.log(`${cep}: ${address.street}, ${address.city}`);
  }
});
```

## Custom Configuration

```typescript
const cepLookup = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  // Cache configuration
  cache: {
    enabled: true,
    ttl: 1000 * 60 * 60, // 1 hour
  },
  // Timeout configuration
  timeout: 10000, // 10 seconds
  // Retry configuration
  retries: 1,
  retryDelay: 1000,
});
```

## Provider Health

```typescript
// Get health status of all providers
const health = cepLookup.getProviderHealth();

health.forEach(provider => {
  console.log(`${provider.name}: ${provider.status}`);
});

// Output:
// viaCep: healthy
// brasilApi: healthy
```

## Provider Metrics

```typescript
// Get performance metrics
const metrics = cepLookup.getProviderMetrics();

metrics.forEach(metric => {
  console.log(`${metric.name}:`);
  console.log(`  - Success rate: ${metric.successRate}%`);
  console.log(`  - Avg response time: ${metric.averageResponseTime}ms`);
  console.log(`  - Total requests: ${metric.totalRequests}`);
});
```

## Next Steps

- 📚 Learn about [Resilience patterns](/guides/resilience)
- 🔧 Explore [Provider Management](/guides/providers)
- ⚙️ Configure [Caching strategy](/guides/caching)
- 💾 Setup [Rate Limiting](/guides/rate-limiting)

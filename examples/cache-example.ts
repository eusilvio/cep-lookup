import { CepLookup, InMemoryCache } from "../src";
import { viaCepProvider } from "../src/providers";

// 1. Create a cache instance
const cache = new InMemoryCache();

// 2. Create an instance of CepLookup with the cache
const cepLookup = new CepLookup({
  providers: [viaCepProvider],
  cache, // Pass the cache instance
});

// 3. First lookup (will fetch from the provider)
cepLookup.lookup("01001-000").then(() => {
  console.log("First lookup complete.");

  // 4. Second lookup (will return from the cache)
  cepLookup.lookup("01001-000").then(() => {
    console.log("Second lookup complete (from cache).");
  });
});

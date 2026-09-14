# Vue

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-vue
```

The core is a peer dependency: install both. Requires Vue `^3` (Composition API).

## Plugin

Register one shared instance for the whole app:

```ts
import { createApp } from "vue";
import { createCepLookupPlugin } from "@eusilvio/cep-lookup-vue";
import { viaCepProvider, brasilApiProvider, apicepProvider } from "@eusilvio/cep-lookup/providers";
import { InMemoryCache } from "@eusilvio/cep-lookup";
import App from "./App.vue";

createApp(App)
  .use(
    createCepLookupPlugin({
      providers: [viaCepProvider, brasilApiProvider, apicepProvider],
      circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
      retries: 1,
      cache: new InMemoryCache({ ttl: 10 * 60_000 }),
    }),
  )
  .mount("#app");
```

Without the plugin, the composables use a default instance with the four bundled providers and an in-memory cache - enough for a prototype, not for production.

## useCepLookup

Takes a fixed `string` or a reactive `Ref` - in the latter case every change triggers a new lookup:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useCepLookup } from "@eusilvio/cep-lookup-vue";
import { CepNotFoundError } from "@eusilvio/cep-lookup";

const cep = ref("");
const { address, loading, error } = useCepLookup(cep);
</script>

<template>
  <input v-model="cep" placeholder="CEP" />
  <p v-if="loading">Loading...</p>
  <p v-else-if="error instanceof CepNotFoundError">CEP not found.</p>
  <p v-else-if="address">
    {{ address.street }}, {{ address.city }} - {{ address.state }}
  </p>
</template>
```

Signature:

```ts
useCepLookup<T = Address>(
  cep: Ref<string> | string,
  options?: {
    delay?: number;                        // debounce, default 500ms
    staggerDelay?: number;                 // builds its own instance with this stagger
    instance?: CepLookup;                  // use a specific instance
    mapper?: (address: Address) => T;      // reshape the result
  },
): { address: Ref<T | null>; loading: Ref<boolean>; error: Ref<Error | null>; warmup: () => Promise<any[]> }
```

The composable debounces, only searches with 8 digits, discards responses for a CEP that is no longer current, and clears its timer on `onUnmounted`.

## Per-component instance

When one flow needs a different configuration from the global one - other providers, shorter timeout:

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";

const instance = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  retries: 1,
  circuitBreaker: { enabled: true, failureThreshold: 3, cooldownMs: 30_000 },
});

const { address, error } = useCepLookup("01001000", { instance });
```

## Mapper

```ts
const { address } = useCepLookup(cep, {
  mapper: (a) => ({ zip: a.cep, line1: a.street, town: a.city, uf: a.state }),
});
// address.value: { zip, line1, town, uf } | null
```

## Reaching the instance

```ts
import { useCepLookupInstance } from "@eusilvio/cep-lookup-vue";

const cepLookup = useCepLookupInstance();

const health = cepLookup.getProviderHealth();
const candidates = await cepLookup.searchByAddress("SP", "São Paulo", "Praça da Sé");
```

Outside a component (no active instance), the composable returns the default instance instead of throwing.

## Warmup

```ts
const { warmup } = useCepLookup(cep);

onMounted(() => {
  warmup(); // measures real latency and reorders providers
});
```

## Address verification

Hand the plugin's instance to `verifyAddress` - it inherits the resilience configuration. Requires `@eusilvio/cep-lookup` `2.10.0` or newer.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useCepLookupInstance } from "@eusilvio/cep-lookup-vue";
import { verifyAddress, type AddressVerification } from "@eusilvio/cep-lookup/verify";

const props = defineProps<{ form: { cep: string; street: string; number: string; city: string; state: string } }>();

const cepLookup = useCepLookupInstance();
const result = ref<AddressVerification | null>(null);

async function verify() {
  result.value = await verifyAddress(cepLookup, props.form);
}
</script>

<template>
  <button @click="verify">Check address</button>
  <p v-if="result?.suggestion && result.suggestion.cep !== result.cep">
    The CEP for this address is {{ result.suggestion.cep }}.
  </p>
</template>
```

See [Address verification](/en/guide/verification) for what each status means.

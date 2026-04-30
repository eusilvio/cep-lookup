# @eusilvio/cep-lookup-vue

Vue 3 composition hooks for [`@eusilvio/cep-lookup`](https://www.npmjs.com/package/@eusilvio/cep-lookup).

## Installation

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-vue vue
```

## Compatibility

- Vue: `^3`
- Node.js (tooling/tests): `20.x`, `22.x`, `24.x`
- Core peer: `@eusilvio/cep-lookup ^2.6.0`

## Basic Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useCepLookup } from "@eusilvio/cep-lookup-vue";

const cepInput = ref("01001000");
const { address, loading, error, warmup } = useCepLookup(cepInput, { delay: 300 });
</script>

<template>
  <input v-model="cepInput" @focus="warmup" />
  <div v-if="loading">Buscando...</div>
  <div v-else-if="error">{{ error.message }}</div>
  <div v-else-if="address">{{ address.street }} - {{ address.city }}</div>
</template>
```

## Using Core Resilience Features

```ts
import { CepLookup } from "@eusilvio/cep-lookup";
import { viaCepProvider, brasilApiProvider } from "@eusilvio/cep-lookup/providers";
import { useCepLookup } from "@eusilvio/cep-lookup-vue";

const instance = new CepLookup({
  providers: [viaCepProvider, brasilApiProvider],
  retries: 1,
  circuitBreaker: {
    enabled: true,
    failureThreshold: 3,
    cooldownMs: 30000,
  },
});

const { address, error } = useCepLookup("01001000", { instance });
```

## API

### `useCepLookup<T = Address>(cep: Ref<string> | string, options?)`

Options:
- `delay`
- `staggerDelay`
- `instance`
- `mapper`

Returns:
- `address`
- `loading`
- `error`
- `warmup`

### `createCepLookupPlugin(options?)`

Provides a `CepLookup` instance in app context with all core options, including `circuitBreaker`, `retries`, and `rateLimit`.

## Community

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)
- [SECURITY.md](../../SECURITY.md)

## Production docs

- [Best Practices](../../docs/BEST_PRACTICES.md)
- [Cookbook](../../docs/COOKBOOK.md)

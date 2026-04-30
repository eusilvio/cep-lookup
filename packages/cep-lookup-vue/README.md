# @eusilvio/cep-lookup-vue

Vue 3 Composition API hooks for [`@eusilvio/cep-lookup`](https://www.npmjs.com/package/@eusilvio/cep-lookup).

## Installation

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-vue vue
```

## Compatibility

- Vue: `^3`
- Node.js (for tooling/tests): `20.x`, `22.x`, `24.x`
- Support policy: [SUPPORT.md](../../SUPPORT.md)

## Usage

```vue
<script setup>
import { ref } from 'vue';
import { useCepLookup } from '@eusilvio/cep-lookup-vue';

const cepInput = ref('01001000');
const { address, loading, error } = useCepLookup(cepInput);
</script>

<template>
  <div>
    <input v-model="cepInput" placeholder="Digite o CEP" />
    
    <div v-if="loading">Buscando...</div>
    <div v-else-if="error" style="color: red">{{ error.message }}</div>
    <div v-else-if="address">
      <p>Endereço: {{ address.street }}, {{ address.city }} - {{ address.state }}</p>
    </div>
  </div>
</template>
```

## API

### `useCepLookup<T = Address>(cep: Ref<string> | string, options?)`

A Vue 3 composition API hook for CEP lookups.

**Options**

- `delay` (optional): `number` - Debounce delay. Default: `500`.
- `staggerDelay` (optional): `number` - Staggered race delay. Default: `100`.
- `instance` (optional): `CepLookup` - Custom instance.
- `mapper` (optional): `(address: Address) => T` - Custom mapper.

**Returns**

- `address`: `Ref<T | null>`
- `loading`: `Ref<boolean>`
- `error`: `Ref<Error | null>`
- `warmup`: `() => Promise<void>` - Function to trigger predictive ranking.

## Community

- Contributing guide: [CONTRIBUTING.md](../../CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)

# @eusilvio/cep-lookup-vue

Vue 3 Composition API hooks for [`@eusilvio/cep-lookup`](https://www.npmjs.com/package/@eusilvio/cep-lookup).

## Installation

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-vue vue
```

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

### `useCepLookup<T>(cep: Ref<string> | string, options?)`

- `cep`: A Vue `ref` or a static string. If a `ref` is provided, the lookup will re-run automatically when the value changes.
- `options`:
  - `delay`: Debounce time in ms (default: `500`).
  - `mapper`: Function to transform the result.
  - `instance`: Custom `CepLookup` instance.

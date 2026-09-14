# Vue

```bash
npm install @eusilvio/cep-lookup @eusilvio/cep-lookup-vue
```

O core é peer dependency: instale os dois. Requer Vue `^3` (Composition API).

## Plugin

Registre uma instância compartilhada por toda a aplicação:

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

Sem o plugin, os composables usam uma instância padrão com os quatro provedores incluídos e cache em memória - suficiente para protótipo, não para produção.

## useCepLookup

Aceita uma `string` fixa ou um `Ref` reativo - no segundo caso, cada mudança dispara uma nova busca:

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
  <p v-if="loading">Buscando...</p>
  <p v-else-if="error instanceof CepNotFoundError">CEP não encontrado.</p>
  <p v-else-if="address">
    {{ address.street }}, {{ address.city }} - {{ address.state }}
  </p>
</template>
```

Assinatura:

```ts
useCepLookup<T = Address>(
  cep: Ref<string> | string,
  options?: {
    delay?: number;                        // debounce, padrão 500ms
    staggerDelay?: number;                 // cria instância própria com esse stagger
    instance?: CepLookup;                  // usa uma instância específica
    mapper?: (address: Address) => T;      // molda o retorno
  },
): { address: Ref<T | null>; loading: Ref<boolean>; error: Ref<Error | null>; warmup: () => Promise<any[]> }
```

O composable faz debounce, só busca com 8 dígitos, descarta respostas de um CEP que já não é o atual e limpa o timer no `onUnmounted`.

## Instância própria por componente

Quando um fluxo precisa de configuração diferente da global - outro conjunto de provedores, timeout mais curto:

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

## Acessando a instância

```ts
import { useCepLookupInstance } from "@eusilvio/cep-lookup-vue";

const cepLookup = useCepLookupInstance();

const health = cepLookup.getProviderHealth();
const candidatos = await cepLookup.searchByAddress("SP", "São Paulo", "Praça da Sé");
```

Fora de um componente (sem instância ativa), o composable devolve a instância padrão em vez de lançar erro.

## Warmup

```ts
const { warmup } = useCepLookup(cep);

onMounted(() => {
  warmup(); // mede a latência real e reordena os provedores
});
```

## Verificação de endereço

Passe a instância do plugin para `verifyAddress` - ela herda a configuração de resiliência. Requer `@eusilvio/cep-lookup` `2.10.0` ou superior.

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
  <button @click="verify">Conferir endereço</button>
  <p v-if="result?.suggestion && result.suggestion.cep !== result.cep">
    O CEP deste endereço é {{ result.suggestion.cep }}.
  </p>
</template>
```

Veja [Verificação de endereço](/guide/verification) para o significado de cada status.

import { defineComponent, ref, h } from 'vue';
import { useCepLookup } from '@eusilvio/cep-lookup-vue';

/**
 * Example Vue 3 Component using useCepLookup
 */
export const VueExample = defineComponent({
  name: 'VueExample',
  setup() {
    const cep = ref('01001000');
    const { address, loading, error } = useCepLookup(cep);

    return () => h('div', [
      h('input', {
        value: cep.value,
        onInput: (e: any) => cep.value = e.target.value,
        placeholder: 'Digite o CEP'
      }),
      loading.value && h('p', 'Carregando...'),
      error.value && h('p', { style: 'color: red' }, error.value.message),
      address.value && h('pre', JSON.stringify(address.value, null, 2))
    ]);
  }
});

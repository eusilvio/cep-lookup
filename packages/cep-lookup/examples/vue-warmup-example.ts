import { defineComponent, ref } from 'vue';
import { useCepLookup } from '@eusilvio/cep-lookup-vue';

/**
 * Smart Warmup Vue Example
 * 
 * Demonstrates how to use the 'warmup' function in Vue 3 Composition API
 * to optimize lookup performance by triggering it on an input focus event.
 */

export default defineComponent({
  name: 'SmartWarmupExample',
  setup() {
    const cep = ref('');
    
    // The Vue hook also returns the 'warmup' function
    const { address, loading, error, warmup } = useCepLookup(cep, {
      staggerDelay: 150 // Wait 150ms for the fastest before triggering backups
    });

    const onInputFocus = async () => {
      console.log("[Vue] Input focused. Warming up providers...");
      await warmup();
      console.log("[Vue] Smart ranking updated. Ready for high-performance lookup.");
    };

    return {
      cep,
      address,
      loading,
      error,
      warmup,
      onInputFocus
    };
  },
  template: `
    <div style="padding: 20px; font-family: sans-serif;">
      <h3>🧠 Smart Warmup Example (Vue 3)</h3>
      <p>Click on the input to start warming up the providers in the background.</p>

      <input 
        v-model="cep"
        @focus="onInputFocus"
        placeholder="Digite o CEP"
        style="padding: 8px; font-size: 16px; width: 250px;"
      />

      <p v-if="loading" style="color: blue;">⚡ Buscando no provedor mais rápido...</p>
      
      <p v-if="error" style="color: red;">❌ Erro: {{ error.message }}</p>

      <div v-if="address" style="margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 8px;">
        <strong>📍 Endereço Encontrado:</strong>
        <pre>{{ JSON.stringify(address, null, 2) }}</pre>
        <small>Provedor: {{ address.service }}</small>
      </div>
    </div>
  `
});

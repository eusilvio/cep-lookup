import { ref, watch, onUnmounted, Ref, getCurrentInstance } from 'vue';
import { CepLookup, Address, InMemoryCache } from '@eusilvio/cep-lookup';
import { viaCepProvider, brasilApiProvider, apicepProvider } from '@eusilvio/cep-lookup/providers';

// Global or shared instance logic can be implemented here or via a Vue Plugin/Provide/Inject
// For simplicity and parity with React, we'll allow passing options or use a default instance
const defaultProviders = [viaCepProvider, brasilApiProvider, apicepProvider];
const defaultCache = new InMemoryCache();
const defaultInstance = new CepLookup({
  providers: defaultProviders,
  cache: defaultCache
});

export interface UseCepLookupReturn<T> {
  address: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
}

export function useCepLookup<T = Address>(
  cep: Ref<string> | string,
  options: { 
    delay?: number;
    instance?: CepLookup;
    mapper?: (address: Address) => T;
  } = {}
): UseCepLookupReturn<T> {
  const address = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<Error | null>(null);
  
  const cepLookup = options.instance || defaultInstance;
  const delay = options.delay ?? 500;
  let timeoutId: any = null;

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

  const lookup = async (val: string) => {
    const cleanedCep = val.replace(/\D/g, "");
    
    cleanup();

    if (cleanedCep.length === 8) {
      loading.value = true;
      error.value = null;

      timeoutId = setTimeout(async () => {
        try {
          const result = await cepLookup.lookup(cleanedCep);
          address.value = options.mapper ? options.mapper(result) : (result as unknown as T);
          error.value = null;
        } catch (e: any) {
          error.value = e instanceof Error ? e : new Error(String(e));
          address.value = null;
        } finally {
          loading.value = false;
        }
      }, delay);
    } else {
      address.value = null;
      error.value = null;
      loading.value = false;
    }
  };

  // Support both Ref and raw string
  if (typeof cep === 'string') {
    lookup(cep);
  } else {
    watch(cep, (newVal) => {
      lookup(newVal);
    }, { immediate: true });
  }

  // Only register onUnmounted if we are inside a component lifecycle
  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return {
    address,
    loading,
    error
  };
}

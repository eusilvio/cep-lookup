import { ref, watch, onUnmounted, Ref, getCurrentInstance, inject, InjectionKey, Plugin } from 'vue';
import { CepLookup, Address, InMemoryCache, CepLookupOptions } from '@eusilvio/cep-lookup';
import { viaCepProvider, brasilApiProvider, apicepProvider, openCepProvider } from '@eusilvio/cep-lookup/providers';

const defaultProviders = [viaCepProvider, brasilApiProvider, apicepProvider, openCepProvider];
const defaultCache = new InMemoryCache();
const defaultInstance = new CepLookup({
  providers: defaultProviders,
  cache: defaultCache
});

const CEP_LOOKUP_KEY: InjectionKey<CepLookup> = Symbol('cep-lookup');

export function createCepLookupPlugin(options?: Partial<CepLookupOptions>): Plugin {
  return {
    install(app) {
      const instance = options
        ? new CepLookup({
            providers: options.providers || defaultProviders,
            cache: options.cache || defaultCache,
            ...options,
          })
        : defaultInstance;
      app.provide(CEP_LOOKUP_KEY, instance);
    },
  };
}

export function useCepLookupInstance(): CepLookup {
  if (!getCurrentInstance()) return defaultInstance;
  return inject(CEP_LOOKUP_KEY, defaultInstance);
}

export interface UseCepLookupReturn<T> {
  address: Ref<T | null>;
  loading: Ref<boolean>;
  error: Ref<Error | null>;
  warmup: () => Promise<any[]>;
}

export function useCepLookup<T = Address>(
  cep: Ref<string> | string,
  options: {
    delay?: number;
    staggerDelay?: number;
    instance?: CepLookup;
    mapper?: (address: Address) => T;
  } = {}
): UseCepLookupReturn<T> {
  const address = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(false);
  const error = ref<Error | null>(null);

  const cepLookup = options.instance || useCepLookupInstance();
  const delay = options.delay ?? 500;
  let timeoutId: any = null;
  let currentLookupCep = '';

  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId);
  };

  const lookup = async (val: string) => {
    const cleanedCep = val.replace(/\D/g, "");
    currentLookupCep = cleanedCep;

    cleanup();

    if (cleanedCep.length === 8) {
      loading.value = true;
      error.value = null;

      timeoutId = setTimeout(async () => {
        try {
          const result = await cepLookup.lookup(cleanedCep);
          if (cleanedCep !== currentLookupCep) return;
          address.value = options.mapper ? options.mapper(result) : (result as unknown as T);
          error.value = null;
        } catch (e: any) {
          if (cleanedCep !== currentLookupCep) return;
          error.value = e instanceof Error ? e : new Error(String(e));
          address.value = null;
        } finally {
          if (cleanedCep === currentLookupCep) {
            loading.value = false;
          }
        }
      }, delay);
    } else {
      address.value = null;
      error.value = null;
      loading.value = false;
    }
  };

  if (typeof cep === 'string') {
    lookup(cep);
  } else {
    watch(cep, (newVal) => {
      lookup(newVal);
    }, { immediate: true });
  }

  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  const warmup = () => {
    return cepLookup.warmup();
  };

  return {
    address,
    loading,
    error,
    warmup
  };
}

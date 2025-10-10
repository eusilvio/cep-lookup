import {
  apicepProvider,
  brasilApiProvider,
  viaCepProvider,
} from "@eusilvio/cep-lookup/providers";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";
import {
  Address,
  CepLookup,
  CepLookupOptions,
  InMemoryCache,
  EventMap,
} from "@eusilvio/cep-lookup";

// Create a default instance for use when no provider is specified
const defaultProviders = [viaCepProvider, brasilApiProvider, apicepProvider];
const defaultCepLookup = new CepLookup({
  providers: defaultProviders,
  cache: new InMemoryCache(), // Provide a default in-memory cache
});

export interface CepContextValue {
  instance: CepLookup;
  mapper?: (address: Address) => any;
  // Expose the options used to create the CepLookup instance
  options: CepLookupOptions;
}

const CepContext = createContext<CepContextValue>({
  instance: defaultCepLookup,
  options: { providers: defaultProviders, cache: new InMemoryCache() }, // Default options
});

// Define the props for the provider, which are the CepLookupOptions
interface CepProviderProps extends Partial<CepLookupOptions> {
  children: ReactNode;
  mapper?: (address: Address) => any;
  // New event handlers
  onSuccess?: (event: EventMap['success']) => void;
  onFailure?: (event: EventMap['failure']) => void;
  onCacheHit?: (event: EventMap['cache:hit']) => void;
}

export const CepProvider: React.FC<CepProviderProps> = ({
  children,
  mapper,
  onSuccess,
  onFailure,
  onCacheHit,
  ...options
}) => {
  const cepLookupInstance = useMemo(() => {
    // If no options are provided, use the default instance
    if (!Object.keys(options).length) {
      return defaultCepLookup;
    }
    // If options are provided, create a new instance.
    // If providers are not specified, use the default ones.
    return new CepLookup({
      providers: defaultProviders,
      cache: new InMemoryCache(), // Ensure a cache is always present
      ...options,
    });
  }, [options]);

  // Register and unregister event listeners
  useEffect(() => {
    if (onSuccess) {
      cepLookupInstance.on('success', onSuccess);
    }
    if (onFailure) {
      cepLookupInstance.on('failure', onFailure);
    }
    if (onCacheHit) {
      cepLookupInstance.on('cache:hit', onCacheHit);
    }

    return () => {
      if (onSuccess) {
        cepLookupInstance.off('success', onSuccess);
      }
      if (onFailure) {
        cepLookupInstance.off('failure', onFailure);
      }
      if (onCacheHit) {
        cepLookupInstance.off('cache:hit', onCacheHit);
      }
    };
  }, [cepLookupInstance, onSuccess, onFailure, onCacheHit]);

  const contextValue = useMemo(
    () => ({
      instance: cepLookupInstance,
      mapper,
      options: { providers: defaultProviders, cache: new InMemoryCache(), ...options },
    }),
    [cepLookupInstance, mapper, options]
  );

  return (
    <CepContext.Provider value={contextValue}>{children}</CepContext.Provider>
  );
};

export const useCepLookupInstance = () => {
  const context = useContext(CepContext);
  if (!context) {
    // This should not happen in practice if the hook is used correctly
    throw new Error("useCepLookupInstance must be used within a CepProvider");
  }
  return context;
};

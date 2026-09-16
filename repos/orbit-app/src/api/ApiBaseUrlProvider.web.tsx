import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";

import {
  DEFAULT_ORBIT_API_BASE_URL,
  validateOrbitApiBaseUrl,
  type OrbitApiBaseUrlValidation
} from "./base-url";
import { resolveBrowserApiBaseUrl } from "./browser-api-origin";

interface ApiBaseUrlContextValue {
  baseUrl: string;
  error: string | null;
  ready: boolean;
  resetBaseUrl: () => Promise<void>;
  setBaseUrl: (value: string) => Promise<OrbitApiBaseUrlValidation>;
}

const ApiBaseUrlContext = createContext<ApiBaseUrlContextValue | null>(null);

export function OrbitApiBaseUrlProvider({ children }: PropsWithChildren) {
  const [baseUrl, setResolvedBaseUrl] = useState(DEFAULT_ORBIT_API_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const resolved = resolveBrowserApiBaseUrl({
      browserOrigin: window.location.origin,
      ...(process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL === undefined
        ? {}
        : { configuredBaseUrl: process.env.EXPO_PUBLIC_ORBIT_API_BASE_URL })
    });

    if (!resolved.success) {
      setError(resolved.error);
      return;
    }
    setResolvedBaseUrl(resolved.value);
    setReady(true);
  }, []);

  const resetBaseUrl = useCallback(async () => {}, []);
  const setBaseUrl = useCallback(async (value: string): Promise<OrbitApiBaseUrlValidation> => {
    const validation = validateOrbitApiBaseUrl(value);

    if (!validation.success) return validation;
    return validation.value === baseUrl
      ? validation
      : { error: "浏览器版使用当前网站地址。", success: false };
  }, [baseUrl]);
  const context = useMemo<ApiBaseUrlContextValue>(() => ({
    baseUrl,
    error,
    ready,
    resetBaseUrl,
    setBaseUrl
  }), [baseUrl, error, ready, resetBaseUrl, setBaseUrl]);

  if (error) throw new Error(error);

  return (
    <ApiBaseUrlContext.Provider value={context}>
      {children}
    </ApiBaseUrlContext.Provider>
  );
}

export function useOrbitApiBaseUrl(): ApiBaseUrlContextValue {
  const context = useContext(ApiBaseUrlContext);

  if (!context) {
    throw new Error("useOrbitApiBaseUrl must be used inside OrbitApiBaseUrlProvider");
  }

  return context;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
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

const STORAGE_KEY = "orbit.apiBaseUrl";

interface ApiBaseUrlContextValue {
  baseUrl: string;
  error: string | null;
  ready: boolean;
  resetBaseUrl: () => Promise<void>;
  setBaseUrl: (value: string) => Promise<OrbitApiBaseUrlValidation>;
}

const ApiBaseUrlContext = createContext<ApiBaseUrlContextValue | null>(null);

export function OrbitApiBaseUrlProvider({ children }: PropsWithChildren) {
  const [baseUrl, setBaseUrlState] = useState(DEFAULT_ORBIT_API_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((storedValue) => {
        if (!active || storedValue === null) {
          return;
        }

        const validation = validateOrbitApiBaseUrl(storedValue);
        if (validation.success) {
          setBaseUrlState(validation.value);
        } else {
          void AsyncStorage.removeItem(STORAGE_KEY);
        }
      })
      .catch((storageError: unknown) => {
        if (active) {
          setError(
            storageError instanceof Error
              ? storageError.message
              : "无法读取已保存的服务器地址。"
          );
        }
      })
      .finally(() => {
        if (active) {
          setReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setBaseUrl = useCallback(
    async (value: string): Promise<OrbitApiBaseUrlValidation> => {
      const validation = validateOrbitApiBaseUrl(value);
      if (!validation.success) {
        setError(validation.error);
        return validation;
      }

      await AsyncStorage.setItem(STORAGE_KEY, validation.value);
      setBaseUrlState(validation.value);
      setError(null);
      return validation;
    },
    []
  );

  const resetBaseUrl = useCallback(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setBaseUrlState(DEFAULT_ORBIT_API_BASE_URL);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({
      baseUrl,
      error,
      ready,
      resetBaseUrl,
      setBaseUrl
    }),
    [baseUrl, error, ready, resetBaseUrl, setBaseUrl]
  );

  return (
    <ApiBaseUrlContext.Provider value={value}>
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

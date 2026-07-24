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
  registerOrbitAccount,
  signInWithCredentials,
  signOutOrbitSession
} from "./auth-session";
import { normalizeOrbitApiBaseUrl } from "./base-url";
import { useOrbitApiBaseUrl } from "./ApiBaseUrlProvider";

interface AuthActionResult {
  message?: string;
  success: boolean;
}

interface RegisterInput {
  displayName?: string;
  email: string;
  password: string;
}

interface SignInInput {
  email: string;
  password: string;
  redirectTo?: string;
}

interface AuthSessionContextValue {
  cookieHeader: string;
  ready: boolean;
  register: (input: RegisterInput) => Promise<AuthActionResult>;
  signIn: (input: SignInInput) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  signedIn: boolean;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function storageKey(baseUrl: string): string {
  return `orbit.authCookieHeader.${encodeURIComponent(
    normalizeOrbitApiBaseUrl(baseUrl)
  )}`;
}

export function OrbitAuthSessionProvider({ children }: PropsWithChildren) {
  const { baseUrl, ready: baseUrlReady } = useOrbitApiBaseUrl();
  const [cookieHeader, setCookieHeader] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    if (!baseUrlReady) {
      return () => {
        active = false;
      };
    }

    setReady(false);

    void AsyncStorage.getItem(storageKey(baseUrl))
      .then((storedValue) => {
        if (active) {
          setCookieHeader(storedValue ?? "");
        }
      })
      .catch(() => {
        if (active) {
          setCookieHeader("");
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
  }, [baseUrl, baseUrlReady]);

  const signIn = useCallback(
    async (input: SignInInput): Promise<AuthActionResult> => {
      const result = await signInWithCredentials({
        baseUrl,
        cookieHeader,
        email: input.email,
        password: input.password,
        ...(input.redirectTo ? { redirectTo: input.redirectTo } : {})
      });

      if (!result.success) {
        return { message: result.error.message, success: false };
      }

      await AsyncStorage.setItem(storageKey(baseUrl), result.cookieHeader);
      setCookieHeader(result.cookieHeader);
      return { success: true };
    },
    [baseUrl, cookieHeader]
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<AuthActionResult> => {
      const result = await registerOrbitAccount({
        baseUrl,
        email: input.email,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        password: input.password
      });

      if (!result.success) {
        return { message: result.error.message, success: false };
      }

      return { success: true };
    },
    [baseUrl]
  );

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (cookieHeader.trim()) {
      const result = await signOutOrbitSession({ baseUrl, cookieHeader });

      if (!result.success) {
        return { message: result.error.message, success: false };
      }
    }

    await AsyncStorage.removeItem(storageKey(baseUrl));
    setCookieHeader("");
    return { success: true };
  }, [baseUrl, cookieHeader]);

  const value = useMemo(
    () => ({
      cookieHeader,
      ready,
      register,
      signIn,
      signOut,
      signedIn: cookieHeader.trim().length > 0
    }),
    [cookieHeader, ready, register, signIn, signOut]
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useOrbitAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error("useOrbitAuthSession must be used inside OrbitAuthSessionProvider");
  }

  return context;
}

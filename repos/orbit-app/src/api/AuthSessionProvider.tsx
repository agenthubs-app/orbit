import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
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
  signOutOrbitSession
} from "./auth-session";
import { useOrbitApiBaseUrl } from "./ApiBaseUrlProvider";
import {
  createGoogleOAuthAttempt,
  exchangeGoogleOAuthCode,
  fetchMobileAuthProviders,
  parseGoogleOAuthBrowserResult,
  signInWithMobileCredentials,
  validateAuthSession,
  type MobileAuthSession,
  type MobileAuthUser
} from "./mobile-auth";
import { nativeAuthSessionStorage } from "./native-auth-session-storage";

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
  googleEnabled: boolean;
  providers: readonly "google"[];
  ready: boolean;
  register: (input: RegisterInput) => Promise<AuthActionResult>;
  signIn: (input: SignInInput) => Promise<AuthActionResult>;
  signInWithGoogle: (next?: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  signedIn: boolean;
  startGoogleSignIn: (input?: { redirectTo?: string }) => Promise<AuthActionResult>;
  user: MobileAuthUser | null;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  const bytes = new ArrayBuffer(value.byteLength);
  new Uint8Array(bytes).set(value);

  return new Uint8Array(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)
  );
}

export function OrbitAuthSessionProvider({ children }: PropsWithChildren) {
  const { baseUrl, ready: baseUrlReady } = useOrbitApiBaseUrl();
  const [cookieHeader, setCookieHeader] = useState("");
  const [providers, setProviders] = useState<readonly "google"[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MobileAuthUser | null>(null);

  useEffect(() => {
    let active = true;

    if (!baseUrlReady) {
      return () => {
        active = false;
      };
    }

    setReady(false);
    setCookieHeader("");
    setProviders([]);
    setUser(null);

    const restoreSession = async () => {
      try {
        const storedValue = await nativeAuthSessionStorage.read(baseUrl);

        if (!storedValue) {
          return;
        }

        const result = await validateAuthSession({
          baseUrl,
          cookieHeader: storedValue
        });

        if (!active) {
          return;
        }

        if (result.success) {
          setCookieHeader(storedValue);
          setUser(result.data.user);
          return;
        }

        if (result.error.code !== "ORBIT_APP_AUTH_NETWORK_ERROR") {
          await nativeAuthSessionStorage.clear(baseUrl);
        }
      } catch {
        if (active) {
          setCookieHeader("");
          setUser(null);
        }
      }
    };

    const loadProviders = async () => {
      const result = await fetchMobileAuthProviders({ baseUrl });

      if (active && result.success) {
        setProviders(
          result.data.providers.includes("google") ? ["google"] : []
        );
      }
    };

    void Promise.allSettled([restoreSession(), loadProviders()]).finally(() => {
      if (active) {
        setReady(true);
      }
    });

    return () => {
      active = false;
    };
  }, [baseUrl, baseUrlReady]);

  const acceptSession = useCallback(
    async (session: MobileAuthSession): Promise<AuthActionResult> => {
      const validation = await validateAuthSession({
        baseUrl,
        cookieHeader: session.cookieHeader
      });

      if (!validation.success) {
        return {
          message: validation.error.message,
          success: false
        };
      }

      try {
        await nativeAuthSessionStorage.write(baseUrl, session.cookieHeader);
      } catch {
        return {
          message: "无法安全保存登录状态，请稍后再试。",
          success: false
        };
      }

      setCookieHeader(session.cookieHeader);
      setUser(validation.data.user);
      return { success: true };
    },
    [baseUrl]
  );

  const signIn = useCallback(
    async (input: SignInInput): Promise<AuthActionResult> => {
      const result = await signInWithMobileCredentials({
        baseUrl,
        email: input.email,
        password: input.password
      });

      if (!result.success) {
        return { message: result.error.message, success: false };
      }

      return acceptSession(result.data);
    },
    [acceptSession, baseUrl]
  );

  const signInWithGoogle = useCallback(
    async (next = "/profile"): Promise<AuthActionResult> => {
      try {
        const attempt = await createGoogleOAuthAttempt({
          baseUrl,
          digest: sha256,
          next,
          randomBytes: Crypto.getRandomBytesAsync
        });
        const browserResult = await WebBrowser.openAuthSessionAsync(
          attempt.startUrl,
          attempt.redirectUri
        );
        const callback = parseGoogleOAuthBrowserResult(
          browserResult,
          attempt.state
        );

        if (!callback.success) {
          return {
            message: callback.error.message,
            success: false
          };
        }

        const exchange = await exchangeGoogleOAuthCode({
          baseUrl,
          code: callback.code,
          codeVerifier: attempt.codeVerifier,
          state: callback.state
        });

        if (!exchange.success) {
          return {
            message: exchange.error.message,
            success: false
          };
        }

        return acceptSession(exchange.data);
      } catch {
        return {
          message: "Google 登录没有完成，请重新登录。",
          success: false
        };
      }
    },
    [acceptSession, baseUrl]
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

    try {
      await nativeAuthSessionStorage.clear(baseUrl);
    } catch {
      return {
        message: "无法清除这台设备上的登录状态，请稍后再试。",
        success: false
      };
    }

    setCookieHeader("");
    setUser(null);
    return { success: true };
  }, [baseUrl, cookieHeader]);

  const value = useMemo(
    () => ({
      cookieHeader,
      googleEnabled: providers.includes("google"),
      providers,
      ready,
      register,
      signIn,
      signInWithGoogle,
      signOut,
      signedIn: user !== null,
      startGoogleSignIn: (input?: { redirectTo?: string }) =>
        signInWithGoogle(input?.redirectTo),
      user
    }),
    [
      cookieHeader,
      providers,
      ready,
      register,
      signIn,
      signInWithGoogle,
      signOut,
      user
    ]
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

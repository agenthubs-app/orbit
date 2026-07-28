import * as Crypto from "expo-crypto";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
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
import { onSessionExpired } from "./session-expiry";
import { clearSnapshots } from "../data/snapshot-store";
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
const usesBrowserManagedSession = Platform.OS === "web";

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
        const storedValue = usesBrowserManagedSession
          ? ""
          : (await nativeAuthSessionStorage.read(baseUrl)) ?? "";

        if (!usesBrowserManagedSession && !storedValue) {
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
          setCookieHeader(usesBrowserManagedSession ? "" : storedValue);
          setUser(result.data.user);
          return;
        }

        if (
          !usesBrowserManagedSession &&
          result.error.code !== "ORBIT_APP_AUTH_NETWORK_ERROR"
        ) {
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

      if (!usesBrowserManagedSession) {
        try {
          await nativeAuthSessionStorage.write(baseUrl, session.cookieHeader);
        } catch {
          return {
            message: "无法安全保存登录状态，请稍后再试。",
            success: false
          };
        }
      }

      setCookieHeader(usesBrowserManagedSession ? "" : session.cookieHeader);
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
    if (user !== null) {
      const result = await signOutOrbitSession({ baseUrl, cookieHeader });

      if (!result.success) {
        return { message: result.error.message, success: false };
      }
    }

    if (!usesBrowserManagedSession) {
      try {
        await nativeAuthSessionStorage.clear(baseUrl);
      } catch {
        return {
          message: "无法清除这台设备上的登录状态，请稍后再试。",
          success: false
        };
      }
    }

    // 登出后设备上不该再留着这个账号的人脉数据。
    await clearSnapshots();
    setCookieHeader("");
    setUser(null);
    return { success: true };
  }, [baseUrl, cookieHeader, user]);

  // 任何一次请求收到 401，都说明这台设备上保存的会话已经失效。
  //
  // 只在自认为已登录时才处理：未登录时的 401 只是「这个接口需要登录」，
  // 由各屏自己的失败态说明，不该把用户从当前页面拽走。
  //
  // 订阅只在 user !== null 期间存在，所以处理完把 user 置空之后这里会自动解绑，
  // 登录页自身的请求再 401 也不会把用户困在跳转循环里。
  useEffect(() => {
    if (user === null) {
      return;
    }

    return onSessionExpired(() => {
      if (!usesBrowserManagedSession) {
        void nativeAuthSessionStorage.clear(baseUrl).catch(() => undefined);
      }
      // 快照里是这个账号的人脉数据，会话失效就不该继续留在设备上。
      void clearSnapshots();
      setCookieHeader("");
      setUser(null);
      router.replace("/account/login" as Href);
    });
  }, [baseUrl, user]);

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

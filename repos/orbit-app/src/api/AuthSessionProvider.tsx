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
  useRef,
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
import { createOrbitApiClient } from "./client";
import { ORBIT_API_ENDPOINTS } from "./endpoints";
import {
  canonicalAccountIdentityFromPayload,
  type CanonicalAccountIdentity
} from "./canonical-account-identity";
import { cancelOrbitManagedNotifications } from "../notifications/native-notifications";
import { revokeRegisteredPushDevice } from "../notifications/push-device-session";
import { revokePushDeviceRegistrations } from "../notifications/push-registration-queue";

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
  accountId: string | null;
  actorId: string | null;
  cookieHeader: string;
  googleEnabled: boolean;
  notificationSessionRevision: number;
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

function obsoleteAuthActionResult(): AuthActionResult {
  return { message: "登录服务器已切换，请重新登录。", success: false };
}

async function sha256(value: Uint8Array): Promise<Uint8Array> {
  const bytes = new Uint8Array(value.byteLength);
  bytes.set(value);

  return new Uint8Array(
    await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)
  );
}

async function resolveCanonicalAccountIdentity(input: {
  baseUrl: string;
  cookieHeader: string;
}): Promise<CanonicalAccountIdentity | null> {
  const client = createOrbitApiClient({
    authCookieHeader: input.cookieHeader,
    baseUrl: input.baseUrl
  });
  const result = await client.get<unknown>(ORBIT_API_ENDPOINTS.accountMe);

  return result.success
    ? canonicalAccountIdentityFromPayload(result.data)
    : null;
}

export function OrbitAuthSessionProvider({ children }: PropsWithChildren) {
  const { baseUrl, ready: baseUrlReady } = useOrbitApiBaseUrl();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [cookieHeader, setCookieHeader] = useState("");
  const [providers, setProviders] = useState<readonly "google"[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MobileAuthUser | null>(null);
  const [notificationSessionRevision, setNotificationSessionRevision] = useState(0);
  const authEnvironment = useRef({ baseUrl, baseUrlReady, revision: 0 });

  if (
    authEnvironment.current.baseUrl !== baseUrl ||
    authEnvironment.current.baseUrlReady !== baseUrlReady
  ) {
    authEnvironment.current = {
      baseUrl,
      baseUrlReady,
      revision: authEnvironment.current.revision + 1
    };
  }

  useEffect(() => () => {
    authEnvironment.current = {
      ...authEnvironment.current,
      revision: authEnvironment.current.revision + 1
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!baseUrlReady) {
      return () => {
        active = false;
      };
    }

    setReady(false);
    setAccountId(null);
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
          const identity = await resolveCanonicalAccountIdentity({
            baseUrl,
            cookieHeader: usesBrowserManagedSession ? "" : storedValue
          });

          if (!active || !identity) {
            return;
          }

          setCookieHeader(usesBrowserManagedSession ? "" : storedValue);
          setAccountId(identity.accountId);
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
          setAccountId(null);
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

  const clearNotificationSession = useCallback(async (): Promise<boolean> => {
    const client = createOrbitApiClient({ authCookieHeader: cookieHeader, baseUrl });
    const results = await Promise.allSettled([
      revokePushDeviceRegistrations([
        () => revokeRegisteredPushDevice({ client }),
      ], { endSession: true }),
      cancelOrbitManagedNotifications(),
    ]);
    return results[0].status === "fulfilled" && results[0].value
      && results[1].status === "fulfilled";
  }, [baseUrl, cookieHeader]);

  const discardUnacceptedSession = useCallback(async (session: MobileAuthSession) => {
    await Promise.allSettled([
      signOutOrbitSession({
        baseUrl,
        cookieHeader: usesBrowserManagedSession ? "" : session.cookieHeader
      }),
      ...(!usesBrowserManagedSession
        ? [nativeAuthSessionStorage.clear(baseUrl)]
        : [])
    ]);
  }, [baseUrl]);

  const acceptSession = useCallback(
    async (
      session: MobileAuthSession,
      requestRevision: number
    ): Promise<AuthActionResult> => {
      if (authEnvironment.current.revision !== requestRevision) {
        await discardUnacceptedSession(session);
        return obsoleteAuthActionResult();
      }
      const validation = await validateAuthSession({
        baseUrl,
        // Web 依赖刚由响应写入的 HttpOnly cookie；原生只使用返回 envelope
        // 中的 cookie，并在校验通过后写入 SecureStore。
        cookieHeader: usesBrowserManagedSession ? "" : session.cookieHeader
      });

      if (authEnvironment.current.revision !== requestRevision) {
        await discardUnacceptedSession(session);
        return obsoleteAuthActionResult();
      }
      if (!validation.success) {
        await discardUnacceptedSession(session);
        return {
          message: validation.error.message,
          success: false
        };
      }
      if (validation.data.user.id !== session.user.id) {
        await discardUnacceptedSession(session);
        return {
          message: "登录身份校验失败，请重新登录。",
          success: false
        };
      }

      const identity = await resolveCanonicalAccountIdentity({
        baseUrl,
        cookieHeader: usesBrowserManagedSession ? "" : session.cookieHeader
      });

      if (authEnvironment.current.revision !== requestRevision) {
        await discardUnacceptedSession(session);
        return obsoleteAuthActionResult();
      }
      if (!identity) {
        await discardUnacceptedSession(session);
        return {
          message: "无法确认当前账号，请稍后重试。",
          success: false
        };
      }

      if (!usesBrowserManagedSession) {
        try {
          if (
            (user && user.id !== validation.data.user.id) ||
            (accountId && accountId !== identity.accountId)
          ) {
            await clearSnapshots();
            if (!(await clearNotificationSession())) {
              console.warn("Orbit 旧账号通知清理未完全确认，继续切换账号；服务端可能仍保留设备注册");
            }
          }
          await nativeAuthSessionStorage.write(baseUrl, session.cookieHeader);
          if (authEnvironment.current.revision !== requestRevision) {
            await discardUnacceptedSession(session);
            return obsoleteAuthActionResult();
          }
        } catch {
          return {
            message: "无法安全保存登录状态，请稍后再试。",
            success: false
          };
        }
      }

      setCookieHeader(usesBrowserManagedSession ? "" : session.cookieHeader);
      setAccountId(identity.accountId);
      setUser(validation.data.user);
      return { success: true };
    },
    [accountId, baseUrl, clearNotificationSession, discardUnacceptedSession, user]
  );

  const signIn = useCallback(
    async (input: SignInInput): Promise<AuthActionResult> => {
      const requestRevision = authEnvironment.current.revision;
      const result = await signInWithMobileCredentials({
        baseUrl,
        email: input.email,
        password: input.password
      });

      if (!result.success) {
        return { message: result.error.message, success: false };
      }

      if (authEnvironment.current.revision !== requestRevision) {
        await discardUnacceptedSession(result.data);
        return obsoleteAuthActionResult();
      }
      return acceptSession(result.data, requestRevision);
    },
    [acceptSession, baseUrl, discardUnacceptedSession]
  );

  const signInWithGoogle = useCallback(
    async (next = "/profile"): Promise<AuthActionResult> => {
      const requestRevision = authEnvironment.current.revision;
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

        if (authEnvironment.current.revision !== requestRevision) {
          return obsoleteAuthActionResult();
        }
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

        if (authEnvironment.current.revision !== requestRevision) {
          await discardUnacceptedSession(exchange.data);
          return obsoleteAuthActionResult();
        }
        return acceptSession(exchange.data, requestRevision);
      } catch (error) {
        console.error("Orbit Google 登录启动失败", error);
        return {
          message: "Google 登录没有完成，请重新登录。",
          success: false
        };
      }
    },
    [acceptSession, baseUrl, discardUnacceptedSession]
  );

  const register = useCallback(
    async (input: RegisterInput): Promise<AuthActionResult> => {
      const requestRevision = authEnvironment.current.revision;
      const result = await registerOrbitAccount({
        baseUrl,
        email: input.email,
        ...(input.displayName ? { displayName: input.displayName } : {}),
        password: input.password
      });

      if (!result.success) {
        return { message: result.error.message, success: false };
      }

      if (authEnvironment.current.revision !== requestRevision) {
        return obsoleteAuthActionResult();
      }
      return { success: true };
    },
    [baseUrl]
  );

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    if (user !== null) {
      if (!(await clearNotificationSession())) {
        console.warn("Orbit 通知清理未完全确认，继续注销；服务端可能仍保留设备注册");
      }
      const result = await signOutOrbitSession({ baseUrl, cookieHeader });

      if (!result.success) {
        setNotificationSessionRevision((revision) => revision + 1);
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
    setAccountId(null);
    setCookieHeader("");
    setUser(null);
    return { success: true };
  }, [baseUrl, clearNotificationSession, cookieHeader, user]);

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
      setAccountId(null);
      setCookieHeader("");
      setUser(null);
      router.replace("/account/login" as Href);
    });
  }, [baseUrl, user]);

  const value = useMemo(
    () => ({
      accountId,
      actorId: accountId,
      cookieHeader,
      googleEnabled: providers.includes("google"),
      notificationSessionRevision,
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
      accountId,
      cookieHeader,
      notificationSessionRevision,
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

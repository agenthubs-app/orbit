import * as Crypto from "expo-crypto";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { AppState, Platform } from "react-native";
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
import { syncLifecycle } from "../data/sync/sync-lifecycle";
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
import { offlineIdentityStorage } from "./offline-identity-storage";
import {
  OFFLINE_IDENTITY_MAX_AGE_MS,
  classifyAccountCheck,
  classifySessionCheck,
  purgeSyncScope,
  trustedOfflineIdentity,
  type OfflineIdentityRecord,
  type SessionCheck
} from "./offline-identity";
import { createOrbitApiClient } from "./client";
import { signInWithBrowserCredentials } from "./browser-auth";
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
  /** Entered from the last online-validated identity because the server was unreachable. */
  offline: boolean;
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
// While offline, re-check the session this often; also on every return to the foreground.
const OFFLINE_REVALIDATE_INTERVAL_MS = 10_000;
// While online, refresh the 30-day offline window on foreground at most this often.
const ONLINE_REVALIDATE_AFTER_MS = 12 * 60 * 60 * 1000;

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

async function checkCanonicalAccountIdentity(input: {
  baseUrl: string;
  cookieHeader: string;
}): Promise<{ check: SessionCheck; identity: CanonicalAccountIdentity | null }> {
  const client = createOrbitApiClient({
    authCookieHeader: input.cookieHeader,
    baseUrl: input.baseUrl
  });
  const result = await client.get<unknown>(ORBIT_API_ENDPOINTS.accountMe);
  const identity = result.success ? canonicalAccountIdentityFromPayload(result.data) : null;
  if (identity) return { check: "valid", identity };
  // A 2xx without a usable owner proves nothing about the session: unreachable.
  return { check: result.success ? "unreachable" : classifyAccountCheck(result), identity: null };
}

async function resolveCanonicalAccountIdentity(input: {
  baseUrl: string;
  cookieHeader: string;
}): Promise<CanonicalAccountIdentity | null> {
  return (await checkCanonicalAccountIdentity(input)).identity;
}

async function rememberValidatedIdentity(record: OfflineIdentityRecord): Promise<void> {
  try {
    await offlineIdentityStorage.write(record);
  } catch {
    // Without the record an offline cold start shows login; the session itself is unaffected.
    console.warn("OFFLINE_IDENTITY_WRITE_FAILED");
  }
}

/**
 * The server explicitly rejected the stored session at cold start. Forget the cached
 * identity first (so no later offline start can use it), then erase that account's
 * mirror and key through the account-switch purge, then the cookie. As elsewhere, the
 * cookie is kept if key deletion fails so the pending cleanup is retried.
 */
async function eraseRejectedIdentity(baseUrl: string): Promise<void> {
  const cached = await offlineIdentityStorage.read(baseUrl).catch(() => null);
  try {
    await offlineIdentityStorage.clear(baseUrl);
  } catch {
    console.warn("OFFLINE_IDENTITY_CLEAR_FAILED");
  }
  const cleared = cached
    ? await purgeSyncScope(syncLifecycle, { baseUrl, actorId: cached.accountId })
    : true;
  if (cleared && !usesBrowserManagedSession) await nativeAuthSessionStorage.clear(baseUrl);
}

export function OrbitAuthSessionProvider({ children }: PropsWithChildren) {
  const { baseUrl, ready: baseUrlReady } = useOrbitApiBaseUrl();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [cookieHeader, setCookieHeader] = useState("");
  const [providers, setProviders] = useState<readonly "google"[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<MobileAuthUser | null>(null);
  const [notificationSessionRevision, setNotificationSessionRevision] = useState(0);
  const [offline, setOffline] = useState(false);
  const lastValidatedAt = useRef(0);
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
    setOffline(false);
    setProviders([]);
    setUser(null);

    const restoreSession = async () => {
      const requestRevision = authEnvironment.current.revision;
      const current = () => active && authEnvironment.current.revision === requestRevision;
      try {
        if (!(await syncLifecycle.setScope(null)) || !active) return;
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

        if (!current()) return;

        let check = classifySessionCheck(result);
        if (result.success) {
          const account = await checkCanonicalAccountIdentity({ baseUrl, cookieHeader: storedValue });

          if (!current()) return;

          if (account.identity) {
            const identity = account.identity;
            if (!(await syncLifecycle.setScope({ baseUrl, actorId: identity.accountId }))) return;
            if (!current()) return;
            const validatedAt = Date.now();
            await rememberValidatedIdentity({ version: 1, baseUrl, accountId: identity.accountId, user: result.data.user, validatedAt });
            if (!current()) return;

            lastValidatedAt.current = validatedAt;
            setCookieHeader(storedValue);
            setAccountId(identity.accountId);
            setUser(result.data.user);
            setOffline(false);
            return;
          }
          check = account.check === "rejected" ? "rejected" : "unreachable";
        }

        if (check === "rejected") {
          await eraseRejectedIdentity(baseUrl);
          return;
        }

        // Unreachable: enter with the last online-validated identity (at most 30 days old).
        const cached = trustedOfflineIdentity({
          record: await offlineIdentityStorage.read(baseUrl).catch(() => null),
          baseUrl,
          now: Date.now()
        });
        if (!cached || !current()) return;
        if (result.success && result.data.user.id !== cached.user.id) return;
        if (!(await syncLifecycle.setScope({ baseUrl, actorId: cached.accountId }))) return;
        if (!current()) return;

        lastValidatedAt.current = cached.validatedAt;
        setCookieHeader(storedValue);
        setAccountId(cached.accountId);
        setUser(cached.user);
        setOffline(true);
      } catch {
        if (active) {
          setAccountId(null);
          setCookieHeader("");
          setOffline(false);
          setUser(null);
        }
      }
    };

    const loadProviders = async () => {
      if (usesBrowserManagedSession) {
        setProviders([]);
        return;
      }
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
        ? [nativeAuthSessionStorage.clearIfMatches(baseUrl, session.cookieHeader)]
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
          if (!(await syncLifecycle.setScope({ baseUrl, actorId: identity.accountId }))) {
            return { message: "无法安全清除上个账号的本地数据，请稍后再试。", success: false };
          }
          if (authEnvironment.current.revision !== requestRevision) {
            await discardUnacceptedSession(session);
            return obsoleteAuthActionResult();
          }
          if (
            (user && user.id !== validation.data.user.id) ||
            (accountId && accountId !== identity.accountId)
          ) {
            if (!(await clearNotificationSession())) {
              console.warn("Orbit 旧账号通知清理未完全确认，继续切换账号；服务端可能仍保留设备注册");
            }
          }
          if (authEnvironment.current.revision !== requestRevision) {
            await discardUnacceptedSession(session);
            return obsoleteAuthActionResult();
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

      const validatedAt = Date.now();
      await rememberValidatedIdentity({ version: 1, baseUrl, accountId: identity.accountId, user: validation.data.user, validatedAt });
      if (authEnvironment.current.revision !== requestRevision) {
        await discardUnacceptedSession(session);
        return obsoleteAuthActionResult();
      }

      lastValidatedAt.current = validatedAt;
      setCookieHeader(usesBrowserManagedSession ? "" : session.cookieHeader);
      setAccountId(identity.accountId);
      setUser(validation.data.user);
      setOffline(false);
      return { success: true };
    },
    [accountId, baseUrl, clearNotificationSession, discardUnacceptedSession, user]
  );

  const signIn = useCallback(
    async (input: SignInInput): Promise<AuthActionResult> => {
      const requestRevision = ++authEnvironment.current.revision;
      const result = usesBrowserManagedSession
        ? await signInWithBrowserCredentials({
            baseUrl,
            email: input.email,
            password: input.password
          })
        : await signInWithMobileCredentials({
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
      const requestRevision = ++authEnvironment.current.revision;
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
    const requestRevision = ++authEnvironment.current.revision;
    if (user !== null) {
      if (!(await clearNotificationSession())) {
        console.warn("Orbit 通知清理未完全确认，继续注销；服务端可能仍保留设备注册");
      }
      if (authEnvironment.current.revision !== requestRevision) return obsoleteAuthActionResult();
      const result = await signOutOrbitSession({ baseUrl, cookieHeader });
      if (authEnvironment.current.revision !== requestRevision) return obsoleteAuthActionResult();

      if (!result.success) {
        setNotificationSessionRevision((revision) => revision + 1);
        return { message: result.error.message, success: false };
      }
    }

    try {
      // Before anything else: a signed-out account must never come back offline.
      await offlineIdentityStorage.clear(baseUrl);
    } catch {
      return {
        message: "无法清除这台设备上的登录状态，请稍后再试。",
        success: false
      };
    }

    if (!usesBrowserManagedSession) {
      try {
        if (!(await syncLifecycle.setScope(null))) {
          return { message: "无法安全清除这台设备上的本地数据，请稍后再试。", success: false };
        }
        if (authEnvironment.current.revision !== requestRevision) return obsoleteAuthActionResult();
        await nativeAuthSessionStorage.clear(baseUrl);
      } catch {
        return {
          message: "无法清除这台设备上的登录状态，请稍后再试。",
          success: false
        };
      }
    }

    if (authEnvironment.current.revision !== requestRevision) return obsoleteAuthActionResult();
    setAccountId(null);
    setCookieHeader("");
    setOffline(false);
    setUser(null);
    return { success: true };
  }, [baseUrl, clearNotificationSession, cookieHeader, user]);

  // The server has rejected this device's session (a 401 on any request, or an explicit
  // rejection when re-checking): forget the cached identity, purge the open mirror and
  // key, then the cookie, and go to login.
  const endRejectedSession = useCallback(() => {
    authEnvironment.current.revision += 1;
    // Keep the old auth storage if key deletion fails: restoring that scope
    // must retry its cleanup before another account can be accepted.
    void offlineIdentityStorage.clear(baseUrl)
      .catch(() => console.warn("OFFLINE_IDENTITY_CLEAR_FAILED"))
      .then(() => syncLifecycle.setScope(null))
      .then(async cleared => {
        if (cleared && !usesBrowserManagedSession) await nativeAuthSessionStorage.clear(baseUrl);
      })
      .catch(() => console.warn("SYNC_SESSION_CLEANUP_FAILED"));
    setAccountId(null);
    setCookieHeader("");
    setOffline(false);
    setUser(null);
    router.replace("/account/login" as Href);
  }, [baseUrl]);

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
      endRejectedSession();
    });
  }, [endRejectedSession, user]);

  // Re-check the session: every few seconds and on foreground while offline (reconnect
  // is noticed at once), and on foreground while online when the last validation is old,
  // so the 30-day offline window follows real use.
  useEffect(() => {
    if (user === null || accountId === null) return;
    let active = true;
    let running = false;
    const signedInUserId = user.id;
    const signedInAccountId = accountId;

    const revalidate = async () => {
      if (running || !active) return;
      running = true;
      const requestRevision = authEnvironment.current.revision;
      const current = () => active && authEnvironment.current.revision === requestRevision;
      try {
        const result = await validateAuthSession({ baseUrl, cookieHeader });
        if (!current()) return;
        let check = classifySessionCheck(result);
        if (result.success) {
          if (result.data.user.id !== signedInUserId) {
            check = "rejected";
          } else {
            const account = await checkCanonicalAccountIdentity({ baseUrl, cookieHeader });
            if (!current()) return;
            if (account.identity && account.identity.accountId === signedInAccountId) {
              const validatedAt = Date.now();
              await rememberValidatedIdentity({ version: 1, baseUrl, accountId: signedInAccountId, user: result.data.user, validatedAt });
              if (!current()) return;
              lastValidatedAt.current = validatedAt;
              setOffline(false);
              return;
            }
            check = account.identity || account.check === "rejected" ? "rejected" : "unreachable";
          }
        }
        if (check === "rejected") {
          active = false;
          endRejectedSession();
          return;
        }
        if (offline && Date.now() - lastValidatedAt.current > OFFLINE_IDENTITY_MAX_AGE_MS) {
          // Still unreachable and the 30 days are over: ask for login, erase nothing.
          active = false;
          authEnvironment.current.revision += 1;
          setAccountId(null);
          setCookieHeader("");
          setOffline(false);
          setUser(null);
          router.replace("/account/login" as Href);
        }
      } catch {
        // A failed check changes nothing; the next tick or foreground tries again.
      } finally {
        running = false;
      }
    };

    const timer = offline ? setInterval(() => void revalidate(), OFFLINE_REVALIDATE_INTERVAL_MS) : null;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      if (offline || Date.now() - lastValidatedAt.current > ONLINE_REVALIDATE_AFTER_MS) void revalidate();
    });
    return () => {
      active = false;
      if (timer) clearInterval(timer);
      subscription.remove();
    };
  }, [accountId, baseUrl, cookieHeader, endRejectedSession, offline, user]);

  const value = useMemo(
    () => ({
      accountId,
      actorId: accountId,
      cookieHeader,
      googleEnabled: providers.includes("google"),
      notificationSessionRevision,
      offline,
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
      offline,
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

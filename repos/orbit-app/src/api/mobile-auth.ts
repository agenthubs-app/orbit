import { normalizeOrbitApiBaseUrl } from "./base-url";
import { ORBIT_API_ENDPOINTS } from "./endpoints";

export const MOBILE_AUTH_CALLBACK_URI = "orbit://account/oauth";

export type MobileAuthProviderId = "credentials" | "google";

export interface MobileAuthUser {
  email: string;
  id: string;
  name: string;
}

export interface MobileAuthSession {
  cookieHeader: string;
  expiresAt: string;
  user: MobileAuthUser;
}

export interface MobileAuthFailure {
  error: {
    code: string;
    message: string;
    status: number;
  };
  success: false;
}

export type MobileAuthResult<TData> =
  | { data: TData; success: true }
  | MobileAuthFailure;

export type MobileAuthFetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface GoogleOAuthAttempt {
  codeVerifier: string;
  redirectUri: typeof MOBILE_AUTH_CALLBACK_URI;
  startUrl: string;
  state: string;
}

type JsonRecord = Record<string, unknown>;

function endpoint(baseUrl: string, path: string): string {
  return `${normalizeOrbitApiBaseUrl(baseUrl)}${path}`;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<JsonRecord | null> {
  try {
    const value: unknown = await response.json();
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function stringField(value: JsonRecord | null, key: string): string {
  const field = value?.[key];
  return typeof field === "string" ? field : "";
}

function failure(
  code: string,
  message: string,
  status = 0
): MobileAuthFailure {
  return {
    error: { code, message, status },
    success: false
  };
}

function networkFailure(_error: unknown): MobileAuthFailure {
  return failure(
    "ORBIT_APP_AUTH_NETWORK_ERROR",
    "网络连接失败，请检查网络后重试。"
  );
}

const mobileAuthMessages: Record<string, string> = {
  MOBILE_AUTH_CODE_EXPIRED: "这次登录已过期，请重新登录。",
  MOBILE_AUTH_CODE_USED: "这次登录已经完成，请重新打开登录。",
  MOBILE_AUTH_CONFIGURATION_UNAVAILABLE: "登录服务暂时不可用，请稍后再试。",
  MOBILE_AUTH_INVALID_BROKER_REQUEST: "Google 登录校验失败，请重新登录。",
  MOBILE_AUTH_INVALID_INPUT: "登录请求无效，请重新尝试。",
  MOBILE_AUTH_INVALID_REDIRECT: "登录回调无效，请重新尝试。",
  MOBILE_AUTH_PKCE_MISMATCH: "Google 登录校验失败，请重新登录。",
  MOBILE_AUTH_STATE_MISMATCH: "Google 登录校验失败，请重新登录。",
  MOBILE_AUTH_UNAUTHORIZED: "邮箱或密码不正确。"
};

function responseFailure(
  response: Response,
  payload: JsonRecord | null,
  fallbackCode: string,
  fallbackMessage: string
): MobileAuthFailure {
  const error = isRecord(payload?.error) ? payload.error : null;
  const context = isRecord(error?.context) ? error.context : null;
  const detailedCode =
    stringField(context, "mobileAuthErrorCode") ||
    stringField(error, "code") ||
    fallbackCode;

  return failure(
    detailedCode,
    mobileAuthMessages[detailedCode] ?? fallbackMessage,
    response.status
  );
}

function mobileUser(value: unknown): MobileAuthUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const email = stringField(value, "email").trim();
  const id = stringField(value, "id").trim();
  const name = stringField(value, "name").trim();

  return email && id && name ? { email, id, name } : null;
}

function mobileSession(value: unknown): MobileAuthSession | null {
  if (!isRecord(value)) {
    return null;
  }

  const cookieHeader = stringField(value, "cookieHeader").trim();
  const expiresAt = stringField(value, "expiresAt").trim();
  const user = mobileUser(value.user);

  if (
    !cookieHeader ||
    !/(?:^|;\s*)(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/u.test(
      cookieHeader
    ) ||
    !expiresAt ||
    !user
  ) {
    return null;
  }

  return { cookieHeader, expiresAt, user };
}

async function postForSession({
  baseUrl,
  body,
  fallbackCode,
  fallbackMessage,
  fetchImpl,
  path
}: {
  baseUrl: string;
  body: JsonRecord;
  fallbackCode: string;
  fallbackMessage: string;
  fetchImpl: MobileAuthFetchLike;
  path: string;
}): Promise<MobileAuthResult<MobileAuthSession>> {
  let response: Response;

  try {
    response = await fetchImpl(endpoint(baseUrl, path), {
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  } catch (error) {
    return networkFailure(error);
  }

  const payload = await readJson(response);
  const data = isRecord(payload?.data) ? payload.data : null;
  const session = mobileSession(data);

  if (!response.ok || payload?.success !== true || !session) {
    return responseFailure(
      response,
      payload,
      fallbackCode,
      fallbackMessage
    );
  }

  return { data: session, success: true };
}

export async function fetchMobileAuthProviders({
  baseUrl,
  fetchImpl = fetch
}: {
  baseUrl: string;
  fetchImpl?: MobileAuthFetchLike;
}): Promise<
  MobileAuthResult<{ providers: MobileAuthProviderId[] }>
> {
  let response: Response;

  try {
    response = await fetchImpl(
      endpoint(baseUrl, ORBIT_API_ENDPOINTS.authMobileProviders),
      {
        cache: "no-store",
        headers: { Accept: "application/json" },
        method: "GET"
      }
    );
  } catch (error) {
    return networkFailure(error);
  }

  const payload = await readJson(response);
  const data = isRecord(payload?.data) ? payload.data : null;
  const values = Array.isArray(data?.providers) ? data.providers : [];
  const providers = values.filter(
    (value): value is MobileAuthProviderId =>
      value === "credentials" || value === "google"
  );

  if (!response.ok || payload?.success !== true) {
    return responseFailure(
      response,
      payload,
      "ORBIT_APP_AUTH_PROVIDERS_UNAVAILABLE",
      "登录方式暂时无法加载。"
    );
  }

  return { data: { providers }, success: true };
}

export async function signInWithMobileCredentials({
  baseUrl,
  email,
  fetchImpl = fetch,
  password
}: {
  baseUrl: string;
  email: string;
  fetchImpl?: MobileAuthFetchLike;
  password: string;
}): Promise<MobileAuthResult<MobileAuthSession>> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return failure(
      "ORBIT_APP_AUTH_MISSING_CREDENTIALS",
      "请输入邮箱和密码。"
    );
  }

  return postForSession({
    baseUrl,
    body: { email: normalizedEmail, password },
    fallbackCode: "ORBIT_APP_AUTH_INVALID_CREDENTIALS",
    fallbackMessage: "邮箱或密码不正确。",
    fetchImpl,
    path: ORBIT_API_ENDPOINTS.authMobileCredentials
  });
}

function base64Url(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    const chunk =
      (first << 16) | ((second ?? 0) << 8) | (third ?? 0);

    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    if (second !== undefined) {
      output += alphabet[(chunk >> 6) & 63];
    }
    if (third !== undefined) {
      output += alphabet[chunk & 63];
    }
  }

  return output;
}

function asciiBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

export async function createGoogleOAuthAttempt({
  baseUrl,
  digest,
  next = "/profile",
  randomBytes
}: {
  baseUrl: string;
  digest: (value: Uint8Array) => Promise<Uint8Array>;
  next?: string;
  randomBytes: (length: number) => Promise<Uint8Array>;
}): Promise<GoogleOAuthAttempt> {
  const codeVerifier = base64Url(await randomBytes(32));
  const state = base64Url(await randomBytes(24));
  const codeChallenge = base64Url(await digest(asciiBytes(codeVerifier)));
  const startUrl = new URL(
    endpoint(baseUrl, ORBIT_API_ENDPOINTS.authMobileGoogleStart)
  );
  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/profile";

  startUrl.searchParams.set("code_challenge", codeChallenge);
  startUrl.searchParams.set("code_challenge_method", "S256");
  startUrl.searchParams.set("next", safeNext);
  startUrl.searchParams.set("redirect_uri", MOBILE_AUTH_CALLBACK_URI);
  startUrl.searchParams.set("state", state);

  return {
    codeVerifier,
    redirectUri: MOBILE_AUTH_CALLBACK_URI,
    startUrl: startUrl.toString(),
    state
  };
}

export function parseGoogleOAuthCallback(
  callbackUrl: string,
  expectedState: string
):
  | { code: string; state: string; success: true }
  | MobileAuthFailure {
  let callback: URL;

  try {
    callback = new URL(callbackUrl);
  } catch {
    return failure(
      "ORBIT_APP_GOOGLE_CALLBACK_INVALID",
      "Google 登录没有正确返回，请重新登录。"
    );
  }

  const state = callback.searchParams.get("state") ?? "";
  const code = callback.searchParams.get("code") ?? "";
  const fixedCallback =
    callback.protocol === "orbit:" &&
    callback.host === "account" &&
    callback.pathname === "/oauth";

  if (!fixedCallback || !code || !state || state !== expectedState) {
    return failure(
      "ORBIT_APP_GOOGLE_CALLBACK_INVALID",
      "Google 登录校验失败，请重新登录。"
    );
  }

  return { code, state, success: true };
}

export function parseGoogleOAuthBrowserResult(
  result: { type: string; url?: string | null },
  expectedState: string
):
  | { code: string; state: string; success: true }
  | MobileAuthFailure {
  if (result.type !== "success" || !result.url) {
    return failure(
      "ORBIT_APP_GOOGLE_CANCELLED",
      "已取消 Google 登录。"
    );
  }

  return parseGoogleOAuthCallback(result.url, expectedState);
}

export async function exchangeGoogleOAuthCode({
  baseUrl,
  code,
  codeVerifier,
  fetchImpl = fetch,
  state
}: {
  baseUrl: string;
  code: string;
  codeVerifier: string;
  fetchImpl?: MobileAuthFetchLike;
  state: string;
}): Promise<MobileAuthResult<MobileAuthSession>> {
  return postForSession({
    baseUrl,
    body: { code, codeVerifier, state },
    fallbackCode: "ORBIT_APP_GOOGLE_EXCHANGE_FAILED",
    fallbackMessage: "Google 登录没有完成，请重新登录。",
    fetchImpl,
    path: ORBIT_API_ENDPOINTS.authMobileGoogleExchange
  });
}

export async function validateAuthSession({
  baseUrl,
  cookieHeader,
  fetchImpl = fetch
}: {
  baseUrl: string;
  cookieHeader: string;
  fetchImpl?: MobileAuthFetchLike;
}): Promise<
  MobileAuthResult<{ expiresAt: string; user: MobileAuthUser }>
> {
  let response: Response;
  const normalizedCookieHeader = cookieHeader.trim();

  try {
    response = await fetchImpl(
      endpoint(baseUrl, ORBIT_API_ENDPOINTS.authSession),
      {
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(normalizedCookieHeader
            ? { Cookie: normalizedCookieHeader }
            : {})
        },
        method: "GET"
      }
    );
  } catch (error) {
    return networkFailure(error);
  }

  const payload = await readJson(response);
  const user = mobileUser(payload?.user);
  const expiresAt = stringField(payload, "expires").trim();

  if (!response.ok || !user) {
    return failure(
      "ORBIT_APP_AUTH_SESSION_INVALID",
      "登录状态已失效，请重新登录。",
      response.status
    );
  }

  return {
    success: true,
    data: { expiresAt, user }
  };
}

import { normalizeOrbitApiBaseUrl } from "./base-url";
import { ORBIT_API_ENDPOINTS } from "./endpoints";
import {
  exchangeGoogleOAuthCode,
  fetchMobileAuthProviders as fetchMobileAuthProviderEnvelope,
  MOBILE_AUTH_CALLBACK_URI,
  signInWithMobileCredentials,
  type MobileAuthProviderId
} from "./mobile-auth";

export type AuthFetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface AuthSessionSuccess {
  cookieHeader: string;
  redirectUrl?: string;
  success: true;
}

export interface AuthSessionFailure {
  error: {
    code: string;
    message: string;
    status: number;
  };
  success: false;
}

export type AuthSessionResult = AuthSessionSuccess | AuthSessionFailure;

export interface RegisterAccountSuccess {
  success: true;
}

export interface RegisterAccountFailure {
  error: {
    code: string;
    message: string;
    status: number;
  };
  success: false;
}

export type RegisterAccountResult =
  | RegisterAccountSuccess
  | RegisterAccountFailure;

export type MobileAuthProvidersResult =
  | {
      providers: MobileAuthProviderId[];
      success: true;
    }
  | AuthSessionFailure;

interface JsonBody {
  [key: string]: unknown;
}

function authUrl(baseUrl: string, path: string): string {
  return `${normalizeOrbitApiBaseUrl(baseUrl)}${path}`;
}

function authEndpoint(baseUrl: string, path: string): string {
  return `${normalizeOrbitApiBaseUrl(baseUrl)}${path}`;
}

function authFailure(
  code: string,
  message: string,
  status = 0
): AuthSessionFailure {
  return {
    error: { code, message, status },
    success: false
  };
}

function registerFailure(
  code: string,
  message: string,
  status = 0
): RegisterAccountFailure {
  return {
    error: { code, message, status },
    success: false
  };
}

function setCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const header = response.headers.get("Set-Cookie");
  return header ? splitSetCookieHeader(header) : [];
}

function splitSetCookieHeader(header: string): string[] {
  return header
    .split(/,(?=\s*[^;,=\s]+(?:\.[^;,=\s]+)*=)/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

function splitCookieHeader(cookieHeader: string): [string, string][] {
  return cookieHeader
    .split(";")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((pair) => {
      const separatorIndex = pair.indexOf("=");
      return separatorIndex === -1
        ? [pair, ""]
        : [pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1)];
    });
}

function expiresInPast(attributes: string[], now: Date): boolean {
  const maxAge = attributes.find((part) => /^max-age=/iu.test(part));

  if (maxAge) {
    const value = Number(maxAge.slice(maxAge.indexOf("=") + 1));
    return Number.isFinite(value) && value <= 0;
  }

  const expires = attributes.find((part) => /^expires=/iu.test(part));

  if (!expires) {
    return false;
  }

  const value = Date.parse(expires.slice(expires.indexOf("=") + 1));
  return Number.isFinite(value) && value <= now.getTime();
}

export function mergeSetCookieHeaders(
  cookieHeader: string,
  setCookieValues: string[] | Response,
  now = new Date()
): string {
  const jar = new Map(splitCookieHeader(cookieHeader));
  const values = Array.isArray(setCookieValues)
    ? setCookieValues
    : setCookieHeaders(setCookieValues);

  for (const setCookie of values) {
    const [cookiePair = "", ...attributes] = setCookie.split(";");
    const separatorIndex = cookiePair.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookiePair.slice(0, separatorIndex).trim();
    const value = cookiePair.slice(separatorIndex + 1).trim();

    if (!name) {
      continue;
    }

    if (expiresInPast(attributes.map((part) => part.trim()), now)) {
      jar.delete(name);
      continue;
    }

    jar.set(name, value);
  }

  return Array.from(jar.entries())
    .filter(([name]) => Boolean(name))
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

export async function fetchMobileAuthProviders({
  baseUrl,
  fetchImpl = fetch
}: {
  baseUrl: string;
  fetchImpl?: AuthFetchLike;
}): Promise<MobileAuthProvidersResult> {
  const result = await fetchMobileAuthProviderEnvelope({ baseUrl, fetchImpl });

  if (!result.success) {
    return authFailure(
      result.error.code,
      result.error.message,
      result.error.status
    );
  }

  return {
    providers: result.data.providers,
    success: true
  };
}

export function buildMobileGoogleStartUrl({
  baseUrl,
  codeChallenge,
  next = "/profile",
  state
}: {
  baseUrl: string;
  codeChallenge: string;
  next?: string;
  state: string;
}): string {
  const startUrl = new URL(
    authEndpoint(baseUrl, ORBIT_API_ENDPOINTS.authMobileGoogleStart)
  );

  startUrl.searchParams.set("code_challenge", codeChallenge);
  startUrl.searchParams.set("code_challenge_method", "S256");
  startUrl.searchParams.set(
    "next",
    next.startsWith("/") && !next.startsWith("//") ? next : "/profile"
  );
  startUrl.searchParams.set("redirect_uri", MOBILE_AUTH_CALLBACK_URI);
  startUrl.searchParams.set("state", state);

  return startUrl.toString();
}

export async function exchangeMobileGoogleCode({
  baseUrl,
  code,
  codeVerifier,
  fetchImpl = fetch,
  state
}: {
  baseUrl: string;
  code: string;
  codeVerifier: string;
  fetchImpl?: AuthFetchLike;
  state: string;
}): Promise<AuthSessionResult> {
  const result = await exchangeGoogleOAuthCode({
    baseUrl,
    code,
    codeVerifier,
    fetchImpl,
    state
  });

  if (!result.success) {
    return authFailure(
      result.error.code,
      result.error.message,
      result.error.status
    );
  }

  return {
    cookieHeader: result.data.cookieHeader,
    success: true
  };
}

function requestHeaders(
  cookieHeader: string,
  headers: Record<string, string>
): Record<string, string> {
  const nextHeaders = { ...headers };

  if (cookieHeader.trim()) {
    nextHeaders.Cookie = cookieHeader.trim();
  }

  return nextHeaders;
}

async function readJson(response: Response): Promise<JsonBody | null> {
  try {
    const payload = await response.json();
    return typeof payload === "object" && payload !== null && !Array.isArray(payload)
      ? (payload as JsonBody)
      : null;
  } catch {
    return null;
  }
}

function stringField(payload: JsonBody | null, fieldName: string): string {
  const value = payload?.[fieldName];
  return typeof value === "string" ? value : "";
}

function callbackUrl(baseUrl: string, redirectTo: string): string {
  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
  return `${normalizeOrbitApiBaseUrl(baseUrl)}/app${safeRedirect}`;
}

function authErrorCodeFromRedirect(url: string): string {
  try {
    return new URL(url).searchParams.get("error") ?? "";
  } catch {
    return "";
  }
}

function hasSessionCookie(cookieHeader: string): boolean {
  return /(?:^|;\s*)(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/u.test(
    cookieHeader
  );
}

export async function signInWithCredentials({
  baseUrl,
  cookieHeader = "",
  email,
  fetchImpl = fetch,
  password,
  redirectTo = "/dashboard"
}: {
  baseUrl: string;
  cookieHeader?: string;
  email: string;
  fetchImpl?: AuthFetchLike;
  password: string;
  redirectTo?: string;
}): Promise<AuthSessionResult> {
  const result = await signInWithMobileCredentials({
    baseUrl,
    email,
    fetchImpl,
    password
  });

  if (result.success === false) {
    return authFailure(
      result.error.code === "MOBILE_AUTH_UNAUTHORIZED"
        ? "ORBIT_APP_AUTH_INVALID_CREDENTIALS"
        : result.error.code,
      result.error.message,
      result.error.status
    );
  }

  return {
    cookieHeader: result.data.cookieHeader,
    redirectUrl: callbackUrl(baseUrl, redirectTo),
    success: true
  };
}

export async function registerOrbitAccount({
  baseUrl,
  displayName,
  email,
  fetchImpl = fetch,
  password
}: {
  baseUrl: string;
  displayName?: string;
  email: string;
  fetchImpl?: AuthFetchLike;
  password: string;
}): Promise<RegisterAccountResult> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || password.length < 8) {
    return registerFailure(
      "ORBIT_APP_AUTH_INVALID_INPUT",
      "请输入邮箱，并设置至少 8 位密码。"
    );
  }

  let response: Response;

  try {
    response = await fetchImpl(authUrl(baseUrl, ORBIT_API_ENDPOINTS.authRegister), {
      body: JSON.stringify({
        ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
        email: normalizedEmail,
        password
      }),
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  } catch (error) {
    return registerFailure(
      "ORBIT_APP_AUTH_NETWORK_ERROR",
      error instanceof Error ? error.message : "网络连接失败。"
    );
  }

  const payload = await readJson(response);
  const success = payload?.success === true;

  if (!response.ok || !success) {
    const errorBody =
      typeof payload?.error === "object" && payload.error !== null
        ? (payload.error as JsonBody)
        : {};
    const code = stringField(errorBody, "code");
    const message = stringField(errorBody, "message");

    return registerFailure(
      code === "CONFLICT" ? "ORBIT_APP_AUTH_EMAIL_TAKEN" : code || "ORBIT_APP_AUTH_REGISTER_FAILED",
      response.status === 409
        ? "该邮箱已注册，请直接登录。"
        : message || "创建账号失败，请稍后再试。",
      response.status
    );
  }

  return { success: true };
}

export async function signOutOrbitSession({
  baseUrl,
  cookieHeader,
  fetchImpl = fetch
}: {
  baseUrl: string;
  cookieHeader: string;
  fetchImpl?: AuthFetchLike;
}): Promise<AuthSessionResult> {
  let response: Response;

  try {
    response = await fetchImpl(
      authUrl(baseUrl, ORBIT_API_ENDPOINTS.accountSessionSignOut),
      {
        credentials: "include",
        headers: requestHeaders(cookieHeader, { Accept: "application/json" }),
        method: "POST"
      }
    );
  } catch (error) {
    return authFailure(
      "ORBIT_APP_AUTH_NETWORK_ERROR",
      error instanceof Error ? error.message : "网络连接失败。"
    );
  }

  if (!response.ok) {
    return authFailure(
      "ORBIT_APP_AUTH_SIGN_OUT_FAILED",
      "退出登录失败，请稍后再试。",
      response.status
    );
  }

  const payload = await readJson(response);
  if (payload?.success === false) {
    const errorBody =
      typeof payload.error === "object" && payload.error !== null
        ? (payload.error as JsonBody)
        : {};

    return authFailure(
      stringField(errorBody, "code") || "ORBIT_APP_AUTH_SIGN_OUT_FAILED",
      stringField(errorBody, "message") || "退出登录失败，请稍后再试。",
      response.status
    );
  }

  return {
    cookieHeader: "",
    success: true
  };
}

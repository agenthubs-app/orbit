import { normalizeOrbitApiBaseUrl } from "./base-url";
import { ORBIT_API_ENDPOINTS } from "./endpoints";

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

interface JsonBody {
  [key: string]: unknown;
}

function authUrl(baseUrl: string, path: string): string {
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

async function getCsrfToken({
  baseUrl,
  cookieHeader,
  fetchImpl
}: {
  baseUrl: string;
  cookieHeader: string;
  fetchImpl: AuthFetchLike;
}): Promise<
  | { cookieHeader: string; csrfToken: string; success: true }
  | AuthSessionFailure
> {
  let response: Response;

  try {
    response = await fetchImpl(authUrl(baseUrl, ORBIT_API_ENDPOINTS.authCsrf), {
      credentials: "include",
      headers: requestHeaders(cookieHeader, { Accept: "application/json" }),
      method: "GET"
    });
  } catch (error) {
    return authFailure(
      "ORBIT_APP_AUTH_NETWORK_ERROR",
      error instanceof Error ? error.message : "网络连接失败。"
    );
  }

  const payload = await readJson(response);
  const csrfToken = stringField(payload, "csrfToken");
  const nextCookieHeader = mergeSetCookieHeaders(cookieHeader, response);

  if (!response.ok || !csrfToken) {
    return authFailure(
      "ORBIT_APP_AUTH_CSRF_UNAVAILABLE",
      "登录入口暂时不可用，请稍后再试。",
      response.status
    );
  }

  return {
    cookieHeader: nextCookieHeader,
    csrfToken,
    success: true
  };
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
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return authFailure(
      "ORBIT_APP_AUTH_MISSING_CREDENTIALS",
      "请输入邮箱和密码。"
    );
  }

  const csrf = await getCsrfToken({ baseUrl, cookieHeader, fetchImpl });

  if (!csrf.success) {
    return csrf;
  }

  let response: Response;

  try {
    response = await fetchImpl(
      authUrl(baseUrl, ORBIT_API_ENDPOINTS.authCredentialsCallback),
      {
        body: new URLSearchParams({
          callbackUrl: callbackUrl(baseUrl, redirectTo),
          csrfToken: csrf.csrfToken,
          email: normalizedEmail,
          password
        }),
        credentials: "include",
        headers: requestHeaders(csrf.cookieHeader, {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1"
        }),
        method: "POST"
      }
    );
  } catch (error) {
    return authFailure(
      "ORBIT_APP_AUTH_NETWORK_ERROR",
      error instanceof Error ? error.message : "网络连接失败。"
    );
  }

  const payload = await readJson(response);
  const redirectUrl = stringField(payload, "url");
  const redirectError = authErrorCodeFromRedirect(redirectUrl);
  const nextCookieHeader = mergeSetCookieHeaders(csrf.cookieHeader, response);

  if (!response.ok || redirectError) {
    return authFailure(
      "ORBIT_APP_AUTH_INVALID_CREDENTIALS",
      "邮箱或密码不正确。",
      response.status
    );
  }

  if (!hasSessionCookie(nextCookieHeader)) {
    return authFailure(
      "ORBIT_APP_AUTH_SESSION_MISSING",
      "登录成功，但没有拿到可保存的会话。",
      response.status
    );
  }

  return {
    cookieHeader: nextCookieHeader,
    redirectUrl,
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
  const csrf = await getCsrfToken({ baseUrl, cookieHeader, fetchImpl });

  if (!csrf.success) {
    return csrf;
  }

  let response: Response;

  try {
    response = await fetchImpl(authUrl(baseUrl, ORBIT_API_ENDPOINTS.authSignOut), {
      body: new URLSearchParams({
        callbackUrl: `${normalizeOrbitApiBaseUrl(baseUrl)}/app`,
        csrfToken: csrf.csrfToken
      }),
      credentials: "include",
      headers: requestHeaders(csrf.cookieHeader, {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Auth-Return-Redirect": "1"
      }),
      method: "POST"
    });
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

  return {
    cookieHeader: mergeSetCookieHeaders(csrf.cookieHeader, response),
    success: true
  };
}

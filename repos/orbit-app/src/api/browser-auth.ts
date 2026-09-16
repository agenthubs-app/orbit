import { normalizeOrbitApiBaseUrl } from "./browser-api-origin";
import {
  validateAuthSession,
  type MobileAuthFetchLike,
  type MobileAuthResult,
  type MobileAuthSession
} from "./mobile-auth";

function failure(code: string, message: string, status = 0): MobileAuthResult<never> {
  return { error: { code, message, status }, success: false };
}

async function csrfToken(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return "";
    const value = (payload as Record<string, unknown>).csrfToken;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

async function authCallbackUrl(response: Response): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return "";
    const value = (payload as Record<string, unknown>).url;
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export async function signInWithBrowserCredentials({
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
  const normalizedBaseUrl = normalizeOrbitApiBaseUrl(baseUrl);
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return failure("ORBIT_APP_AUTH_MISSING_CREDENTIALS", "请输入邮箱和密码。");
  }

  try {
    const csrfResponse = await fetchImpl(`${normalizedBaseUrl}/api/auth/csrf`, {
      cache: "no-store",
      credentials: "include",
      headers: { Accept: "application/json" },
      method: "GET"
    });
    const token = await csrfToken(csrfResponse);
    if (!csrfResponse.ok || !token) {
      return failure(
        "ORBIT_APP_AUTH_CSRF_UNAVAILABLE",
        "登录服务暂时不可用，请稍后再试。",
        csrfResponse.status
      );
    }

    const callbackResponse = await fetchImpl(
      `${normalizedBaseUrl}/api/auth/callback/credentials`,
      {
        body: new URLSearchParams({
          callbackUrl: `${normalizedBaseUrl}/`,
          csrfToken: token,
          email: normalizedEmail,
          password
        }).toString(),
        cache: "no-store",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1"
        },
        method: "POST",
        redirect: "manual"
      }
    );

    if (callbackResponse.status >= 500) {
      return failure(
        "ORBIT_APP_AUTH_SERVICE_UNAVAILABLE",
        "登录服务暂时不可用，请稍后再试。",
        callbackResponse.status
      );
    }

    const callbackUrl = await authCallbackUrl(callbackResponse);
    if (!callbackResponse.ok || !callbackUrl) {
      return failure(
        "ORBIT_APP_AUTH_SERVICE_UNAVAILABLE",
        "登录服务暂时不可用，请稍后再试。",
        callbackResponse.status
      );
    }

    let callbackError = "";
    try {
      callbackError = new URL(callbackUrl, normalizedBaseUrl).searchParams.get("error") ?? "";
    } catch {
      return failure(
        "ORBIT_APP_AUTH_SERVICE_UNAVAILABLE",
        "登录服务暂时不可用，请稍后再试。",
        callbackResponse.status
      );
    }
    if (callbackError) {
      return failure(
        callbackError === "CredentialsSignin"
          ? "ORBIT_APP_AUTH_INVALID_CREDENTIALS"
          : "ORBIT_APP_AUTH_CALLBACK_FAILED",
        callbackError === "CredentialsSignin"
          ? "邮箱或密码不正确。"
          : "登录没有完成，请重新登录。",
        401
      );
    }

    const session = await validateAuthSession({
      baseUrl: normalizedBaseUrl,
      cookieHeader: "",
      fetchImpl
    });
    if (!session.success) {
      if (session.error.code === "ORBIT_APP_AUTH_NETWORK_ERROR") return session;
      return failure(
        "ORBIT_APP_AUTH_INVALID_CREDENTIALS",
        "邮箱或密码不正确。",
        session.error.status
      );
    }
    if (session.data.user.email.trim().toLowerCase() !== normalizedEmail) {
      return failure(
        "ORBIT_APP_AUTH_IDENTITY_MISMATCH",
        "登录身份校验失败，请重新登录。",
        401
      );
    }

    return {
      data: {
        cookieHeader: "",
        expiresAt: session.data.expiresAt,
        user: session.data.user
      },
      success: true
    };
  } catch {
    return failure(
      "ORBIT_APP_AUTH_NETWORK_ERROR",
      "网络连接失败，请检查网络后重试。"
    );
  }
}

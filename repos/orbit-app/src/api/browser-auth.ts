import { normalizeOrbitApiBaseUrl } from "./browser-api-origin";
import {
  validateAuthSession,
  type MobileAuthFetchLike,
  type MobileAuthResult,
  type MobileAuthSession
} from "./mobile-auth";
import { currentTranslator, type MessageKey } from "../i18n/messages";

// QA 2026-11-21: transport failures read in the published screen language (zh is the key source).
function authText(key: MessageKey): string {
  return currentTranslator()(key);
}

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
    return failure("ORBIT_APP_AUTH_MISSING_CREDENTIALS", authText("auth.err.missing"));
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
        authText("auth.err.serviceUnavailable"),
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
        authText("auth.err.serviceUnavailable"),
        callbackResponse.status
      );
    }

    const callbackUrl = await authCallbackUrl(callbackResponse);
    if (!callbackResponse.ok || !callbackUrl) {
      return failure(
        "ORBIT_APP_AUTH_SERVICE_UNAVAILABLE",
        authText("auth.err.serviceUnavailable"),
        callbackResponse.status
      );
    }

    let callbackError = "";
    try {
      callbackError = new URL(callbackUrl, normalizedBaseUrl).searchParams.get("error") ?? "";
    } catch {
      return failure(
        "ORBIT_APP_AUTH_SERVICE_UNAVAILABLE",
        authText("auth.err.serviceUnavailable"),
        callbackResponse.status
      );
    }
    if (callbackError) {
      return failure(
        callbackError === "CredentialsSignin"
          ? "ORBIT_APP_AUTH_INVALID_CREDENTIALS"
          : "ORBIT_APP_AUTH_CALLBACK_FAILED",
        callbackError === "CredentialsSignin"
          ? authText("auth.err.invalidCredentials")
          : authText("auth.err.incomplete"),
        401
      );
    }

    const session = await validateAuthSession({
      baseUrl: normalizedBaseUrl,
      cookieHeader: "",
      fetchImpl
    });
    if (!session.success) {
      if (session.error.code === "ORBIT_APP_AUTH_NETWORK_ERROR" || session.error.code === "ORBIT_APP_AUTH_SERVER_UNAVAILABLE") return session;
      return failure(
        "ORBIT_APP_AUTH_INVALID_CREDENTIALS",
        authText("auth.err.invalidCredentials"),
        session.error.status
      );
    }
    if (session.data.user.email.trim().toLowerCase() !== normalizedEmail) {
      return failure(
        "ORBIT_APP_AUTH_IDENTITY_MISMATCH",
        authText("auth.err.identity"),
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
      authText("auth.err.network")
    );
  }
}

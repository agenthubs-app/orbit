import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMobileGoogleStartUrl,
  exchangeMobileGoogleCode,
  fetchMobileAuthProviders,
  mergeSetCookieHeaders,
  registerOrbitAccount,
  signInWithCredentials,
  signOutOrbitSession,
  type AuthFetchLike
} from "../src/api/auth-session";

function jsonResponse(
  body: unknown,
  init: ResponseInit & { setCookie?: string | string[] } = {}
): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    ...(init.headers ?? {})
  });
  const setCookie = init.setCookie;

  if (Array.isArray(setCookie)) {
    for (const cookie of setCookie) {
      headers.append("Set-Cookie", cookie);
    }
  } else if (setCookie) {
    headers.set("Set-Cookie", setCookie);
  }

  return new Response(JSON.stringify(body), {
    headers,
    status: init.status ?? 200
  });
}

test("mergeSetCookieHeaders stores, replaces, and clears auth cookies", () => {
  const csrf = mergeSetCookieHeaders(
    "",
    [
      "authjs.csrf-token=token.hash; Path=/; HttpOnly; SameSite=Lax",
      "authjs.callback-url=http%3A%2F%2Flocalhost%3A3000%2Fapp; Path=/"
    ],
    new Date("2026-07-24T00:00:00.000Z")
  );

  assert.equal(
    csrf,
    "authjs.csrf-token=token.hash; authjs.callback-url=http%3A%2F%2Flocalhost%3A3000%2Fapp"
  );

  const signedIn = mergeSetCookieHeaders(
    csrf,
    [
      "authjs.session-token=session-1; Path=/; HttpOnly; SameSite=Lax",
      "authjs.csrf-token=; Path=/; Max-Age=0"
    ],
    new Date("2026-07-24T00:00:00.000Z")
  );

  assert.equal(
    signedIn,
    "authjs.callback-url=http%3A%2F%2Flocalhost%3A3000%2Fapp; authjs.session-token=session-1"
  );
});

test("signInWithCredentials uses the mobile bridge and returns a cookie header", async () => {
  const calls: Array<{
    body: string;
    headers: Headers;
    method: string;
    url: string;
  }> = [];
  const fetchImpl: AuthFetchLike = async (input, init = {}) => {
    const headers = new Headers(init.headers);
    calls.push({
      body: String(init.body ?? ""),
      headers,
      method: init.method ?? "GET",
      url: String(input)
    });

    assert.equal(headers.get("Content-Type"), "application/json");
    assert.deepEqual(JSON.parse(calls.at(-1)?.body ?? "{}"), {
      email: "xiaoyu@example.com",
      password: "correct-password"
    });

    return jsonResponse({
      success: true,
      data: {
        cookieHeader: "authjs.session-token=session-token",
        expiresAt: "2026-08-24T00:00:00.000Z",
        user: {
          email: "xiaoyu@example.com",
          id: "user_1",
          name: "小雨"
        }
      }
    });
  };

  const result = await signInWithCredentials({
    baseUrl: "http://localhost:3000",
    email: "xiaoyu@example.com",
    fetchImpl,
    password: "correct-password",
    redirectTo: "/dashboard"
  });

  assert.equal(result.success, true);
  assert.equal(result.cookieHeader, "authjs.session-token=session-token");
  assert.equal(
    calls[0]?.url,
    "http://localhost:3000/api/auth/mobile/credentials"
  );
});

test("signInWithCredentials reports credential errors without storing a session", async () => {
  const fetchImpl: AuthFetchLike = async (input) => {
    return jsonResponse(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          context: {
            mobileAuthErrorCode: "MOBILE_AUTH_UNAUTHORIZED"
          },
          message: "Email or password is incorrect."
        }
      },
      { status: 401 }
    );
  };

  const result = await signInWithCredentials({
    baseUrl: "http://localhost:3000",
    email: "xiaoyu@example.com",
    fetchImpl,
    password: "wrong-password",
    redirectTo: "/dashboard"
  });

  assert.equal(result.success, false);
  if (result.success) {
    assert.fail("Expected failed sign-in");
  }
  assert.equal(result.error.code, "ORBIT_APP_AUTH_INVALID_CREDENTIALS");
});

test("fetchMobileAuthProviders reads the web mobile auth provider list", async () => {
  const result = await fetchMobileAuthProviders({
    baseUrl: "http://localhost:3000",
    fetchImpl: async (input, init = {}) => {
      assert.equal(String(input), "http://localhost:3000/api/auth/mobile/providers");
      assert.equal(init.method, "GET");
      return jsonResponse({
        success: true,
        data: { providers: ["credentials", "google"] }
      });
    }
  });

  assert.equal(result.success, true);
  if (!result.success) {
    assert.fail("Expected providers to load");
  }
  assert.deepEqual(result.providers, ["credentials", "google"]);
});

test("buildMobileGoogleStartUrl composes the Orbit deep-link broker request", () => {
  const url = new URL(
    buildMobileGoogleStartUrl({
      baseUrl: "http://localhost:3000",
      codeChallenge: "c".repeat(43),
      next: "/profile",
      state: "s".repeat(32)
    })
  );

  assert.equal(url.origin, "http://localhost:3000");
  assert.equal(url.pathname, "/api/auth/mobile/google/start");
  assert.equal(url.searchParams.get("code_challenge"), "c".repeat(43));
  assert.equal(url.searchParams.get("redirect_uri"), "orbit://account/oauth");
  assert.equal(url.searchParams.get("state"), "s".repeat(32));
  assert.equal(url.searchParams.get("next"), "/profile");
});

test("exchangeMobileGoogleCode stores the exchanged mobile session cookie", async () => {
  const result = await exchangeMobileGoogleCode({
    baseUrl: "http://localhost:3000",
    code: "oauth-code",
    codeVerifier: "v".repeat(64),
    fetchImpl: async (input, init = {}) => {
      assert.equal(String(input), "http://localhost:3000/api/auth/mobile/google/exchange");
      assert.equal(init.method, "POST");
      assert.deepEqual(JSON.parse(String(init.body)), {
        code: "oauth-code",
        codeVerifier: "v".repeat(64),
        state: "oauth-state"
      });

      return jsonResponse({
        success: true,
        data: {
          cookieHeader: "__Secure-authjs.session-token=google-session",
          expiresAt: "2026-08-24T00:00:00.000Z",
          user: {
            email: "xiaoyu@example.com",
            id: "auth_user_001",
            name: "小雨"
          }
        }
      });
    },
    state: "oauth-state"
  });

  assert.equal(result.success, true);
  assert.equal(result.cookieHeader, "__Secure-authjs.session-token=google-session");
});

test("registerOrbitAccount posts to the web register API envelope", async () => {
  const fetchImpl: AuthFetchLike = async (input, init = {}) => {
    assert.equal(String(input), "http://localhost:3000/api/auth/register");
    assert.equal(init.method, "POST");
    assert.equal(
      init.body,
      JSON.stringify({
        displayName: "小雨",
        email: "xiaoyu@example.com",
        password: "correct-password"
      })
    );

    return jsonResponse(
      {
        success: true,
        data: {
          user: {
            displayName: "小雨",
            email: "xiaoyu@example.com",
            id: "auth_user_001"
          }
        }
      },
      { status: 201 }
    );
  };

  const result = await registerOrbitAccount({
    baseUrl: "http://localhost:3000",
    displayName: "小雨",
    email: "xiaoyu@example.com",
    fetchImpl,
    password: "correct-password"
  });

  assert.equal(result.success, true);
});

test("signOutOrbitSession clears the stored session when NextAuth signs out", async () => {
  const fetchImpl: AuthFetchLike = async (input, init = {}) => {
    if (String(input).endsWith("/api/auth/csrf")) {
      assert.equal(init.headers ? new Headers(init.headers).get("Cookie") : "", "authjs.session-token=session-token");
      return jsonResponse(
        { csrfToken: "csrf-token" },
        { setCookie: "authjs.csrf-token=csrf-token.hash; Path=/; HttpOnly" }
      );
    }

    assert.equal(String(input), "http://localhost:3000/api/auth/signout");
    assert.equal(new Headers(init.headers).get("Cookie"), "authjs.session-token=session-token; authjs.csrf-token=csrf-token.hash");

    return jsonResponse(
      { url: "http://localhost:3000/app" },
      {
        setCookie: [
          "authjs.session-token=; Path=/; Max-Age=0",
          "authjs.csrf-token=; Path=/; Max-Age=0"
        ]
      }
    );
  };

  const result = await signOutOrbitSession({
    baseUrl: "http://localhost:3000",
    cookieHeader: "authjs.session-token=session-token",
    fetchImpl
  });

  assert.equal(result.success, true);
  assert.equal(result.cookieHeader, "");
});

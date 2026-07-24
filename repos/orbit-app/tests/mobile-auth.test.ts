import assert from "node:assert/strict";
import test from "node:test";

import {
  createGoogleOAuthAttempt,
  exchangeGoogleOAuthCode,
  fetchMobileAuthProviders,
  parseGoogleOAuthBrowserResult,
  parseGoogleOAuthCallback,
  signInWithMobileCredentials,
  validateAuthSession,
  type MobileAuthFetchLike
} from "../src/api/mobile-auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json"
    },
    status
  });
}

const session = {
  cookieHeader: "__Secure-authjs.session-token=session-value",
  expiresAt: "2026-08-24T00:00:00.000Z",
  user: {
    email: "person@example.com",
    id: "user_1",
    name: "Person"
  }
};

test("mobile providers returns only supported provider ids", async () => {
  const fetchImpl: MobileAuthFetchLike = async (input, init) => {
    assert.equal(
      String(input),
      "https://orbit.example/api/auth/mobile/providers"
    );
    assert.equal(init?.cache, "no-store");

    return jsonResponse({
      success: true,
      data: { providers: ["credentials", "google", "unknown"] }
    });
  };

  const result = await fetchMobileAuthProviders({
    baseUrl: "https://orbit.example/",
    fetchImpl
  });

  assert.deepEqual(result, {
    success: true,
    data: { providers: ["credentials", "google"] }
  });
});

test("mobile credentials uses the bridge envelope", async () => {
  const calls: Array<{ body: string; url: string }> = [];
  const fetchImpl: MobileAuthFetchLike = async (input, init) => {
    calls.push({
      body: String(init?.body ?? ""),
      url: String(input)
    });
    assert.equal(init?.method, "POST");
    assert.equal(init?.cache, "no-store");
    assert.equal(
      new Headers(init?.headers).get("Content-Type"),
      "application/json"
    );

    return jsonResponse({ success: true, data: session });
  };

  const result = await signInWithMobileCredentials({
    baseUrl: "https://orbit.example",
    email: " Person@Example.com ",
    fetchImpl,
    password: "secret"
  });

  assert.equal(result.success, true);
  assert.equal(
    calls[0]?.url,
    "https://orbit.example/api/auth/mobile/credentials"
  );
  assert.deepEqual(JSON.parse(calls[0]?.body ?? "{}"), {
    email: "person@example.com",
    password: "secret"
  });
  if (result.success) {
    assert.equal(result.data.user.id, "user_1");
  }
});

test("mobile credentials maps server errors without exposing internals", async () => {
  const result = await signInWithMobileCredentials({
    baseUrl: "https://orbit.example",
    email: "person@example.com",
    fetchImpl: async () =>
      jsonResponse(
        {
          success: false,
          error: {
            code: "UNAUTHORIZED",
            context: { mobileAuthErrorCode: "MOBILE_AUTH_UNAUTHORIZED" },
            message: "server detail"
          }
        },
        401
      ),
    password: "wrong"
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "MOBILE_AUTH_UNAUTHORIZED");
    assert.equal(result.error.message, "邮箱或密码不正确。");
  }
});

test("Google OAuth attempt binds random state and an S256 challenge", async () => {
  const randomValues = [
    Uint8Array.from({ length: 32 }, (_, index) => index),
    Uint8Array.from({ length: 24 }, (_, index) => index + 32)
  ];
  const attempt = await createGoogleOAuthAttempt({
    baseUrl: "https://orbit.example/",
    digest: async () => new Uint8Array(32).fill(7),
    next: "/profile",
    randomBytes: async () => randomValues.shift() ?? new Uint8Array()
  });
  const start = new URL(attempt.startUrl);

  assert.equal(
    start.pathname,
    "/api/auth/mobile/google/start"
  );
  assert.equal(start.searchParams.get("redirect_uri"), "orbit://account/oauth");
  assert.equal(start.searchParams.get("state"), attempt.state);
  assert.equal(start.searchParams.get("next"), "/profile");
  assert.equal(start.searchParams.get("code_challenge")?.length, 43);
  assert.equal(attempt.codeVerifier.length, 43);
});

test("Google callback accepts the fixed Orbit URL and matching state", () => {
  assert.deepEqual(
    parseGoogleOAuthCallback(
      "orbit://account/oauth?code=code-1&state=state-1",
      "state-1"
    ),
    { code: "code-1", state: "state-1", success: true }
  );
});

test("Google callback rejects state mismatch and missing code", () => {
  assert.equal(
    parseGoogleOAuthCallback(
      "orbit://account/oauth?code=code-1&state=other",
      "state-1"
    ).success,
    false
  );
  assert.equal(
    parseGoogleOAuthCallback(
      "orbit://account/oauth?state=state-1",
      "state-1"
    ).success,
    false
  );
  assert.equal(
    parseGoogleOAuthCallback(
      "evil://account/oauth?code=code-1&state=state-1",
      "state-1"
    ).success,
    false
  );
});

test("Google browser cancellation has a stable user-facing result", () => {
  assert.deepEqual(
    parseGoogleOAuthBrowserResult({ type: "cancel" }, "state-1"),
    {
      error: {
        code: "ORBIT_APP_GOOGLE_CANCELLED",
        message: "已取消 Google 登录。",
        status: 0
      },
      success: false
    }
  );
});

test("Google code exchange returns the mobile session envelope", async () => {
  const fetchImpl: MobileAuthFetchLike = async (input, init) => {
    assert.equal(
      String(input),
      "https://orbit.example/api/auth/mobile/google/exchange"
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      code: "code-1",
      codeVerifier: "verifier-1",
      state: "state-1"
    });

    return jsonResponse({ success: true, data: session });
  };

  const result = await exchangeGoogleOAuthCode({
    baseUrl: "https://orbit.example",
    code: "code-1",
    codeVerifier: "verifier-1",
    fetchImpl,
    state: "state-1"
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.cookieHeader, session.cookieHeader);
  }
});

test("session validation sends the stored Cookie and requires a real user", async () => {
  const valid = await validateAuthSession({
    baseUrl: "https://orbit.example",
    cookieHeader: session.cookieHeader,
    fetchImpl: async (input, init) => {
      assert.equal(
        String(input),
        "https://orbit.example/api/auth/session"
      );
      assert.equal(
        new Headers(init?.headers).get("Cookie"),
        session.cookieHeader
      );

      return jsonResponse({
        expires: session.expiresAt,
        user: session.user
      });
    }
  });
  const missing = await validateAuthSession({
    baseUrl: "https://orbit.example",
    cookieHeader: session.cookieHeader,
    fetchImpl: async () => jsonResponse({})
  });

  assert.equal(valid.success, true);
  assert.equal(missing.success, false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { signInWithBrowserCredentials } from "../src/api/browser-auth";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status
  });
}

test("browser credentials use Auth.js CSRF and session endpoints without a mobile token", async () => {
  const calls: Array<{ body: string; credentials?: RequestCredentials; url: string }> = [];
  const result = await signInWithBrowserCredentials({
    baseUrl: "https://demo.orbit.test",
    email: " Demo@Example.test ",
    password: "secret",
    fetchImpl: async (input, init = {}) => {
      const url = String(input);
      calls.push({
        body: String(init.body ?? ""),
        ...(init.credentials ? { credentials: init.credentials } : {}),
        url
      });
      if (url.endsWith("/api/auth/csrf")) {
        return jsonResponse({ csrfToken: "csrf-token" });
      }
      if (url.endsWith("/api/auth/callback/credentials")) {
        const form = new URLSearchParams(String(init.body));
        assert.equal(form.get("csrfToken"), "csrf-token");
        assert.equal(form.get("email"), "demo@example.test");
        assert.equal(form.get("password"), "secret");
        assert.equal(form.get("callbackUrl"), "https://demo.orbit.test/");
        assert.equal(new Headers(init.headers).get("X-Auth-Return-Redirect"), "1");
        return jsonResponse({ url: "https://demo.orbit.test/" });
      }
      assert.equal(url, "https://demo.orbit.test/api/auth/session");
      return jsonResponse({
        expires: "2026-10-16T00:00:00.000Z",
        user: { email: "demo@example.test", id: "demo", name: "Demo" }
      });
    }
  });

  assert.deepEqual(result, {
    data: {
      cookieHeader: "",
      expiresAt: "2026-10-16T00:00:00.000Z",
      user: { email: "demo@example.test", id: "demo", name: "Demo" }
    },
    success: true
  });
  assert.deepEqual(calls.map((call) => call.url), [
    "https://demo.orbit.test/api/auth/csrf",
    "https://demo.orbit.test/api/auth/callback/credentials",
    "https://demo.orbit.test/api/auth/session"
  ]);
  assert.equal(calls.every((call) => call.credentials === "include"), true);
  assert.equal(calls.some((call) => call.url.includes("/api/auth/mobile/")), false);
});

test("browser credentials reject a login when no browser session is established", async () => {
  const result = await signInWithBrowserCredentials({
    baseUrl: "https://demo.orbit.test",
    email: "demo@example.test",
    password: "wrong",
    fetchImpl: async (input) => String(input).endsWith("/api/auth/csrf")
      ? jsonResponse({ csrfToken: "csrf-token" })
      : String(input).endsWith("/api/auth/session")
        ? jsonResponse({}, 200)
        : jsonResponse({ url: "https://demo.orbit.test/app/account/login?error=CredentialsSignin" })
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "ORBIT_APP_AUTH_INVALID_CREDENTIALS");
  }
});

test("browser credentials do not accept an existing session after a rejected account switch", async () => {
  const result = await signInWithBrowserCredentials({
    baseUrl: "https://demo.orbit.test",
    email: "new@example.test",
    password: "wrong",
    fetchImpl: async (input) => String(input).endsWith("/api/auth/csrf")
      ? jsonResponse({ csrfToken: "csrf-token" })
      : String(input).endsWith("/api/auth/callback/credentials")
        ? jsonResponse({ url: "https://demo.orbit.test/app/account/login?error=CredentialsSignin" })
        : jsonResponse({
            expires: "2026-10-16T00:00:00.000Z",
            user: { email: "old@example.test", id: "old", name: "Old account" }
          })
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "ORBIT_APP_AUTH_INVALID_CREDENTIALS");
  }
});

test("browser credentials require the resulting session to match the submitted identity", async () => {
  const result = await signInWithBrowserCredentials({
    baseUrl: "https://demo.orbit.test",
    email: "new@example.test",
    password: "secret",
    fetchImpl: async (input) => String(input).endsWith("/api/auth/csrf")
      ? jsonResponse({ csrfToken: "csrf-token" })
      : String(input).endsWith("/api/auth/callback/credentials")
        ? jsonResponse({ url: "https://demo.orbit.test/" })
        : jsonResponse({
            expires: "2026-10-16T00:00:00.000Z",
            user: { email: "old@example.test", id: "old", name: "Old account" }
          })
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "ORBIT_APP_AUTH_IDENTITY_MISMATCH");
  }
});

test("browser credentials report CSRF and session network failures distinctly", async () => {
  const csrfFailure = await signInWithBrowserCredentials({
    baseUrl: "https://demo.orbit.test",
    email: "demo@example.test",
    password: "secret",
    fetchImpl: async () => jsonResponse({}, 503)
  });
  assert.equal(csrfFailure.success, false);
  if (!csrfFailure.success) {
    assert.equal(csrfFailure.error.code, "ORBIT_APP_AUTH_CSRF_UNAVAILABLE");
  }

  const sessionFailure = await signInWithBrowserCredentials({
    baseUrl: "https://demo.orbit.test",
    email: "demo@example.test",
    password: "secret",
    fetchImpl: async (input) => String(input).endsWith("/api/auth/csrf")
      ? jsonResponse({ csrfToken: "csrf-token" })
      : String(input).endsWith("/api/auth/callback/credentials")
        ? jsonResponse({ url: "https://demo.orbit.test/" })
        : Promise.reject(new Error("offline"))
  });
  assert.equal(sessionFailure.success, false);
  if (!sessionFailure.success) {
    assert.equal(sessionFailure.error.code, "ORBIT_APP_AUTH_NETWORK_ERROR");
  }
});

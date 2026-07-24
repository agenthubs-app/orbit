import assert from "node:assert/strict";
import test from "node:test";

import type { AuthUserResult } from "../../features/auth/contract";
import { MOBILE_AUTH_CALLBACK_URI } from "../../features/auth/mobile-contract";
import { pkceChallenge } from "../../features/auth/mobile-crypto";
import { createMobileAuthService } from "../../features/auth/mobile-service";
import type { AuthUserService } from "../../features/auth/service";
import { createMemoryMobileAuthExchangeProvider } from "../../features/auth/storage/mobile-auth-exchange-provider";

const now = new Date("2026-07-24T00:00:00.000Z");
const secret = "test-secret-with-at-least-thirty-two-characters";
const verifier = "v".repeat(64);
const state = "s".repeat(32);
const user = {
  email: "person@example.com",
  id: "user_1",
  name: "Person",
};

function failure(code: "AUTH_INVALID_CREDENTIALS"): AuthUserResult {
  return {
    state: "failure",
    error: {
      appCode: "UNAUTHORIZED",
      code,
      message: "Email or password is incorrect.",
    },
  };
}

function authUsers(): AuthUserService {
  return {
    async getOrCreateOAuthUser() {
      throw new Error("not used");
    },
    async registerUser() {
      throw new Error("not used");
    },
    async verifyCredentials(input) {
      if (
        input.email !== "person@example.com" ||
        input.password !== "correct-password"
      ) {
        return failure("AUTH_INVALID_CREDENTIALS");
      }

      return {
        state: "success",
        data: {
          user: {
            createdAt: now.toISOString(),
            displayName: user.name,
            email: user.email,
            id: user.id,
            provider: "credentials",
            updatedAt: now.toISOString(),
          },
        },
      };
    },
  };
}

function service(options?: { now?: Date; google?: boolean }) {
  return createMobileAuthService({
    authUsers: authUsers(),
    brokerSecret: secret,
    exchangeProvider: createMemoryMobileAuthExchangeProvider(),
    isProviderEnabled: () => options?.google ?? true,
    now: () => options?.now ?? now,
    origin: "https://orbit.example",
    randomCode: () => "authorization-code",
  });
}

async function completeGoogle(target = service()) {
  const broker = await target.createBrokerRequest({
    codeChallenge: pkceChallenge(verifier),
    next: "/app/profile",
    redirectUri: MOBILE_AUTH_CALLBACK_URI,
    state,
  });
  assert.equal(broker.success, true);
  if (!broker.success) throw new Error("broker request was not created");

  const completed = await target.completeGoogleSession({
    brokerRequest: broker.data.request,
    cookieHeader: "__Secure-authjs.session-token=web-session",
    user,
  });
  assert.equal(completed.success, true);
  if (!completed.success) throw new Error("Google session was not completed");

  return completed.data;
}

test("credentials issue an Auth.js-compatible mobile session", async () => {
  const result = await service().issueCredentialsSession({
    email: "person@example.com",
    password: "correct-password",
  });

  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.user.id, user.id);
  assert.match(
    result.data.cookieHeader,
    /^__Secure-authjs\.session-token=/u,
  );
});

test("unknown email and wrong password share one generic response", async () => {
  const target = service();
  const unknown = await target.issueCredentialsSession({
    email: "unknown@example.com",
    password: "correct-password",
  });
  const wrong = await target.issueCredentialsSession({
    email: "person@example.com",
    password: "wrong-password",
  });

  assert.equal(unknown.success, false);
  assert.equal(wrong.success, false);
  if (unknown.success || wrong.success) return;
  assert.deepEqual(unknown.error, wrong.error);
  assert.equal(unknown.error.code, "MOBILE_AUTH_UNAUTHORIZED");
});

test("provider availability never exposes configuration values", () => {
  assert.deepEqual(service({ google: true }).enabledProviders(), [
    "credentials",
    "google",
  ]);
  assert.deepEqual(service({ google: false }).enabledProviders(), [
    "credentials",
  ]);
});

test("Google exchange is PKCE-bound and single-use", async () => {
  const target = service();
  const completed = await completeGoogle(target);

  const first = await target.exchangeGoogleCode({
    code: completed.code,
    codeVerifier: verifier,
    state,
  });
  const second = await target.exchangeGoogleCode({
    code: completed.code,
    codeVerifier: verifier,
    state,
  });

  assert.equal(first.success, true);
  if (first.success) {
    assert.equal(
      first.data.cookieHeader,
      "__Secure-authjs.session-token=web-session",
    );
  }
  assert.equal(second.success, false);
  if (!second.success) {
    assert.equal(second.error.code, "MOBILE_AUTH_CODE_USED");
  }
});

test("Google exchange rejects mismatched state", async () => {
  const target = service();
  const completed = await completeGoogle(target);
  const result = await target.exchangeGoogleCode({
    code: completed.code,
    codeVerifier: verifier,
    state: "x".repeat(32),
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "MOBILE_AUTH_STATE_MISMATCH");
  }
});

test("Google exchange rejects a wrong verifier", async () => {
  const target = service();
  const completed = await completeGoogle(target);
  const result = await target.exchangeGoogleCode({
    code: completed.code,
    codeVerifier: "w".repeat(64),
    state,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "MOBILE_AUTH_PKCE_MISMATCH");
  }
});

test("expired Google codes cannot be exchanged", async () => {
  let current = now;
  const target = service({
    get now() {
      return current;
    },
  });
  const completed = await completeGoogle(target);
  current = new Date(now.getTime() + 120_001);
  const result = await target.exchangeGoogleCode({
    code: completed.code,
    codeVerifier: verifier,
    state,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.code, "MOBILE_AUTH_CODE_EXPIRED");
  }
});

test("Google broker creation fails closed when the provider is disabled", async () => {
  const result = await service({ google: false }).createBrokerRequest({
    codeChallenge: pkceChallenge(verifier),
    redirectUri: MOBILE_AUTH_CALLBACK_URI,
    state,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      result.error.code,
      "MOBILE_AUTH_CONFIGURATION_UNAVAILABLE",
    );
  }
});

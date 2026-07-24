import assert from "node:assert/strict";
import test from "node:test";

import { decode } from "next-auth/jwt";

import { MOBILE_AUTH_CALLBACK_URI } from "../../features/auth/mobile-contract";
import {
  decryptMobileSession,
  encryptMobileSession,
  issueAuthJsCookie,
  pkceChallenge,
  signMobileBrokerRequest,
  validateMobileGoogleStart,
  verifyMobileBrokerRequest,
} from "../../features/auth/mobile-crypto";

const secret = "test-secret-with-at-least-thirty-two-characters";
const now = new Date("2026-07-24T00:00:00.000Z");

test("mobile Google start accepts the fixed callback and valid S256 input", () => {
  assert.deepEqual(
    validateMobileGoogleStart({
      codeChallenge: "a".repeat(43),
      next: "/profile",
      redirectUri: MOBILE_AUTH_CALLBACK_URI,
      state: "b".repeat(32),
    }),
    {
      success: true,
      data: {
        codeChallenge: "a".repeat(43),
        next: "/profile",
        redirectUri: MOBILE_AUTH_CALLBACK_URI,
        state: "b".repeat(32),
      },
    },
  );
});

test("mobile Google start rejects an untrusted callback and external next URL", () => {
  assert.equal(
    validateMobileGoogleStart({
      codeChallenge: "a".repeat(43),
      redirectUri: "evil://callback",
      state: "b".repeat(32),
    }).success,
    false,
  );
  assert.equal(
    validateMobileGoogleStart({
      codeChallenge: "a".repeat(43),
      next: "https://evil.example",
      redirectUri: MOBILE_AUTH_CALLBACK_URI,
      state: "b".repeat(32),
    }).success,
    false,
  );
});

test("PKCE challenge uses the S256 representation", () => {
  assert.equal(
    pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  );
});

test("broker requests expire and reject tampering", async () => {
  const token = await signMobileBrokerRequest(
    {
      codeChallenge: "a".repeat(43),
      next: "/profile",
      redirectUri: MOBILE_AUTH_CALLBACK_URI,
      state: "b".repeat(32),
    },
    secret,
    now,
  );

  assert.equal(
    (await verifyMobileBrokerRequest(token, secret, now)).success,
    true,
  );
  assert.equal(
    (
      await verifyMobileBrokerRequest(
        `${token.slice(0, -1)}x`,
        secret,
        now,
      )
    ).success,
    false,
  );
  assert.equal(
    (
      await verifyMobileBrokerRequest(
        token,
        secret,
        new Date(now.getTime() + 5 * 60 * 1000 + 1),
      )
    ).success,
    false,
  );
});

test("session payload encryption round-trips without exposing the cookie", async () => {
  const encrypted = await encryptMobileSession(
    "__Secure-authjs.session-token=session-value",
    secret,
    now,
  );

  assert.doesNotMatch(encrypted, /session-value/u);
  assert.equal(
    await decryptMobileSession(encrypted, secret, now),
    "__Secure-authjs.session-token=session-value",
  );
});

test("issued cookie decodes through the installed Auth.js JWT codec", async () => {
  const issued = await issueAuthJsCookie({
    now,
    origin: "https://orbit.example",
    secret,
    user: {
      email: "person@example.com",
      id: "user_1",
      name: "Person",
    },
  });

  const [cookieName, token] = issued.cookieHeader.split("=", 2);
  assert.equal(cookieName, "__Secure-authjs.session-token");
  assert.ok(token);
  const claims = await decode({
    salt: cookieName,
    secret,
    token,
  });

  assert.equal(claims?.sub, "user_1");
  assert.equal(claims?.email, "person@example.com");
  assert.equal(issued.user.id, "user_1");
  assert.ok(Date.parse(issued.expiresAt) > now.getTime());
});

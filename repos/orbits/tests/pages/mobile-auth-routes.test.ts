import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { NextRequest } from "next/server";

import { MOBILE_AUTH_CALLBACK_URI } from "../../features/auth/mobile-contract";
import { issueAuthJsCookie, pkceChallenge } from "../../features/auth/mobile-crypto";
import { resolveAuthUserService } from "../../features/auth/service-factory";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const secret = "test-secret-with-at-least-thirty-two-characters";
const verifier = "v".repeat(64);
const state = "s".repeat(32);
const previousEnv = {
  AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
  AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
  ORBIT_MODULE_MODE: process.env.ORBIT_MODULE_MODE,
};

process.env.AUTH_GOOGLE_ID = "test-google-client";
process.env.AUTH_GOOGLE_SECRET = "test-google-secret";
process.env.AUTH_SECRET = secret;
process.env.ORBIT_MODULE_MODE = "mock";

after(() => {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

async function routeModules() {
  return {
    complete: await import(
      "../../app/api/auth/mobile/google/complete/route"
    ),
    credentials: await import("../../app/api/auth/mobile/credentials/route"),
    exchange: await import(
      "../../app/api/auth/mobile/google/exchange/route"
    ),
    providers: await import("../../app/api/auth/mobile/providers/route"),
    start: await import("../../app/api/auth/mobile/google/start/route"),
  };
}

function startRequest(
  redirectUri: string = MOBILE_AUTH_CALLBACK_URI,
): NextRequest {
  const url = new URL(
    "https://orbit.example/api/auth/mobile/google/start",
  );
  url.searchParams.set("code_challenge", pkceChallenge(verifier));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("next", "/app/profile");

  return new NextRequest(url);
}

async function brokerRequest(): Promise<string> {
  const { start } = await routeModules();
  const response = await start.GET(startRequest());
  assert.equal(response.status, 302);
  const location = response.headers.get("location");
  assert.ok(location);
  const request = new URL(location).searchParams.get("request");
  assert.ok(request);

  return request;
}

async function registerTestUser(email: string) {
  const result = await resolveAuthUserService("mock").registerUser({
    email,
    password: "correct-password",
  });
  assert.equal(result.state, "success");
}

test("providers route returns enabled ids without configuration values", async () => {
  const { providers } = await routeModules();
  const response = await providers.GET(
    new NextRequest("https://orbit.example/api/auth/mobile/providers"),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    success: true,
    data: { providers: ["credentials", "google"] },
  });
  assert.doesNotMatch(JSON.stringify(payload), /test-google/iu);
});

test("credentials route returns a no-store Auth.js session", async () => {
  const email = `mobile-${Date.now()}@example.com`;
  await registerTestUser(email);
  const { credentials } = await routeModules();
  const response = await credentials.POST(
    new NextRequest(
      "https://orbit.example/api/auth/mobile/credentials",
      {
        body: JSON.stringify({ email, password: "correct-password" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(payload.success, true);
  assert.match(
    payload.data.cookieHeader,
    /^__Secure-authjs\.session-token=/u,
  );
  assert.match(
    response.headers.get("Set-Cookie") ?? "",
    /^__Secure-authjs\.session-token=/u,
  );
  assert.match(response.headers.get("Set-Cookie") ?? "", /HttpOnly/iu);
  assert.match(response.headers.get("Set-Cookie") ?? "", /SameSite=Lax/iu);
});

test("mobile credentials cookie is accepted by the Auth.js session handler", async () => {
  const email = `session-${Date.now()}@example.com`;
  await registerTestUser(email);
  const { credentials } = await routeModules();
  const mobile = await credentials.POST(
    new NextRequest(
      "https://orbit.example/api/auth/mobile/credentials",
      {
        body: JSON.stringify({ email, password: "correct-password" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
  );
  const mobilePayload = await mobile.json();
  const { handlers } = await import("../../auth");
  const session = await handlers.GET(
    new NextRequest("https://orbit.example/api/auth/session", {
      headers: { cookie: mobilePayload.data.cookieHeader },
    }),
  );
  const sessionPayload = await session.json();

  assert.equal(session.status, 200);
  assert.equal(sessionPayload.user.id, mobilePayload.data.user.id);
  assert.equal(sessionPayload.user.email, email);
});

test("Google start rejects an untrusted callback", async () => {
  const { start } = await routeModules();
  const response = await start.GET(startRequest("evil://callback"));
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.success, false);
  assert.equal(payload.error.code, "VALIDATION_ERROR");
});

test("Google start fails closed when the provider is disabled", async () => {
  const googleId = process.env.AUTH_GOOGLE_ID;
  const googleSecret = process.env.AUTH_GOOGLE_SECRET;
  delete process.env.AUTH_GOOGLE_ID;
  delete process.env.AUTH_GOOGLE_SECRET;

  try {
    const { start } = await routeModules();
    const response = await start.GET(startRequest());

    assert.equal(response.status, 503);
  } finally {
    process.env.AUTH_GOOGLE_ID = googleId;
    process.env.AUTH_GOOGLE_SECRET = googleSecret;
  }
});

test("Google start redirects only to the Orbit broker page", async () => {
  const { start } = await routeModules();
  const response = await start.GET(startRequest());
  const location = response.headers.get("location");

  assert.equal(response.status, 302);
  assert.ok(location);
  const target = new URL(location);
  assert.equal(target.origin, "https://orbit.example");
  assert.equal(target.pathname, "/app/account/mobile-google");
  assert.ok(target.searchParams.get("request"));
});

test("Google completion rejects a request without an authenticated Web session", async () => {
  const request = await brokerRequest();
  const { complete } = await routeModules();
  const response = (await complete.GET(
    new NextRequest(
      `https://orbit.example/api/auth/mobile/google/complete?request=${encodeURIComponent(request)}`,
    ),
    { params: Promise.resolve({}) },
  )) as Response;

  assert.equal(response.status, 401);
});

test("Google completion exposes only code and state, then exchanges once", async () => {
  const request = await brokerRequest();
  const issued = await issueAuthJsCookie({
    now: new Date(),
    origin: "https://orbit.example",
    secret,
    user: {
      email: "google-person@example.com",
      id: "user_google_1",
      name: "Google Person",
    },
  });
  const { complete, exchange } = await routeModules();
  const completion = (await complete.GET(
    new NextRequest(
      `https://orbit.example/api/auth/mobile/google/complete?request=${encodeURIComponent(request)}`,
      { headers: { cookie: issued.cookieHeader } },
    ),
    { params: Promise.resolve({}) },
  )) as Response;
  const location = completion.headers.get("location");

  assert.equal(completion.status, 302);
  assert.ok(location);
  const callback = new URL(location);
  assert.equal(callback.origin, "null");
  assert.equal(`${callback.protocol}//${callback.host}${callback.pathname}`, MOBILE_AUTH_CALLBACK_URI);
  assert.deepEqual([...callback.searchParams.keys()].sort(), ["code", "state"]);
  assert.equal(callback.searchParams.get("state"), state);

  const exchangeResponse = await exchange.POST(
    new NextRequest(
      "https://orbit.example/api/auth/mobile/google/exchange",
      {
        body: JSON.stringify({
          code: callback.searchParams.get("code"),
          codeVerifier: verifier,
          state,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
  );
  const payload = await exchangeResponse.json();

  assert.equal(exchangeResponse.status, 200);
  assert.equal(exchangeResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(payload.success, true);
  assert.equal(payload.data.cookieHeader, issued.cookieHeader);
  assert.match(
    exchangeResponse.headers.get("Set-Cookie") ?? "",
    /^__Secure-authjs\.session-token=/u,
  );
});

test("mobile auth routes and broker do not log sensitive values", () => {
  const files = [
    "app/api/auth/mobile/providers/route.ts",
    "app/api/auth/mobile/credentials/route.ts",
    "app/api/auth/mobile/google/start/route.ts",
    "app/api/auth/mobile/google/complete/route.ts",
    "app/api/auth/mobile/google/exchange/route.ts",
    "app/(app)/app/account/mobile-google/mobile-google-auth.tsx",
  ];

  for (const file of files) {
    const contents = readFileSync(join(projectRoot, file), "utf8");
    assert.doesNotMatch(contents, /console\.(?:log|info|debug)/u);
  }
});

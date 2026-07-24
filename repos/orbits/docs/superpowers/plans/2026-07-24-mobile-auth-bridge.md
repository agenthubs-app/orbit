# Mobile Auth Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure Web broker that lets the Orbit iOS app obtain the same Auth.js-compatible session through email credentials or Google OAuth.

**Architecture:** Keep canonical users and provider configuration in the existing `features/auth` boundary. Add a mobile session codec, a PKCE-bound single-use exchange service, a Postgres-backed atomic exchange provider, thin API routes, and a small browser broker page that hands Google authorization back to the fixed `orbit://account/oauth` callback.

**Tech Stack:** Next.js App Router, Auth.js/NextAuth v5, TypeScript, `jose`, Node `crypto`, PostgreSQL `orbit_records`, Node test runner.

## Global Constraints

- Existing Web email and Google login behavior must remain unchanged.
- Accept only `orbit://account/oauth` as the mobile callback.
- Require random state and S256 PKCE for Google login.
- Authorization codes live for at most two minutes and can be consumed once, including concurrent requests.
- Do not place Google tokens or Auth.js session cookies in the custom-scheme URL.
- Use `Cache-Control: no-store` on credentials and exchange responses.
- Do not log passwords, raw codes, broker requests, encrypted payloads, or cookie values.
- Live mode without configured Postgres storage fails closed.
- Product/API routes call feature services and do not access fixtures or storage directly.
- Before editing an existing symbol, run GitNexus upstream impact analysis and stop for HIGH or CRITICAL risk.
- Before every commit, stage only task files and run GitNexus staged change detection.

---

## File Map

### New feature files

- `features/auth/mobile-contract.ts` — public DTOs, validation result types, stable error codes.
- `features/auth/mobile-crypto.ts` — state/PKCE helpers, broker-request signing, encrypted session payloads, Auth.js cookie encoding.
- `features/auth/mobile-service.ts` — credentials issuance, exchange creation, atomic consumption and validation.
- `features/auth/mobile-service-factory.ts` — mock/live service selection and dependency wiring.
- `features/auth/storage/mobile-auth-exchange-provider.ts` — memory and Postgres exchange persistence.
- `features/auth/DESIGN.md` — authentication and mobile bridge boundaries.

### New routes and broker page

- `app/api/auth/mobile/providers/route.ts`
- `app/api/auth/mobile/credentials/route.ts`
- `app/api/auth/mobile/google/start/route.ts`
- `app/api/auth/mobile/google/complete/route.ts`
- `app/api/auth/mobile/google/exchange/route.ts`
- `app/(app)/app/account/mobile-google/page.tsx`
- `app/(app)/app/account/mobile-google/mobile-google-auth.tsx`

### Tests

- `tests/capabilities/mobile-auth-crypto.test.ts`
- `tests/capabilities/mobile-auth-exchange-provider.test.ts`
- `tests/capabilities/mobile-auth-service.test.ts`
- `tests/pages/mobile-auth-routes.test.ts`

---

### Task 1: Mobile Auth Contract and Crypto Boundary

**Files:**
- Create: `features/auth/mobile-contract.ts`
- Create: `features/auth/mobile-crypto.ts`
- Create: `tests/capabilities/mobile-auth-crypto.test.ts`

**Interfaces:**
- Produces:
  - `MOBILE_AUTH_CALLBACK_URI`
  - `MobileSessionUser`
  - `MobileSessionData`
  - `MobileAuthFailure`
  - `validateMobileGoogleStart(input)`
  - `signMobileBrokerRequest(payload, secret, now)`
  - `verifyMobileBrokerRequest(token, secret, now)`
  - `encryptMobileSession(cookieHeader, secret)`
  - `decryptMobileSession(value, secret)`
  - `issueAuthJsCookie({ user, secret, origin, now })`
  - `pkceChallenge(verifier)`

- [ ] **Step 1: Write the failing crypto and validation tests**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptMobileSession,
  encryptMobileSession,
  issueAuthJsCookie,
  pkceChallenge,
  signMobileBrokerRequest,
  validateMobileGoogleStart,
  verifyMobileBrokerRequest,
} from "../../features/auth/mobile-crypto";
import { MOBILE_AUTH_CALLBACK_URI } from "../../features/auth/mobile-contract";

const secret = "test-secret-with-at-least-thirty-two-characters";
const now = new Date("2026-07-24T00:00:00.000Z");

test("mobile Google start accepts only the fixed callback and S256 input", () => {
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
  assert.equal(
    validateMobileGoogleStart({
      codeChallenge: "a".repeat(43),
      redirectUri: "evil://callback",
      state: "b".repeat(32),
    }).success,
    false,
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
});

test("session payload encryption round-trips without exposing the cookie", async () => {
  const encrypted = await encryptMobileSession(
    "__Secure-authjs.session-token=session-value",
    secret,
  );
  assert.doesNotMatch(encrypted, /session-value/u);
  assert.equal(
    await decryptMobileSession(encrypted, secret),
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
  assert.match(issued.cookieHeader, /^__Secure-authjs\.session-token=/u);
  assert.equal(issued.user.id, "user_1");
  assert.ok(Date.parse(issued.expiresAt) > now.getTime());
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
node --test --import tsx tests/capabilities/mobile-auth-crypto.test.ts
```

Expected: FAIL because `features/auth/mobile-crypto.ts` does not exist.

- [ ] **Step 3: Implement the contract**

Create `features/auth/mobile-contract.ts` with:

```ts
export const MOBILE_AUTH_CALLBACK_URI = "orbit://account/oauth";
export const MOBILE_AUTH_CODE_TTL_SECONDS = 120;
export const MOBILE_AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface MobileSessionUser {
  email: string;
  id: string;
  name: string;
}

export interface MobileSessionData {
  cookieHeader: string;
  expiresAt: string;
  user: MobileSessionUser;
}

export type MobileAuthErrorCode =
  | "MOBILE_AUTH_INVALID_INPUT"
  | "MOBILE_AUTH_INVALID_REDIRECT"
  | "MOBILE_AUTH_CONFIGURATION_UNAVAILABLE"
  | "MOBILE_AUTH_INVALID_BROKER_REQUEST"
  | "MOBILE_AUTH_CODE_EXPIRED"
  | "MOBILE_AUTH_CODE_USED"
  | "MOBILE_AUTH_STATE_MISMATCH"
  | "MOBILE_AUTH_PKCE_MISMATCH"
  | "MOBILE_AUTH_UNAUTHORIZED";

export type MobileAuthResult<TData> =
  | { data: TData; success: true }
  | {
      error: {
        appCode:
          | "VALIDATION_ERROR"
          | "SERVICE_UNAVAILABLE"
          | "UNAUTHORIZED"
          | "CONFLICT";
        code: MobileAuthErrorCode;
        message: string;
      };
      success: false;
    };
```

Add typed broker payload and validation input/result types in the same file. Messages must remain generic and must not echo invalid input.

- [ ] **Step 4: Implement crypto helpers**

Create `features/auth/mobile-crypto.ts` using:

```ts
import { createHash } from "node:crypto";
import { EncryptJWT, SignJWT, jwtDecrypt, jwtVerify } from "jose";
import { encode } from "next-auth/jwt";

import {
  MOBILE_AUTH_CALLBACK_URI,
  MOBILE_AUTH_SESSION_MAX_AGE_SECONDS,
  type MobileSessionData,
  type MobileSessionUser,
} from "./mobile-contract";

function secretKey(secret: string): Uint8Array {
  return createHash("sha256").update(secret).digest();
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export async function issueAuthJsCookie({
  now,
  origin,
  secret,
  user,
}: {
  now: Date;
  origin: string;
  secret: string;
  user: MobileSessionUser;
}): Promise<MobileSessionData> {
  const secure = new URL(origin).protocol === "https:";
  const cookieName = `${secure ? "__Secure-" : ""}authjs.session-token`;
  const token = await encode({
    maxAge: MOBILE_AUTH_SESSION_MAX_AGE_SECONDS,
    salt: cookieName,
    secret,
    token: {
      email: user.email,
      iat: Math.floor(now.getTime() / 1000),
      name: user.name,
      sub: user.id,
    },
  });

  return {
    cookieHeader: `${cookieName}=${token}`,
    expiresAt: new Date(
      now.getTime() + MOBILE_AUTH_SESSION_MAX_AGE_SECONDS * 1000,
    ).toISOString(),
    user,
  };
}
```

Use `SignJWT`/`jwtVerify` with issuer `orbit-mobile-auth`, audience `orbit-ios-broker`, and five-minute broker expiry. Use `EncryptJWT`/`jwtDecrypt` with audience `orbit-ios-session-exchange`. Implement strict state/challenge length and callback validation.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
node --test --import tsx tests/capabilities/mobile-auth-crypto.test.ts
npx tsc --noEmit
```

Expected: all focused tests PASS and TypeScript exits 0.

Before commit, run GitNexus staged change detection. Then:

```bash
git add features/auth/mobile-contract.ts features/auth/mobile-crypto.ts tests/capabilities/mobile-auth-crypto.test.ts
git commit -m "feat(auth): add mobile session crypto boundary"
```

---

### Task 2: Single-Use Exchange Persistence

**Files:**
- Create: `features/auth/storage/mobile-auth-exchange-provider.ts`
- Create: `tests/capabilities/mobile-auth-exchange-provider.test.ts`

**Interfaces:**
- Consumes: `MOBILE_AUTH_CODE_TTL_SECONDS`
- Produces:
  - `MobileAuthExchangeRecord`
  - `MobileAuthExchangeProvider`
  - `createMemoryMobileAuthExchangeProvider()`
  - `createPostgresMobileAuthExchangeProvider({ client, store, workspaceId })`
  - `createConfiguredMobileAuthExchangeProvider()`

- [ ] **Step 1: Write failing single-use and concurrency tests**

```ts
test("memory exchange provider consumes a code exactly once", async () => {
  const provider = createMemoryMobileAuthExchangeProvider();
  await provider.save(record);

  const [left, right] = await Promise.all([
    provider.consume(record.codeHash, now),
    provider.consume(record.codeHash, now),
  ]);

  assert.equal([left, right].filter(Boolean).length, 1);
});

test("expired records cannot be consumed", async () => {
  const provider = createMemoryMobileAuthExchangeProvider();
  await provider.save({ ...record, expiresAt: "2026-07-23T23:59:59.000Z" });
  assert.equal(await provider.consume(record.codeHash, now), null);
});
```

Add a SQL-shape test with an injected `LiveRecordSqlClient` that asserts the consume statement includes `lifecycle_state = 'active'`, an expiry predicate, one `update ... returning`, and no preceding select.

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
node --test --import tsx tests/capabilities/mobile-auth-exchange-provider.test.ts
```

Expected: FAIL because the provider module does not exist.

- [ ] **Step 3: Implement memory and Postgres providers**

Use this interface:

```ts
export interface MobileAuthExchangeRecord {
  codeHash: string;
  codeChallenge: string;
  encryptedCookieHeader: string;
  expiresAt: string;
  issuedAt: string;
  redirectUri: typeof MOBILE_AUTH_CALLBACK_URI;
  state: string;
  user: MobileSessionUser;
}

export interface MobileAuthExchangeProvider {
  save: (record: MobileAuthExchangeRecord) => Promise<void>;
  consume: (
    codeHash: string,
    now: Date,
  ) => Promise<MobileAuthExchangeRecord | null>;
}
```

The memory provider must delete before returning. The live provider stores records in collection `mobile_auth_exchanges` under record ID `mobile_auth_exchange:<codeHash>`.

The live consume operation must be a single conditional SQL statement:

```sql
update orbit_records
set lifecycle_state = 'deleted',
    deleted_at = $4,
    updated_at = $4
where workspace_id = $1
  and collection_name = $2
  and record_id = $3
  and lifecycle_state = 'active'
  and (payload->>'expiresAt')::timestamptz > $4::timestamptz
returning payload
```

Parse returned JSON defensively. Missing or malformed fields return `null`.

- [ ] **Step 4: Run tests and commit**

Run:

```bash
node --test --import tsx tests/capabilities/mobile-auth-exchange-provider.test.ts
npx tsc --noEmit
```

Expected: PASS and exit 0.

Run GitNexus staged change detection, then:

```bash
git add features/auth/storage/mobile-auth-exchange-provider.ts tests/capabilities/mobile-auth-exchange-provider.test.ts
git commit -m "feat(auth): persist one-time mobile exchanges"
```

---

### Task 3: Mobile Auth Service and Factory

**Files:**
- Create: `features/auth/mobile-service.ts`
- Create: `features/auth/mobile-service-factory.ts`
- Create: `tests/capabilities/mobile-auth-service.test.ts`
- Modify: `features/auth/oauth-providers.ts`

**Interfaces:**
- Consumes:
  - `AuthUserService.verifyCredentials`
  - crypto helpers from Task 1
  - exchange provider from Task 2
- Produces:
  - `MobileAuthService.enabledProviders()`
  - `MobileAuthService.issueCredentialsSession(input)`
  - `MobileAuthService.createBrokerRequest(input)`
  - `MobileAuthService.completeGoogleSession(input)`
  - `MobileAuthService.exchangeGoogleCode(input)`
  - `resolveMobileAuthService(mode?)`

- [ ] **Step 1: Run impact analysis before editing `enabledOAuthProviders`**

Run GitNexus upstream impact analysis for `enabledOAuthProviders` in `features/auth/oauth-providers.ts`. Expected risk is LOW or MEDIUM; if HIGH or CRITICAL, report before editing.

- [ ] **Step 2: Write failing service tests**

Cover credentials, provider availability, successful Google exchange, wrong state, wrong verifier, expired code, and replay:

```ts
test("Google exchange is PKCE-bound and single-use", async () => {
  const code = await service.completeGoogleSession({
    brokerRequest,
    cookieHeader: "__Secure-authjs.session-token=web-session",
    user,
  });

  const first = await service.exchangeGoogleCode({
    code: code.data.code,
    codeVerifier: verifier,
    state,
  });
  const second = await service.exchangeGoogleCode({
    code: code.data.code,
    codeVerifier: verifier,
    state,
  });

  assert.equal(first.success, true);
  assert.equal(second.success, false);
});
```

Add a test that credential errors return one generic unauthorized response for unknown email and wrong password.

- [ ] **Step 3: Run tests and verify the red state**

```bash
node --test --import tsx tests/capabilities/mobile-auth-service.test.ts
```

Expected: FAIL because the service modules do not exist.

- [ ] **Step 4: Implement the service**

Use dependency injection:

```ts
export interface CreateMobileAuthServiceOptions {
  authUsers: AuthUserService;
  brokerSecret: string | null;
  exchangeProvider: MobileAuthExchangeProvider | null;
  now?: () => Date;
  origin: string;
  randomCode?: () => string;
}
```

Credential issuance verifies through `authUsers.verifyCredentials` and calls `issueAuthJsCookie`. Google completion verifies the signed broker request, encrypts the browser cookie, hashes a 32-byte random code, and saves the exchange. Exchange consumes first, then compares state and PKCE with timing-safe comparisons, decrypts the cookie, and returns `MobileSessionData`.

`enabledProviders()` delegates to the existing server-only provider gate. Add a small exported `isOAuthProviderEnabled(id)` helper to `oauth-providers.ts`; do not expose environment keys or values.

The factory:

- resolves the existing auth user service;
- uses one module-level memory provider in mock mode;
- uses `createConfiguredMobileAuthExchangeProvider()` in live mode;
- reads `AUTH_SECRET` or `NEXTAUTH_SECRET`;
- fails closed through a typed configuration error when secret/storage is absent.

- [ ] **Step 5: Run focused and existing auth tests**

```bash
node --test --import tsx tests/capabilities/mobile-auth-service.test.ts tests/capabilities/auth-user-service.test.ts
npx tsc --noEmit
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit**

Run GitNexus staged change detection, then:

```bash
git add features/auth/mobile-service.ts features/auth/mobile-service-factory.ts features/auth/oauth-providers.ts tests/capabilities/mobile-auth-service.test.ts
git commit -m "feat(auth): issue mobile sessions through shared users"
```

---

### Task 4: Mobile Auth API Routes and Google Broker

**Files:**
- Create: `app/api/auth/mobile/providers/route.ts`
- Create: `app/api/auth/mobile/credentials/route.ts`
- Create: `app/api/auth/mobile/google/start/route.ts`
- Create: `app/api/auth/mobile/google/complete/route.ts`
- Create: `app/api/auth/mobile/google/exchange/route.ts`
- Create: `app/(app)/app/account/mobile-google/page.tsx`
- Create: `app/(app)/app/account/mobile-google/mobile-google-auth.tsx`
- Create: `tests/pages/mobile-auth-routes.test.ts`

**Interfaces:**
- Consumes: `resolveMobileAuthService()`, `auth()`, `signIn("google")`
- Produces: the five HTTP contracts in the approved spec.

- [ ] **Step 1: Write failing route tests**

Test:

```ts
test("credentials route returns a no-store API envelope", async () => {
  const response = await credentialsRoute.POST(
    new Request("https://orbit.example/api/auth/mobile/credentials", {
      body: JSON.stringify({
        email: "person@example.com",
        password: "correct-password",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );

  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Content-Type")?.includes("application/json"), true);
});
```

Also test invalid callback rejection, provider disabled, successful start redirect, unauthenticated completion, callback URL containing only `code` and `state`, exchange no-store response, and that route source does not contain `console.log` for sensitive values.

- [ ] **Step 2: Run route tests and verify the red state**

```bash
node --test --import tsx tests/pages/mobile-auth-routes.test.ts
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Implement thin JSON routes**

Each JSON route:

- resolves feature mode;
- parses only documented fields;
- calls the mobile auth service;
- maps typed failures to the shared API envelope and HTTP status;
- includes runtime-boundary headers;
- sets `Cache-Control: no-store` on credentials and exchange.

Do not call storage, Auth.js JWT helpers, or auth user fixtures from route files.

- [ ] **Step 4: Implement browser start, broker page, and completion**

The start route validates input through the service and redirects to:

```ts
const brokerUrl = new URL("/app/account/mobile-google", request.url);
brokerUrl.searchParams.set("request", result.data.request);
return NextResponse.redirect(brokerUrl);
```

The broker client component automatically calls:

```ts
void signIn("google", {
  callbackUrl: `/api/auth/mobile/google/complete?request=${encodeURIComponent(
    brokerRequest,
  )}`,
});
```

It renders only a quiet `正在打开 Google 登录…` state plus a return link. If Google is unavailable, the server page renders `Google 登录暂时不可用，请使用邮箱登录。`

The completion route calls `auth()`, extracts only the Auth.js session cookie name/value from the request, asks the service to create a one-time code, and redirects to the fixed scheme with `code` and `state`. It never includes the cookie in the URL.

- [ ] **Step 5: Run route and full auth tests**

```bash
node --test --import tsx tests/pages/mobile-auth-routes.test.ts tests/capabilities/mobile-auth-*.test.ts tests/capabilities/auth-user-service.test.ts
npx tsc --noEmit
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit**

Run GitNexus staged change detection, then:

```bash
git add app/api/auth/mobile app/'(app)'/app/account/mobile-google tests/pages/mobile-auth-routes.test.ts
git commit -m "feat(auth): broker Google login for the iOS app"
```

---

### Task 5: Auth.js Compatibility, Documentation, and Web Verification

**Files:**
- Modify: `tests/pages/mobile-auth-routes.test.ts`
- Create: `features/auth/DESIGN.md`
- Modify only if required by documented test registration: `shared/knowledge/knowledge-manifest.ts`

**Interfaces:**
- Consumes: credentials route and Auth.js handlers.
- Produces: proof that the returned cookie is readable by the existing Auth.js session endpoint.

- [ ] **Step 1: Run impact analysis before any manifest edit**

If `shared/knowledge/knowledge-manifest.ts` must change, run GitNexus upstream impact analysis on the exact exported symbol first. Skip the file when `features/auth/DESIGN.md` satisfies repository documentation routing.

- [ ] **Step 2: Add the Auth.js compatibility integration test**

```ts
test("mobile credentials cookie is accepted by the Auth.js session handler", async () => {
  const mobile = await credentialsRoute.POST(credentialsRequest);
  const payload = await mobile.json();
  const cookieHeader = payload.data.cookieHeader as string;

  const session = await authHandlers.GET(
    new Request("https://orbit.example/api/auth/session", {
      headers: { Cookie: cookieHeader },
    }),
  );
  const sessionPayload = await session.json();

  assert.equal(session.status, 200);
  assert.equal(sessionPayload.user.id, "user_1");
  assert.equal(sessionPayload.user.email, "person@example.com");
});
```

Use injected deterministic auth dependencies or test environment configuration. Do not depend on a real Google account.

- [ ] **Step 3: Run the integration test and fix only compatibility defects**

```bash
node --test --import tsx tests/pages/mobile-auth-routes.test.ts
```

Expected: PASS. If it fails, adjust cookie name, salt, claims, or secure-cookie selection in `mobile-crypto.ts`; do not create a parallel token format.

- [ ] **Step 4: Document the finished feature boundary**

Create `features/auth/DESIGN.md` covering:

- canonical user ownership;
- Web and mobile session issuance;
- fixed callback and PKCE;
- atomic exchange storage;
- secret/configuration requirements;
- log redaction;
- supported and unsupported flows.

State explicitly that password reset remains unavailable.

- [ ] **Step 5: Run final Web verification**

```bash
npm test -- --runInBand
npx tsc --noEmit
npm run build
git diff --check
```

If the repository test script does not accept `--runInBand`, run `npm test` without it. Expected: all relevant tests pass, TypeScript exits 0, and Next.js production build exits 0. Report unrelated pre-existing failures separately rather than hiding them.

- [ ] **Step 6: Detect impact and commit**

Stage only auth bridge files and documentation. Run GitNexus staged change detection and inspect affected routes/processes.

```bash
git add features/auth app/api/auth/mobile app/'(app)'/app/account/mobile-google tests/capabilities/mobile-auth-*.test.ts tests/pages/mobile-auth-routes.test.ts
git commit -m "docs(auth): document the mobile session bridge"
```

If code changed during compatibility verification, use a code-focused commit message instead and include only those verified files.

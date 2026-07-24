# Orbit Mobile Auth Bridge Design

## Status

Approved by the user on 2026-07-24.

## Goal

Extend the existing Auth.js/NextAuth email and Google authentication system with a narrow mobile bridge so the iOS app can obtain a real Orbit session without duplicating the Google user model or exposing provider secrets in the app.

## Scope

- A mobile credentials session endpoint backed by the existing auth user service.
- A Web-brokered Google login flow for the `orbit://account/oauth` callback.
- A short-lived, single-use, PKCE-bound authorization-code exchange.
- Auth.js-compatible session cookie material returned to the authenticated mobile client.
- Provider-availability reporting for the iOS login screen.
- Feature contracts, service/provider boundaries, API routes, tests, and implementation documentation.

## Non-goals

- No native Google SDK integration.
- No changes to the normal Web login, sign-up, forgot-password, or Google callback behavior.
- No new user table or parallel mobile identity.
- No long-lived OAuth access or refresh token from Google is sent to the app.
- No broad authorization rewrite for unrelated APIs.
- No password-reset backend in this change.

## Existing Boundaries

The bridge reuses:

- `auth.ts` for Auth.js configuration, Google provider setup, JWT session behavior, and OAuth user upsert;
- `features/auth` for credential verification and canonical auth user records;
- `/api/auth/register` for email registration;
- the Auth.js session endpoint for post-login validation;
- the shared API envelope and runtime-boundary headers for mobile JSON endpoints.

The bridge does not import mobile UI code. The iOS app consumes it only through HTTPS.

## Public HTTP Contract

### Provider availability

`GET /api/auth/mobile/providers`

Returns enabled mobile-safe providers:

```json
{
  "success": true,
  "data": {
    "providers": ["google"]
  }
}
```

The response contains provider IDs only. Environment variable names and values never reach the client.

### Credentials session

`POST /api/auth/mobile/credentials`

Request:

```json
{
  "email": "person@example.com",
  "password": "secret",
  "redirectTo": "/profile"
}
```

After `features/auth` verifies the credentials, the endpoint issues the same JWT session shape used by Auth.js and returns:

```json
{
  "success": true,
  "data": {
    "cookieHeader": "authjs.session-token=...",
    "expiresAt": "2026-08-23T00:00:00.000Z",
    "user": {
      "id": "auth_user_...",
      "email": "person@example.com",
      "name": "Person"
    }
  }
}
```

The cookie name and JWT salt must match Auth.js secure-cookie behavior for the deployment URL. The route sets `Cache-Control: no-store` and never logs the cookie value.

### Google start

`GET /api/auth/mobile/google/start`

Required query parameters:

- `state`: random client correlation value;
- `code_challenge`: base64url SHA-256 PKCE challenge;
- `redirect_uri`: exactly `orbit://account/oauth`;
- optional `next`: an allowlisted in-app path.

The route validates all inputs, creates a signed short-lived broker request, and starts the existing Auth.js Google provider in a browser context. Google remains configured only through the existing server environment variables.

### Google completion

After Auth.js completes Google login, the broker completion route:

1. calls `auth()` and requires a valid Orbit user;
2. reads the browser's Auth.js session cookie;
3. creates a cryptographically random authorization code;
4. stores only the code hash plus an encrypted session payload, PKCE challenge, expiry, redirect URI, and user audit fields;
5. redirects to `orbit://account/oauth?code=<code>&state=<state>`.

The raw session cookie is never placed in the custom-scheme URL.

### Google exchange

`POST /api/auth/mobile/google/exchange`

Request:

```json
{
  "code": "opaque-one-time-code",
  "codeVerifier": "pkce-verifier",
  "state": "original-state"
}
```

The service hashes the code, atomically consumes the active record, checks expiry, state, redirect URI, and PKCE, decrypts the session payload, and returns the same session envelope as the credentials endpoint.

An exchange record cannot be consumed twice, including concurrent requests.

## Feature Architecture

The mobile bridge is a feature-owned boundary under `features/auth`:

- contract and validation types;
- service interface;
- mock/in-memory provider for deterministic tests;
- live Postgres provider for authorization-code persistence;
- session-cookie codec using the installed Auth.js JWT API;
- broker-request signing/encryption helper;
- service factory selected through the existing module-mode rules.

Product/API routes call the feature service. They do not access fixtures, environment variables, or Postgres directly.

The live code provider uses an atomic conditional consume operation. A read followed by an unconditional delete is insufficient because two requests could both succeed. Missing live storage fails closed; it does not fall back to process memory in a live deployment.

## Security Properties

- Only the fixed `orbit://account/oauth` redirect URI is accepted.
- `next` accepts only internal allowlisted paths.
- State and PKCE are required for every Google attempt.
- Authorization codes contain at least 256 bits of randomness.
- Raw code values are never persisted.
- Code lifetime is at most two minutes.
- A code is consumed once with an atomic compare-and-set operation.
- The stored Auth.js session payload is encrypted at rest using a key derived from the server auth secret.
- Exchange and credentials responses use `Cache-Control: no-store`.
- Secrets, codes, password values, and cookie values are redacted from logs and error contexts.
- Generic user-facing errors do not reveal whether an email exists.
- Provider configuration remains server-only.

## Session Compatibility

The bridge returns an Auth.js-compatible cookie header because the current mobile API client already has one authenticated request boundary and Web protected routes already understand Auth.js sessions.

The cookie codec must be verified by an integration test that:

1. issues a mobile credentials session;
2. sends the returned cookie to the Auth.js session handler;
3. receives the expected user ID, email, and name.

This prevents a locally valid token implementation that Auth.js itself cannot decode.

## Error Contract

Stable app error codes distinguish:

- invalid input;
- provider unavailable;
- invalid credentials;
- unauthenticated Google completion;
- invalid redirect;
- expired authorization code;
- already-consumed authorization code;
- state mismatch;
- PKCE mismatch;
- mobile session configuration unavailable.

The public message stays actionable and contains no protocol internals. Error contexts may contain redacted request IDs and feature mode, but never credentials or token material.

## Testing

Feature tests cover:

- input normalization and redirect allowlisting;
- credential verification and Auth.js cookie issuance;
- signed broker request expiry and tamper detection;
- Google completion without a session;
- correct PKCE exchange;
- wrong verifier, wrong state, expired code, unknown code;
- sequential and concurrent replay rejection;
- provider-disabled behavior;
- missing live storage fail-closed behavior;
- log and response redaction.

Route tests cover JSON envelopes, status codes, no-store headers, redirects, and runtime-boundary headers.

Verification requires:

- focused auth tests;
- relevant route tests;
- the full affected Web test set;
- TypeScript checks;
- a production Next.js build.

Real Google authorization remains an explicit manual end-to-end check when interactive provider access is unavailable to automation.

## Success Criteria

- Existing Web email and Google login continue unchanged.
- iOS can exchange valid email credentials for an Auth.js-compatible Orbit session.
- iOS can complete Google login through the system browser and receive the same kind of session.
- Web and iOS resolve to the same canonical auth user record.
- Redirect tampering, PKCE mismatch, expiry, replay, and missing storage all fail closed.
- No provider secret, Google token, raw authorization code, or session value appears in a custom URL or log.

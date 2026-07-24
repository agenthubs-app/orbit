# Authentication Boundary

Orbit keeps account identity, browser sessions, and mobile session delivery in
one authentication boundary:

- `auth_users` is the canonical account collection. Both credentials and
  Google sign-in resolve to the same user record, and users with the same
  verified email are not forked into separate accounts.
- `auth.ts` owns the Auth.js configuration and JWT session callbacks used by
  the Web app.
- `mobile-service.ts` issues the same Auth.js-compatible session format for
  iOS. The mobile routes do not define a parallel token format.

## Mobile credentials

`POST /api/auth/mobile/credentials` verifies credentials through
`AuthUserService` and returns a session Cookie header plus its user and expiry.
Unknown emails and wrong passwords share one response so the endpoint cannot be
used to enumerate accounts.

The iOS app stores this Cookie header in Keychain and sends it only to the
configured Orbit API origin. It validates the session through
`/api/auth/session` before treating the user as signed in.

## Mobile Google broker

The iOS app opens the system browser at
`GET /api/auth/mobile/google/start`. The request must contain:

- the exact `orbit://account/oauth` callback;
- a random state;
- an S256 PKCE challenge;
- an optional internal `next` path.

The server signs those values into a five-minute broker request. The browser
uses the existing Auth.js Google provider, then the completion route replaces
the browser session with a random authorization code. Only that code and the
original state enter the custom-scheme callback. Google tokens and session
cookies never enter the callback URL.

The authorization code:

- is stored only as a SHA-256 hash;
- expires after two minutes;
- is bound to the original state and PKCE challenge;
- can be consumed once with one conditional `UPDATE … RETURNING` statement;
- protects its stored Cookie header with authenticated encryption.

The exchange consumes a code before checking state and PKCE. A failed check
therefore burns the code instead of leaving it available for another attempt.

## Storage and configuration

Mock mode uses process-local memory for repeatable development and tests. Live
mode stores exchanges in `orbit_records` under the
`mobile_auth_exchanges` collection and requires configured Postgres storage.

Session signing and broker encryption require `AUTH_SECRET` or
`NEXTAUTH_SECRET`. Google availability additionally requires both
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. Missing secret, provider, or live
storage fails closed.

Responses containing credentials or exchanged sessions use `Cache-Control:
no-store`. Passwords, raw authorization codes, signed broker requests,
encrypted payloads, and Cookie values must not be logged.

## Supported flows

- Web email registration and credentials sign-in
- Web Google sign-in
- iOS email credentials sign-in
- iOS Google sign-in through the Web broker
- Web and iOS sign-out by clearing their local session

Password reset is not implemented. Clients must describe it as unavailable
rather than simulating a successful reset.

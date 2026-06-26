# Mock Account Session Live Implementation

## Live Service And Provider Files

The mock boundary lives in `features/account/service.ts`,
`features/account/mock-service.ts`, `features/account/contract.ts`, and
`features/account/fixtures.ts`. A live implementation should add a live
constructor beside the mock implementation, for example
`features/account/live-service.ts`, and keep route handlers such as
`app/api/account/me/route.ts` and
`app/api/account/session/sign-out/route.ts` consuming the same
`AccountSessionService` interface.

## Switch Mechanism

The current sprint always constructs `createMockAccountSessionService()` so the
debug surface and API probes cannot reach external services. The live switch
should be centralized in an account service factory that resolves mock, hybrid,
or live mode from the existing Orbit runtime mode helpers. Pages and route
handlers should ask that factory for an `AccountSessionService` rather than
branching on raw environment values.

## Required Env Vars And Permissions

Live auth is expected to require `ORBIT_SUPABASE_URL`,
`ORBIT_SUPABASE_ANON_KEY`, and an auth callback value such as
`ORBIT_AUTH_CALLBACK_URL`. The live provider also needs explicit user consent
for profile reads and sign-out. Do not store secrets in this document or in
fixtures.

## Privacy And Provenance Constraints

Every live account payload must keep source and evidence provenance equivalent
to the mock DTOs: where the account came from, why the current session is
trusted, and which evidence id supports the user-visible state. Debug pages must
avoid raw provider payloads, tokens, cookies, relationship records, or private
profile fields. Require-account failures should keep returning shared failure
envelopes with non-sensitive context only.

## Replacement Tests

Replace the mock-only route expectations in
`tests/capabilities/mock-account-session.test.ts` with factory-mode tests that
prove mock mode remains deterministic, live mode is guarded when configuration
is absent, and the live route handlers preserve the same envelope shape. Add
provider tests for successful session read, signed-out session, sign-out, and
require-account failure before enabling live auth in product routes.

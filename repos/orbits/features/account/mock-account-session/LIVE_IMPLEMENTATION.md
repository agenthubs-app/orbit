# Mock Account Session Live Implementation

## Live Service And Provider Files

The mock boundary lives in `features/account/service.ts`,
`features/account/mock-service.ts`, `features/account/contract.ts`, and
`features/account/fixtures.ts`. The remote storage backed implementation now
lives beside it:

- `features/account/live-service.ts`
- `features/account/storage/account-live-record-provider.ts`

Route handlers such as `app/api/account/me/route.ts` and
`app/api/account/session/sign-out/route.ts` continue to consume the same
`AccountSessionService` interface.

## Switch Mechanism

The switch is centralized in `features/account/service-factory.ts`. Mock mode
uses `createMockAccountSessionService()`. Live mode uses
`createLiveAccountSessionService()` with the configured remote live record
store. Hybrid mode still falls back to mock until a dedicated hybrid account
provider is needed.

## Required Env Vars And Permissions

The current live storage backed implementation requires one of
`ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`,
plus optional `ORBIT_WORKSPACE_ID`. It does not require Supabase Auth settings,
OAuth callback URLs, cookies, or token storage.

Future live auth provider work may require `ORBIT_SUPABASE_URL`,
`ORBIT_SUPABASE_ANON_KEY`, and an auth callback value such as
`ORBIT_AUTH_CALLBACK_URL`. Do not store secrets in this document or in fixtures.

## Privacy And Provenance Constraints

Every live account payload keeps source and evidence provenance equivalent to
the mock DTOs: where the account came from, why the current session is trusted,
and which evidence ids support the user-visible state. Debug pages must avoid
raw provider payloads, tokens, cookies, relationship records, or private profile
fields. Require-account failures keep returning shared failure envelopes with
non-sensitive context only.

## Replacement Tests

`tests/capabilities/account-live-store.test.ts` proves successful remote account
and profile record mapping, live factory registration, unconfigured live storage
failure, and `/api/account/me` envelope behavior. The existing
`tests/capabilities/mock-account-session.test.ts` continues to prove mock mode
determinism and route compatibility.

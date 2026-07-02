# Profile Onboarding And Manual Profile Editor Live Implementation

This capability now supports both deterministic mock mode and remote live mode.
Live mode reads the generated operator profile from shared live record storage
and writes manual profile edits back to the same `profiles` record. Mock mode
remains deterministic for local tests and fixture-driven debug views.

## Live Service And Provider Files

- Keep `features/profile/service.ts` as the stable service interface consumed by
  route handlers and pages.
- Keep `features/profile/mock-service.ts` as the deterministic fixture-backed
  implementation used by tests and demo routes.
- Keep live code in separate feature-owned files:
  `features/profile/live-service.ts` and
  `features/profile/storage/profile-live-record-provider.ts`.
- The live provider reads generated `profiles` and `accounts` records from
  shared `orbit_records`. Field shape stays in
  `features/profile/contract.ts`; the generic storage layer does not define
  profile-specific columns.
- Keep `app/api/profile/route.ts` thin. It should resolve a profile service,
  translate results into the shared API envelope, and never embed storage rules.

## Switch Mechanism

`app/api/profile/route.ts` resolves the service through
`features/profile/service-factory.ts`. `ORBIT_MODULE_MODE` or
`ORBIT_FEATURE_MODE` selects mock, hybrid, or live behavior. Hybrid currently
inherits the mock profile implementation; live mode uses the shared live record
store and fails closed when database configuration is missing.

## Required Env Vars And Permissions

- Current shared live storage uses `ORBIT_EVENT_DATABASE_URL`,
  `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID` selects the workspace partition, defaulting to
  `orbit-dev` for local development.
- `ORBIT_PROFILE_DATABASE_URL`, `ORBIT_PROFILE_SERVICE_ROLE_KEY`, and
  `ORBIT_PROFILE_READONLY_KEY` are reserved names for a future dedicated
  profile store if profile data moves out of the generic live record table.
- No browser storage, device permissions, OAuth scopes, or third-party service
  permissions are required by the current live implementation.

## Privacy And Provenance Constraints

- Every profile read or update must preserve source and evidence provenance.
- Do not store profile fields without a source label, preserved evidence ids,
  and an update timestamp.
- Keep relationship context private to the Orbit account boundary. Do not expose
  profile fields to analytics, messaging, or scoring services unless the caller
  receives provenance with the payload.
- Validation failures must use controlled error codes and must not echo hidden
  credentials or raw provider errors.

## Replacement Tests

Live mode replacement is covered by tests that prove:

- `features/profile/live-service.ts` implements the `ProfileService` interface.
- Provider payloads map into the same DTOs exported from
  `features/profile/contract.ts`.
- `app/api/profile/route.ts` still returns `{ success: true, data }` and
  `{ success: false, error }` envelopes for GET and PUT.
- Empty profile, pending update, and validation failure paths remain covered.
- Source and evidence provenance survive live reads and writes.
- Tests can force mock mode so `features/profile/mock-service.ts` remains
  deterministic.

Current evidence:

- `tests/capabilities/profile-live-store.test.ts` proves live reads and upserts
  generated `profiles` and `accounts` records through shared live storage.
- `tests/capabilities/profile-onboarding-and-manual-profile-editor.test.ts`
  keeps the mock profile contract, route envelopes, debug states, and live
  handoff documentation covered.

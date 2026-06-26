# Profile Onboarding And Manual Profile Editor Live Implementation

This sprint ships a mock-first profile capability. The mock service is the only
active implementation for Milestone C, and it must stay deterministic until a
live profile store is intentionally added behind the same service interface.

## Live Service And Provider Files

- Keep `features/profile/service.ts` as the stable service interface consumed by
  route handlers and pages.
- Keep `features/profile/mock-service.ts` as the deterministic fixture-backed
  implementation used by tests and demo routes.
- Add live code in a future sprint as separate files, for example
  `features/profile/live-service.ts`, `features/profile/profile-provider.ts`,
  `features/profile/profile-mapper.ts`, and
  `features/profile/profile-validator.ts`.
- Keep `app/api/profile/route.ts` thin. It should resolve a profile service,
  translate results into the shared API envelope, and never embed storage rules.

## Switch Mechanism

The current route constructs `createMockProfileService()` directly so the
capability cannot drift into live persistence during Milestone C. A future
switch should route through the shared service factory and select mock, hybrid,
or live mode with `ORBIT_MODULE_MODE` after the live implementation and tests
exist. Mock mode remains the default for local development and automated tests.

## Required Env Vars And Permissions

- `ORBIT_PROFILE_DATABASE_URL` for the live profile data store.
- `ORBIT_PROFILE_SERVICE_ROLE_KEY` or an equivalent server-only credential for
  profile writes.
- `ORBIT_PROFILE_READONLY_KEY` if read and write credentials are split.
- No browser storage, device permissions, OAuth scopes, or third-party service
  permissions are required by this mock sprint.

## Privacy And Provenance Constraints

- Every profile read or update must preserve source and evidence provenance.
- Do not store profile fields without a source label, evidence ids, and an
  update timestamp.
- Keep relationship context private to the Orbit account boundary. Do not expose
  profile fields to analytics, messaging, or scoring services unless the caller
  receives provenance with the payload.
- Validation failures must use controlled error codes and must not echo hidden
  credentials or raw provider errors.

## Replacement Tests

Before live mode replaces the mock path, add tests that prove:

- `features/profile/live-service.ts` implements the `ProfileService` interface.
- Provider payloads map into the same DTOs exported from
  `features/profile/contract.ts`.
- `app/api/profile/route.ts` still returns `{ success: true, data }` and
  `{ success: false, error }` envelopes for GET and PUT.
- Empty profile, pending update, and validation failure paths remain covered.
- Source and evidence provenance survive live reads and writes.
- Tests can force mock mode so `features/profile/mock-service.ts` remains
  deterministic.

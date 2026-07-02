# Network Distribution Analytics Mock: Live Implementation Handoff

This capability owns industry distribution, value type distribution,
relationship strength distribution, and network gap analysis. The mock service
remains the default, while live mode now reads the shared generated
relationship graph from `orbit_records`.

## Live Service And Provider Files

- `features/dashboard/service-factory.ts` owns provider selection. `mock`
  remains the safe default; `live` creates the live service with configured
  storage.
- `features/dashboard/live-distribution-service.ts` implements
  `NetworkDistributionAnalyticsService` from
  `features/dashboard/distribution-contract.ts`.
- `features/dashboard/storage/network-distribution-live-record-provider.ts`
  adapts the shared dashboard live graph reader for this capability.
- `features/dashboard/storage/dashboard-live-record-provider.ts` owns the
  field-specific mapping from generic `orbit_records` payloads into generated
  contact, connection, evidence, event, and task DTOs.

## Switch Mechanism

Keep `createMockNetworkDistributionAnalyticsService` as the safe default.
Live mode is selected through the shared module mode boundary:

- unset or `mock`: use `features/dashboard/mock-distribution-service.ts`.
- `live`: use `features/dashboard/live-distribution-service.ts`.
- unsupported modes fail closed through the shared module service factory.

The API routes under `/api/dashboard/distributions` and
`/api/dashboard/network-gaps` must keep returning the shared API envelope:
`{ success: true, data }` or `{ success: false, error }`.

## Required Env Vars Or Permissions

- `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`.
- `ORBIT_EVENT_DATABASE_URL` or `ORBIT_LIVE_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID`.
- Database read permission for the shared `orbit_records` table.
- No notification, email send, calendar write, or device permissions are
  required for this capability.

## Privacy And Provenance Constraints

- Every distribution bucket and gap recommendation must carry evidence ids and
  source/provenance metadata.
- Live graph reads must expose whether they read relationship data and which
  approved source produced the metric.
- The API response must not expose private raw notes, full email bodies,
  calendar descriptions, or unapproved provider payloads.
- Empty, pending, and controlled failure states must remain explicit and
  visible to product and dev surfaces.
- Live code must never silently fall back to mock data when database access or
  provenance validation fails.

## Replacement Tests

The live replacement test is
`tests/capabilities/network-distribution-live-store.test.ts`. It covers:

- success envelopes for industry distribution, value type distribution,
  relationship strength distribution, and network gap analysis.
- empty envelopes when no approved sourced relationships are available.
- fail-closed behavior when live storage is not configured.
- read-only behavior: no connection/contact/task records are mutated.
- mock provider guards proving the mock implementation still performs no
  external network, device, database, AI provider, email, calendar, or
  notification calls.

# Opportunity Reminder Analytics Mock: Live Implementation Handoff

This capability owns high-priority opportunities, dormant high-value contacts,
current-goal matching, suggested contact reasons, and recompute previews. The
mock service remains the default, while live mode now reads the shared generated
relationship graph from `orbit_records`.

## Live Service And Provider Files

- `features/dashboard/service-factory.ts` owns provider selection. `mock`
  remains the safe default; `live` creates the live service with configured
  storage.
- `features/dashboard/live-opportunity-service.ts` implements
  `OpportunityReminderAnalyticsService` from
  `features/dashboard/opportunity-contract.ts`.
- `features/dashboard/storage/opportunity-live-record-provider.ts` adapts the
  shared dashboard live graph reader for this capability.
- `features/dashboard/storage/dashboard-live-record-provider.ts` owns the
  field-specific mapping from generic `orbit_records` payloads into generated
  contact, connection, evidence, event, and task DTOs.

## Switch Mechanism

Keep `createMockOpportunityReminderAnalyticsService` as the safe default.
Live mode is selected through the shared module mode boundary:

- unset or `mock`: use `features/dashboard/mock-opportunity-service.ts`.
- `live`: use `features/dashboard/live-opportunity-service.ts`.
- unsupported modes fail closed through the shared module service factory.

The API routes under `/api/dashboard/opportunities` and
`/api/dashboard/opportunities/recompute` must keep returning the shared API
envelope: `{ success: true, data }` or `{ success: false, error }`.

## Required Env Vars Or Permissions

- `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`.
- `ORBIT_EVENT_DATABASE_URL` or `ORBIT_LIVE_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID`.
- Database read permission for the shared `orbit_records` table.
- No notification send, email send, calendar write, device, or AI provider
  permission is required for this capability.

## Privacy And Provenance Constraints

- Every high-priority opportunity, dormant high-value contact, current-goal
  match, and suggested contact reason must carry evidence ids and
  source/provenance metadata.
- Live predictive scoring and background opportunity mining are not executed.
  They may be introduced later only after they expose model, query, source, and
  evidence provenance and pass replacement tests.
- The API response must not expose private raw notes, full email bodies,
  calendar descriptions, or unapproved provider payloads.
- Empty, pending, and controlled failure states must remain explicit and
  visible to product and dev surfaces.
- Live code must never silently fall back to mock data when database access or
  provenance validation fails.

## Replacement Tests

The live replacement test is
`tests/capabilities/opportunity-reminder-live-store.test.ts`. It covers:

- success envelopes for high-priority opportunities, dormant high-value
  contacts, current-goal matching, and suggested contact reasons.
- success envelopes for `/api/dashboard/opportunities/recompute` with changed
  opportunity ids and no notification delivery.
- empty envelopes when no approved evidence-backed contacts or goals are
  available.
- fail-closed behavior when live storage is not configured.
- read-only behavior: no task, connection, contact, notification, email, or
  calendar records are mutated.
- mock provider guards proving the mock implementation still performs no
  external network, device, database, AI provider, email, calendar, or
  notification calls.

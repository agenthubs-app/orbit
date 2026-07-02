# Duplicate Detection and Merge Live Implementation

The live implementation is now registered through
`features/acquisition/service-factory.ts` and implemented by
`features/acquisition/live-merge-service.ts`.

The storage adapter lives at
`features/acquisition/storage/duplicate-merge-live-record-provider.ts`. It
uses the shared `orbit_records` envelope to read remote `contactDrafts`,
`contacts`, and `evidence` records. Generic storage remains in
`shared/storage/live-record-store.ts`; duplicate-specific fields stay in the
acquisition contract and mapper layer.

## Switch Mechanism

- `ORBIT_MODULE_MODE=mock` keeps route handlers on
  `features/acquisition/mock-merge-service.ts`.
- `ORBIT_MODULE_MODE=live` routes the same API handlers to
  `features/acquisition/live-merge-service.ts` through the acquisition service
  factory.
- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or
  `ORBIT_DATABASE_URL` configures the Postgres/Supabase live record store.
- `ORBIT_WORKSPACE_ID` selects the workspace; the local development workspace is
  usually `workspace:orbit-dev`.

## Current Live Boundary

- Reads source-backed imported drafts from the unified `contactDrafts` queue.
- Reads existing relationship records from the `contacts` collection.
- Uses evidence ids from both sides to explain every duplicate suggestion.
- Generates duplicate candidates with deterministic email and
  name+organization matching.
- Returns field-level merge decisions and an explicit confirmation preview.

The first live version is intentionally review-only. `applyMergeSuggestion()`
does not update `contacts`, does not write an audit record, does not perform a
destructive merge, does not call AI, does not read email/calendar providers,
does not send notifications, and does not use external network providers.

## Privacy And Provenance Constraints

- Preserve imported draft evidence, existing contact evidence, match reasons,
  field-level decisions, reviewer identity, and confirmation timestamp.
- Keep source provenance visible in both suggestion and apply-preview payloads.
- Every live response carries `privacy="live-duplicate-detection-merge"`.
- Provenance must keep `liveDatabaseReadExecuted=true` for successful live
  reads and keep `databaseWriteExecuted=false`, `destructiveMergeExecuted=false`,
  `importedContactWriteExecuted=false`, and `notificationDelivered=false`.
- Missing suggestions, blocked confirmations, pending review, unconfigured
  storage, and live provider failures must return visible API failure envelopes.

## Tests

- `tests/capabilities/duplicate-detection-merge-live-store.test.ts` proves live
  duplicate detection, apply-preview behavior, unconfigured fail-closed
  behavior, factory registration, and API live-mode failure envelopes.
- `tests/capabilities/duplicate-detection-and-merge-mock.test.ts` keeps the
  deterministic mock contract, API envelopes, debug panel, and no-provider-call
  constraints covered.
- Future destructive merge writers need separate tests proving audited contact
  writes, rollback behavior, and source evidence retention before they can be
  enabled.

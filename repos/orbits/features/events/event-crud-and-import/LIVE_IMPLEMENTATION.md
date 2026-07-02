# Event CRUD and Import Mock Live Implementation

## Live service and provider files

- `features/events/event-crud-and-import/live-service.ts` should implement the `EventCrudAndImportService` interface from `features/events/event-crud-and-import/service.ts`.
- `features/events/event-crud-and-import/providers/storage-event-provider.ts`
  maps shared `orbit_records` rows from `shared/storage` into the live event
  provider contract. It is the first concrete provider for the Events Live Store
  boundary and keeps event DTO mapping out of the generic storage layer.
- The first live phase is the Events Live Store only: list/detail/manual create
  for Orbit-owned event records. Calendar sync and organizer-feed import remain
  separate future providers that can write into the live store after their own
  OAuth, permission, deduplication, and replacement tests exist.
- `features/events/event-crud-and-import/providers/calendar-sync-provider.ts` should read calendar event records only after explicit calendar permission is granted.
- `features/events/event-crud-and-import/providers/organizer-feed-provider.ts` should read organizer feed event records only after the operator connects an approved event source.
- `features/events/event-crud-and-import/providers/event-database-provider.ts` should own live event database reads and writes behind the same API envelope used by the mock routes.

## Switch mechanism

- Keep the mock implementation as the default for Milestone C.
- Add `ORBIT_EVENT_IMPORT_PROVIDER=mock|live` when live providers exist.
- The factory should resolve `mock` to `createMockEventCrudAndImportService()` and `live` to the live service only when all provider credentials, permissions, and replacement tests are present.
- Unsupported values must fail visibly with the shared `NOT_IMPLEMENTED` or validation boundary instead of falling through to a live provider.

## Required env vars and permissions

- `ORBIT_EVENT_IMPORT_PROVIDER` selects the provider implementation.
- `ORBIT_EVENT_LIVE_STORE_PROVIDER` selects the first-phase Events Live Store
  provider when it is wired outside tests.
- `ORBIT_CALENDAR_SYNC_CLIENT_ID`, `ORBIT_CALENDAR_SYNC_CLIENT_SECRET`, and an approved calendar OAuth grant are required before calendar sync can run.
- `ORBIT_ORGANIZER_FEED_BASE_URL` and `ORBIT_ORGANIZER_FEED_TOKEN` are required before organizer feed imports can run.
- `ORBIT_EVENT_DATABASE_URL` or the shared `ORBIT_LIVE_DATABASE_URL` and the
  live database service role are required before live event database writes can
  run against Postgres. Unit tests may use the in-memory `LiveRecordStore`.
- Calendar sync, organizer feed import, and live event database writes must remain disabled until the operator has granted the specific permission and the route can attach consent evidence.

## Privacy and provenance constraints

- Every live `EventRecord` must preserve source metadata, provider record id, evidence ids, capture time, and the provider that supplied the record.
- Manual event creation must validate and record the operator-entered source note before a live database write occurs.
- Imported event records must keep skipped fields visible, especially attendee emails, ticketing notes, and other data not needed for Orbit relationship workflows.
- Live calendar, organizer, database, email, AI, and notification provider calls must be observable in tests; silent retries or background writes are not allowed.
- Failure envelopes must report the provider boundary without returning secrets, raw access tokens, private attendee details, or unreviewed relationship data.

## Replacement tests

- Replace the mock service determinism test with provider contract tests for calendar sync, organizer feed import, manual event creation, event detail reads, and live database write gating.
- Keep API envelope tests for `GET /api/events`, `POST /api/events`, and `GET /api/events/[id]`.
- Add replacement tests for empty imports, pending permission states, malformed request bodies, empty form submissions, missing source notes, missing events, title validation, provider failures, and permission-denied paths.
- Add a reload-after-state-change test proving validation and provider failures do not mutate the next successful event list response.
- Add privacy/provenance tests that prove source metadata, evidence ids, skipped fields, and consent evidence survive the mock-to-live switch.
- Add a no-unconfirmed-write test proving live event database writes do not run unless the operator has confirmed the action and provider permissions are valid.

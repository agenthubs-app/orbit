# Event Attendee Import Mock To Live Handoff

## Current Live Storage Implementation

- `features/acquisition/live-event-attendee-import-service.ts` implements the same `EventAttendeeImportService` interface exported by `features/acquisition/event-attendee-contract.ts`.
- `features/acquisition/storage/event-attendee-live-record-provider.ts` reads remote `orbit_records` collections: `events`, `attendees`, `eventParticipantIntents`, `networkPeople`, `contacts`, and `evidence`.
- The live service derives `EventAttendeeRecord` values and review-only `EventAttendeeContactDraft` values. It does not create contacts, execute bulk imports, call organizer APIs, send notifications, or perform external lookups.
- The service factory registers `live`; `hybrid` keeps the framework's mock fallback until a dedicated hybrid acquisition store exists.

## Switch Mechanism

- Keep mock mode as the default for Milestone C.
- Use `ORBIT_MODULE_MODE=live` for service selection and `ORBIT_FEATURE_MODE=live` for route headers.
- The route handlers should continue to depend on the `EventAttendeeImportService` contract and choose mock or live through the shared capability/service factory, not by importing provider files directly into pages.

## Required Env Vars And Permissions

- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`
- `ORBIT_WORKSPACE_ID`
- User or workspace permission proving the operator can import attendees for the selected event.
- Audit permission for recording source, evidence ids, imported fields, and rejected rows.

## Privacy And Provenance Constraints

- This live replacement must preserve privacy and provenance before any attendee import can write records.
- Every imported attendee must retain `source.type = "event_import"`, event id, attendee id, roster source label, and evidence ids.
- The current live storage path records `liveDatabaseReadExecuted: true`, `organizerFeedRequested: false`, `bulkDatabaseImportExecuted: false`, and `externalNetworkRequested: false`.
- Do not import private notes, hidden attendee fields, or organizer-only metadata unless the organizer feed contract explicitly permits those fields.
- Failed, skipped, duplicate, or rejected rows must be surfaced in the API envelope or a review result; they must not fail silently.
- Relationship status labels must explain the rule or provider evidence that produced them.

## Future Organizer Feed And Bulk Import

- `features/acquisition/event-attendee-import-mock/providers/organizer-attendee-feed-provider.ts` remains a future provider path for reading a live organizer attendee feed.
- `features/acquisition/event-attendee-import-mock/providers/bulk-contact-import-provider.ts` remains a future write provider path and must only run after review and confirmation.
- The future bulk database import path must stay separate from the current review-draft staging path.
- `features/acquisition/event-attendee-import-mock/providers/event-attendee-mapper.ts` remains the future mapper location if organizer-specific raw payloads require a separate adapter.
- `ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER` is not used by the current storage-backed implementation; introduce it only when multiple attendee provider backends exist.

## Replacement Tests

- The current replacement tests cover the storage-backed live path; future provider backends must add their own replacement tests.
- `tests/capabilities/event-attendee-import-live-store.test.ts` proves remote-shaped generated records become live attendee rosters and review drafts.
- Route-envelope tests for `GET /api/events/[id]/attendees` success, empty, pending, missing event, and provider failure.
- Route-envelope tests for `POST /api/contact-drafts/event-attendees/import` success, empty, pending, validation, and provider failure.
- Mapper tests proving live attendee rows become `EventAttendeeRecord` and `EventAttendeeContactDraft` values with source evidence and relationship status labels.
- Privacy tests proving organizer-only fields are dropped unless explicitly allowed.
- Provenance tests proving source, event id, attendee id, evidence ids, provider name, and import execution flags survive the mock-to-live switch.
- Bulk database import tests proving writes happen only after review/confirmation and skipped rows are reported.

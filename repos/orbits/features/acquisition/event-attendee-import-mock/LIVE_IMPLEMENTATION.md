# Event Attendee Import Mock To Live Handoff

## Live Service And Provider Files

- `features/acquisition/event-attendee-import-mock/live-service.ts` will implement the same `EventAttendeeImportService` interface exported by `features/acquisition/event-attendee-contract.ts`.
- `features/acquisition/event-attendee-import-mock/providers/organizer-attendee-feed-provider.ts` will read the live organizer attendee feed and map raw rows into `EventAttendeeRecord`.
- `features/acquisition/event-attendee-import-mock/providers/bulk-contact-import-provider.ts` will perform the reviewed bulk database import only after candidate review and confirmation.
- `features/acquisition/event-attendee-import-mock/providers/event-attendee-mapper.ts` will preserve relationship status labels, event context, and source evidence.

## Switch Mechanism

- Keep mock mode as the default for Milestone C.
- Add `ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER=live` only after the live service and replacement tests exist.
- The route handlers should continue to depend on the `EventAttendeeImportService` contract and choose mock or live through the shared capability/service factory, not by importing provider files directly into pages.

## Required Env Vars And Permissions

- `ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER`
- Organizer API base URL and scoped attendee read token for the organizer attendee feed.
- Database service role or import token scoped only to reviewed contact draft writes.
- User or workspace permission proving the operator can import attendees for the selected event.
- Audit permission for recording source, evidence ids, imported fields, and rejected rows.

## Privacy And Provenance Constraints

- This live replacement must preserve privacy and provenance before any attendee import can write records.
- Every imported attendee must retain `source.type = "event_import"`, event id, attendee id, roster source label, and evidence ids.
- The live path must record whether an organizer attendee feed was requested and whether a bulk database import executed.
- Do not import private notes, hidden attendee fields, or organizer-only metadata unless the organizer feed contract explicitly permits those fields.
- Failed, skipped, duplicate, or rejected rows must be surfaced in the API envelope or a review result; they must not fail silently.
- Relationship status labels must explain the rule or provider evidence that produced them.

## Replacement Tests

- Route-envelope tests for `GET /api/events/[id]/attendees` success, empty, pending, missing event, and provider failure.
- Route-envelope tests for `POST /api/contact-drafts/event-attendees/import` success, empty, pending, validation, and provider failure.
- Mapper tests proving live attendee rows become `EventAttendeeRecord` and `EventAttendeeContactDraft` values with source evidence and relationship status labels.
- Privacy tests proving organizer-only fields are dropped unless explicitly allowed.
- Provenance tests proving source, event id, attendee id, evidence ids, provider name, and import execution flags survive the mock-to-live switch.
- Bulk database import tests proving writes happen only after review/confirmation and skipped rows are reported.

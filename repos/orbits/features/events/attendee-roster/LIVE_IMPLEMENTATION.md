# Event Attendee Roster Mock Live Implementation

## Current mock boundary

- Contract and fixtures: `features/events/attendee-roster/contract.ts`
- Mock service: `features/events/attendee-roster/mock-service.ts`
- API route probes: `app/api/events/[id]/attendees/route.ts` and `app/api/events/[id]/attendees/import/route.ts`
- Dev validation surface: `features/events/attendee-roster/debug-view.tsx`

The mock replaces organizer attendee API integrations and privacy-gated roster access with deterministic local fixtures and rule-based filters. It must not call an external network, device, database, AI service, calendar provider, email provider, or notification provider.

The roster read and roster import probes must preserve shared event metadata and attendee identity for `demo-event-1`. The event-attendee-roster boundary owns attendee tags, known-contact markers, recommendation eligibility, privacy flags, and import batch provenance; it must not drift the event id, event name, organizer, venue, start time, attendee id, display name, organization, email, role, or check-in status away from the shared roster read fixture.

## Live service and provider files

- Live service entry: `features/events/attendee-roster/live-service.ts`
- Current generated live provider: `features/events/attendee-roster/storage/generated-attendee-roster-live-record-provider.ts`
- Work-record storage provider: `features/events/storage/event-work-record-provider.ts`
- Service factory wiring: `features/events/service-factory.ts`
- Do not add legacy mock-folder adapters under `features/events/attendee-roster/providers/`; provider adapters now belong to the live/storage boundary for this feature.

These files should implement the same `EventAttendeeRosterService` interface exported from `features/events/attendee-roster/contract.ts`.

The current live provider reads generated `events`, `attendees`, `eventParticipantIntents`, `contacts`, `connections`, `matchRecommendations`, `networkPeople`, and `evidence` records from the shared live record store. It maps those records into the attendee-roster contract inside the events feature boundary. `importAttendeeRoster` still writes the staged event roster view to the `event_attendee_rosters` work collection; the read path is generated from the source graph so event detail can show generated event ids directly.

## Switch mechanism

Use `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live` to select the live implementation through `features/events/service-factory.ts`.

- `mock`: use `createMockEventAttendeeRosterService`.
- `live`: use `createLiveEventAttendeeRosterService` with `createConfiguredGeneratedEventAttendeeRosterProvider`.
- `hybrid`: still uses the event work-record provider for attendee roster payloads.
- `ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER` is not used by the current live wiring; keep it reserved for a future organizer attendee API provider selector.

The route handlers should keep returning the shared API envelope and runtime boundary headers after the switch.

## Required environment variables and permissions

This section lists the required environment variables and permissions.

- Required environment variables: `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`, plus `ORBIT_WORKSPACE_ID`.
- Required permissions: least-privilege read access to generated event, attendee, intent, contact, connection, recommendation, person, and evidence records; write access only to the `event_attendee_rosters` work collection during roster import.
- No organizer API, external network, AI provider, calendar, email, notification, or contact-write permission is required for the current live implementation.

## Privacy and provenance constraints

- Store source event id, organizer record id, access decision id, and evidence ids with every attendee row.
- Preserve attendee tags, known-contact markers, and eligible recommendation pool rationale.
- Preserve shared event metadata and attendee identity across read and import paths before adding live-only provider fields.
- Do not admit known contacts into duplicate recommendation candidates unless a replacement test documents the expected merge behavior.
- Do not send notifications, messages, emails, calendar updates, database writes, or AI ranking calls from the roster read path.
- Fail visibly when privacy-gated roster access is denied, pending, or missing provenance.

## Replacement tests

This section records replacement tests.

Replacement tests must cover:

- Roster read success with attendee tags, known-contact markers, and eligible recommendation candidates.
- Roster import success with the same API envelope shape as the mock.
- Empty roster path when the organizer attendee API returns no privacy-approved rows.
- Pending path when privacy-gated roster access is not approved.
- Missing event and access denied failure envelopes.
- Organizer attendee API provider failure.
- Contact matching provider failure without losing source provenance.
- Confirmation that live routes do not bypass privacy checks or write recommendation candidates before operator review.

Implemented replacement coverage:

- `tests/capabilities/event-attendee-roster-live-generated-store.test.ts` proves the generated live provider returns 50 attendees for `event_01`, keeps `participant_001` first, filters 17 known contacts, and stages import writes without external side effects.
- Remote validation against the configured Postgres live store returned `event_01`, 50 attendees, 17 known contacts, `generationMethod=live-store-query`, and `x-orbit-feature-mode: live` on the import route.

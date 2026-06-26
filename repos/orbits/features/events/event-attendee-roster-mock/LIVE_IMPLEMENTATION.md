# Event Attendee Roster Mock Live Implementation

## Current mock boundary

- Contract and fixtures: `features/events/attendee-contract.ts`
- Mock service: `features/events/mock-attendee-service.ts`
- API route probes: `app/api/events/[id]/attendees/route.ts` and `app/api/events/[id]/attendees/import/route.ts`
- Dev validation surface: `features/events/event-attendee-roster-mock/debug-view.tsx`

The mock replaces organizer attendee API integrations and privacy-gated roster access with deterministic local fixtures and rule-based filters. It must not call an external network, device, database, AI service, calendar provider, email provider, or notification provider.

The roster read and roster import probes must preserve shared event metadata and attendee identity for `demo-event-1`. The event-attendee-roster boundary owns attendee tags, known-contact markers, recommendation eligibility, privacy flags, and import batch provenance; it must not drift the event id, event name, organizer, venue, start time, attendee id, display name, organization, email, role, or check-in status away from the shared roster read fixture.

## Live service and provider files

- Live service entry: `features/events/event-attendee-roster-mock/live-service.ts`
- Provider adapters: `features/events/event-attendee-roster-mock/providers/`
- Organizer API provider: `features/events/event-attendee-roster-mock/providers/organizer-attendee-api-provider.ts`
- Privacy access provider: `features/events/event-attendee-roster-mock/providers/roster-access-provider.ts`
- Contact matching provider: `features/events/event-attendee-roster-mock/providers/contact-match-provider.ts`

These files should implement the same `EventAttendeeRosterService` interface exported from `features/events/attendee-contract.ts`.

## Switch mechanism

Use `ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER` to select the implementation:

- `mock`: use `createMockEventAttendeeRosterService`.
- `live`: use the live service entry after all replacement tests pass.

The route handlers should keep returning the shared API envelope and runtime boundary headers after the switch.

## Required environment variables and permissions

- The required environment variables are `ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER`, `ORBIT_ORGANIZER_ATTENDEE_API_BASE_URL`, `ORBIT_ORGANIZER_ATTENDEE_API_CLIENT_ID`, `ORBIT_ORGANIZER_ATTENDEE_API_CLIENT_SECRET`, and `ORBIT_ROSTER_ACCESS_AUDIT_KEY`.
- Required permissions: explicit organizer attendee API permission, privacy-gated roster access approval for each event, and operator review permission before writing recommendation candidates.

## Privacy and provenance constraints

- Store source event id, organizer record id, access decision id, and evidence ids with every attendee row.
- Preserve attendee tags, known-contact markers, and eligible recommendation pool rationale.
- Preserve shared event metadata and attendee identity across read and import paths before adding live-only provider fields.
- Do not admit known contacts into duplicate recommendation candidates unless a replacement test documents the expected merge behavior.
- Do not send notifications, messages, emails, calendar updates, database writes, or AI ranking calls from the roster read path.
- Fail visibly when privacy-gated roster access is denied, pending, or missing provenance.

## Replacement tests

Replacement tests must cover:

- Roster read success with attendee tags, known-contact markers, and eligible recommendation candidates.
- Roster import success with the same API envelope shape as the mock.
- Empty roster path when the organizer attendee API returns no privacy-approved rows.
- Pending path when privacy-gated roster access is not approved.
- Missing event and access denied failure envelopes.
- Organizer attendee API provider failure.
- Contact matching provider failure without losing source provenance.
- Confirmation that live routes do not bypass privacy checks or write recommendation candidates before operator review.

# Compose App Events Live Implementation Notes

Sprint 62 composes `/app/events` from approved event CRUD/import, event attendee recommendation, event value recommendation, and event goal readiness boundaries. The app route calls service factories and route handlers; it does not import raw source data into nested UI components.

## Evaluator Evidence Summary

This document covers live service/provider files, switch mechanism, required env vars or permissions, privacy/provenance constraints, replacement tests, route state checks, route recovery actions, and `data-action-evidence`. The `/app/events` page now keeps internal capability terms out of user-visible copy: state scenarios remain accessible through `/app/events?scenario=empty`, `/app/events?scenario=pending`, and `/app/events?scenario=failure`, while the ready page reads as an event briefing rather than a validation console.

Live files:

- `features/events/service.ts`, `features/events/contract.ts`, and future `features/events/live-service.ts` for event CRUD/import.
- `features/recommendations/service.ts`, `features/recommendations/contract.ts`, and future `features/recommendations/live-service.ts` for event attendee recommendations and opening lines.
- `features/recommendations/event-value-contract.ts` and future `features/recommendations/live-event-value-service.ts` for event value recommendations and accept actions.
- `features/events/goal-contract.ts` and future `features/events/live-goal-service.ts` for event goals and readiness.
- `app/api/events/route.ts`, `app/api/recommendations/events/route.ts`, `app/api/recommendations/event/[id]/route.ts`, and `app/api/events/[id]/readiness/route.ts` for API envelopes.
- `app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory.ts` for app route service resolution.

Switch:

- The page uses `createAppEventsRouteServices`, which resolves services through `createModuleServiceFactory`.
- `ORBIT_MODULE_MODE` selects `mock`, `hybrid`, or `live`; invalid or missing values fall back to mock mode.
- Live mode must stay unavailable until the live constructors are registered and return controlled `NOT_IMPLEMENTED` failures for missing implementations.
- The app route must not branch directly on provider env vars.
- The route state boundary is owned by this app adapter as `data-state-boundary="app-events-route-state-view"` so live readiness, empty, and failure states can keep product-facing labels while still exposing deterministic route state checks.

Env and permissions:

- Live event CRUD/import requires calendar access, organizer feed credentials or import permissions, and a live event store.
- Live event attendee recommendations require approved event attendee evidence and any ranking or search service credentials.
- Live event value recommendations require event discovery access, calendar availability permission, and profile goal access.
- Live readiness requires calendar conflict permission, event goal write permission, and any approved generation service credentials.
- Required env vars or permissions must be validated before live services execute; missing configuration must fail visibly through the shared API envelope.

Privacy and provenance:

- Every event, imported record, attendee recommendation, value recommendation, readiness item, and accepted action must preserve source labels, source ids, evidence ids, timestamps, and generation method.
- Public evidence chips should show readable source labels and preserve raw evidence ids in `data-evidence-id`; raw provider payloads or fixture-oriented labels should not be used as customer-facing copy.
- The route must not expose raw provider payloads, OAuth tokens, prompts, private notes, or unapproved attendee details.
- Sensitive actions must keep `data-action-evidence`, route state checks, route recovery actions, and `data-side-effects="none"` until a confirmation guard and external action sandbox approve live side effects.
- Live services must not run calendar writes, database writes, email sends, notification delivery, event discovery calls, or AI calls from the page render path.

Replacement tests:

- Page route tests for `/app/events`, `/app/events?scenario=empty`, `/app/events?scenario=pending`, and `/app/events?scenario=failure`.
- Copy regression tests proving public `/app/events` text avoids route, boundary, provider, fixture, live, vector, model, deterministic, database, console, mock, and harness vocabulary while preserving raw evidence ids in data attributes.
- API envelope tests for `GET /api/events`, `GET /api/recommendations/events`, attendee recommendation reads, readiness reads, and accept action envelopes.
- Factory tests proving `mock`, `hybrid`, and `live` resolution selects registered constructors and returns controlled failures for unavailable live services.
- Mapper tests proving live event, recommendation, readiness, and action payloads preserve provenance and evidence.
- Privacy tests proving route copy omits raw provider payloads, credentials, prompts, private notes, and unapproved attendee data.
- Confirmation and sandbox tests before enabling live calendar writes, external messages, notifications, database writes, or production audit writes.

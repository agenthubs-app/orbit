# Compose Demo Event Detail Live Implementation Notes

Sprint 63 composes `/app/events/demo-event-1` from the approved mock-first event detail, attendee roster, recommendation, opening-line, goal/readiness, want-to-connect, encounter note, and post-event review capabilities. The page imports the route adapter and UI primitives only; service construction stays in `event-detail-route-service.ts`.

## Evaluator Evidence Summary

This document covers live service/provider files, switch mechanism, required env vars or permissions, privacy/provenance constraints, replacement tests, route state checks, `data-action-evidence`, and `data-side-effects`. The route state checks are `/app/events/demo-event-1?scenario=empty`, `/app/events/demo-event-1?scenario=pending`, and `/app/events/demo-event-1?scenario=failure`.

The app route uses the event detail record as the canonical event source for visible logistics. Attendee roster, recommendations, readiness, want-to-connect, encounter notes, and post-event review can contribute relationship content and evidence, but their embedded event summaries must be reconciled before the page shows venue or time. Live replacement must preserve this canonical source check so conflicting provider payloads cannot show mixed event logistics to the person preparing for the event. The route also reports the API-evidence view separately: one of the three sprint API evidence surfaces currently carries older event logistics, while four of six composed capability sources require canonical reconciliation.

The product route also exposes a top-level relationship priority before secondary event details. That checkpoint must continue to combine the current route adapter's canonical event logistics, roster context for the confirmed want-to-connect person, record-review summary, model-level API-evidence reconciliation, and want-to-connect action so the participant knows who to meet first without trusting conflicting provider summaries.

The visible page copy intentionally keeps that checkpoint product-facing: it names one first person to meet, keeps venue and time anchored to the event detail record, and phrases stale logistics as records Orbit already resolved before recommendations are shown. Ranked recommendations and generated opening lines remain visible, but the page labels them as secondary when they refer to someone other than the confirmed in-room action target. Technical terms such as route APIs, composed capability sources, and API evidence remain available in the route model and tests for verifier evidence, but live UI should not expose that wording to participants.

## Live Service/Provider Files

The live service/provider files for this route are:

- `features/events/event-crud-and-import/live-service.ts` and `features/events/event-crud-and-import/providers/storage-event-provider.ts` for event detail reads.
- `features/events/attendee-roster/live-service.ts` and `features/events/attendee-roster/storage/generated-attendee-roster-live-record-provider.ts` for attendee roster reads.
- `features/recommendations/live-service.ts` and `features/recommendations/storage/event-recommendation-live-record-provider.ts` for event recommendations and opening lines.
- `features/events/goal-readiness/live-service.ts` and `features/events/goal-readiness/storage/generated-goal-readiness-live-record-provider.ts` for event goal and readiness.
- `features/events/want-connect/live-service.ts` and `features/events/want-connect/storage/generated-want-connect-live-record-provider.ts` for in-room want-to-connect intent.
- `features/events/encounter-note/live-service.ts` and `features/events/encounter-note/storage/generated-encounter-note-live-record-provider.ts` for encounter note preview, typed note capture, and evidence.
- `features/events/post-event-review/live-service.ts` and `features/events/post-event-review/storage/generated-post-event-review-live-record-provider.ts` for post-event contact review.
- `app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service.ts` for app route service resolution.
- `app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-view-model-adapter.ts`
  maps the route success model into the existing event detail UI view model.
- `app/(app)/app/events/[id]/page.tsx` is the real Next route adapter. It
  reads route/search params, calls the route service, and renders either the
  existing event detail UI or a shared state boundary.
- API envelopes remain under `app/api/events/[id]/route.ts`, `app/api/events/[id]/attendees/route.ts`, `app/api/recommendations/event/[id]/route.ts`, `app/api/events/[id]/readiness/route.ts`, `app/api/events/[id]/want-to-connect/route.ts`, `app/api/events/[id]/encounters/route.ts`, and `app/api/events/[id]/post-event/route.ts`.

## Switch Mechanism

- The page calls `loadAppEventDetailRoute`, which resolves services through `createModuleServiceFactory`.
- The actual `/app/events/[id]` page must not call `getOrbitEventDetailViewModel`; it must use `loadAppEventDetailRoute`.
- The dynamic route exports `generateStaticParams()` with `demo-event-1` so the required sprint route is discoverable during build and still reads data through the route adapter.
- `ORBIT_MODULE_MODE` selects `mock`, `hybrid`, or `live`; missing or invalid values fall back to mock mode.
- Live mode is registered at the page factory and passes the requested mode through to each feature-level service factory. Missing storage must return controlled route failure evidence instead of falling back to mock data.
- The page must not branch directly on provider env vars or import source data files.
- The route adapter must keep a canonical event model and source-consistency summary. Live services should map every provider payload to that canonical event id before rendering relationship recommendations, notes, or post-event drafts.

## Required Env Vars Or Permissions

The route uses the shared live database configuration read by the feature
providers. `ORBIT_MODULE_MODE` selects `mock`, `hybrid`, or `live` service
resolution. For remote Postgres-backed live mode, configure
`ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`;
missing configuration must fail visibly with live-store evidence.

- Live event detail and attendee roster require event store access plus organizer roster permission.
- Live recommendations and opening lines require approved attendee evidence and any ranking or generation provider credentials.
- Live readiness requires event goal write permission and calendar conflict permission.
- Live want-to-connect requires explicit user confirmation before presence, peer notification, messaging, or persistence can run.
- Live encounter notes require note storage permission and, if voice capture is enabled later, device microphone and upload permission.
- Live post-event review requires contact draft persistence permission and follow-up confirmation permission.

## Privacy/Provenance Constraints

- Every event, attendee, recommendation, opening line, readiness item, want-to-connect intent, encounter note, and post-event review contact must preserve evidence ids, source labels, timestamps, and generation method.
- Visible event venue and time must come from the canonical event detail source. If a live roster, recommendation, note, or post-event provider returns conflicting logistics, the route must surface a controlled reconciliation state instead of showing mixed venue or time details.
- The page may show readable source labels and evidence chips, but must not expose raw provider payloads, private roster fields, OAuth tokens, prompts, or unapproved attendee data.
- Sensitive actions stay guarded by `data-action-evidence`. Want-to-connect may record a storage-only live intent; external presence, peer notification, external message, notification delivery, calendar write, contact write, AI provider, and external network side effects remain disallowed from the render path.
- Live services must not send messages, notify peers, write calendars, write contacts, run AI providers, or call external networks from the render path.

## Replacement Tests

- Page route tests for `/app/events/demo-event-1`, `/app/events/demo-event-1?scenario=empty`, `/app/events/demo-event-1?scenario=pending`, and `/app/events/demo-event-1?scenario=failure`.
- Route state checks proving the route renders empty, pending, and failure through `data-state-boundary="app-event-detail-route-state-view"`.
- API envelope tests for `GET /api/events/demo-event-1`, `GET /api/events/demo-event-1/attendees`, and `GET /api/recommendations/event/demo-event-1`.
- Canonical source tests proving `/app/events/demo-event-1` renders one visible venue/time from the event detail source, records reconciliation evidence for any provider payload with different logistics, and separately reports the one-of-three API evidence contradiction collected by the sprint probes.
- Top-level relationship priority tests proving the first product checkpoint names the confirmed want-to-connect person, repeats canonical event logistics, states the API-evidence reconciliation summary, and appears before secondary source-consistency details.
- Product-language route tests proving the rendered priority says one person is first, avoids route/API/capability jargon, and still preserves the model-level reconciliation counts for verifier evidence.
- Action-coherence route tests proving a different ranked recommendation, such as Mina Park, is framed as the next evidence-backed lead after the confirmed Priya Shah in-room action instead of competing with the primary action.
- Reload-after-action and repeated-click persistence tests proving the want-to-connect result remains stable across repeated renders and reports storage-only live intent writes without presence, peer notification, external message, notification delivery, or external network requests.
- Factory tests proving mock, hybrid, and live service resolution selects registered constructors and reports controlled failures when live implementations are unavailable.
- Mapper tests proving live event, attendee, recommendation, opening-line, readiness, want-to-connect, encounter, and post-event payloads preserve provenance and evidence ids.
- Privacy tests proving route copy avoids raw provider payloads, private notes, credentials, prompts, and unapproved attendee fields.
- Confirmation and sandbox tests before enabling live presence, peer notifications, external messages, calendar writes, contact persistence, or production audit writes.

## Verified Live Behavior

- `tests/pages/app-event-detail-live-route-services.test.ts` proves live route service resolution reaches child services instead of failing at the page factory with `NOT_IMPLEMENTED`.
- The same test proves the real `/app/events/[id]` page calls the live route
  service, avoids the legacy event detail view model, and renders live-store
  failure evidence when storage is unconfigured.
- `features/events/encounter-note/live-service.ts` returns read-only encounter-note preview data when `noteText` is absent, so loading the event detail route does not write notes.
- The route derives its default want-to-connect target from the live match payload before falling back to the legacy demo contact.
- `buildWantConnectActionResult()` allows storage-only live intent writes and still suppresses results if presence, peer notification, external message, notification provider, or external network flags appear.
- Remote smoke with `ORBIT_MODULE_MODE=live` loaded `event_01` with 50 attendees, three recommendations, two post-event contact drafts, one want-connect match, and a storage-only want-connect action result for `曾伟`.
- Remote page smoke rendered `/app/events/event_01?mode=live` with
  `hasRemoteTitle=true`, `hasOldDemoTitle=false`, `hasFailure=false`, and
  `hasDetailPage=true`.

# Compose Demo Event Detail Live Implementation Notes

Sprint 63 composes `/app/events/demo-event-1` from the approved mock-first event detail, attendee roster, recommendation, opening-line, goal/readiness, want-to-connect, encounter note, and post-event review capabilities. The page imports the route adapter and UI primitives only; service construction stays in `event-detail-route-service.ts`.

## Evaluator Evidence Summary

This document covers live service/provider files, switch mechanism, required env vars or permissions, privacy/provenance constraints, replacement tests, route state checks, `data-action-evidence`, and `data-side-effects`. The route state checks are `/app/events/demo-event-1?scenario=empty`, `/app/events/demo-event-1?scenario=pending`, and `/app/events/demo-event-1?scenario=failure`.

The app route uses the event detail record as the canonical event source for visible logistics. Attendee roster, recommendations, readiness, want-to-connect, encounter notes, and post-event review can contribute relationship content and evidence, but their embedded event summaries must be reconciled before the page shows venue or time. Live replacement must preserve this canonical source check so conflicting provider payloads cannot show mixed event logistics to the person preparing for the event. The route also reports the API-evidence view separately: one of the three sprint API evidence surfaces currently carries older event logistics, while four of six composed capability sources require canonical reconciliation.

The product route also exposes a top-level relationship priority before secondary event details. That checkpoint must continue to combine the current route adapter's canonical event logistics, roster context for the confirmed want-to-connect person, record-review summary, model-level API-evidence reconciliation, and want-to-connect action so the participant knows who to meet first without trusting conflicting provider summaries.

The visible page copy intentionally keeps that checkpoint product-facing: it names one first person to meet, keeps venue and time anchored to the event detail record, and phrases stale logistics as records Orbit already resolved before recommendations are shown. Ranked recommendations and generated opening lines remain visible, but the page labels them as secondary when they refer to someone other than the confirmed in-room action target. Technical terms such as route APIs, composed capability sources, and API evidence remain available in the route model and tests for verifier evidence, but live UI should not expose that wording to participants.

## Live Service/Provider Files

The live service/provider files for this route are:

- `features/events/service.ts`, `features/events/contract.ts`, and future `features/events/live-service.ts` for event detail reads.
- `features/events/attendee-contract.ts`, `features/events/service-factory.ts`, and future `features/events/live-attendee-service.ts` for attendee roster reads.
- `features/recommendations/service.ts`, `features/recommendations/contract.ts`, and future `features/recommendations/live-service.ts` for event recommendations and opening lines.
- `features/events/goal-contract.ts` and future `features/events/live-goal-service.ts` for event goal and readiness.
- `features/events/want-connect-contract.ts` and future `features/events/live-want-connect-service.ts` for in-room want-to-connect intent.
- `features/events/encounter-contract.ts` and future `features/events/live-encounter-service.ts` for encounter note capture and evidence.
- `features/events/post-event-contract.ts` and future `features/events/live-post-event-service.ts` for post-event contact review.
- `app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service.ts` for app route service resolution.
- API envelopes remain under `app/api/events/[id]/route.ts`, `app/api/events/[id]/attendees/route.ts`, `app/api/recommendations/event/[id]/route.ts`, `app/api/events/[id]/readiness/route.ts`, `app/api/events/[id]/want-to-connect/route.ts`, `app/api/events/[id]/encounters/route.ts`, and `app/api/events/[id]/post-event/route.ts`.

## Switch Mechanism

- The page calls `loadAppEventDetailRoute`, which resolves services through `createModuleServiceFactory`.
- The dynamic route exports `generateStaticParams()` with `demo-event-1` so the required sprint route is discoverable during build and still reads data through the route adapter.
- `ORBIT_MODULE_MODE` selects `mock`, `hybrid`, or `live`; missing or invalid values fall back to mock mode.
- Live mode must remain unavailable until every live constructor above is registered and returns typed API-envelope failures when configuration is incomplete.
- The page must not branch directly on provider env vars or import source data files.
- The route adapter must keep a canonical event model and source-consistency summary. Live services should map every provider payload to that canonical event id before rendering relationship recommendations, notes, or post-event drafts.

## Required Env Vars Or Permissions

No live provider env var is consumed by Sprint 63. The mock-first switch still
reserves `ORBIT_MODULE_MODE` for `mock`, `hybrid`, or `live` service
resolution, and future live services must fail with typed API-envelope errors
when their required configuration is absent.

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
- Sensitive actions stay guarded by `data-action-evidence`, `data-action-storage="route-only"`, and `data-side-effects="none"` until confirmation and external action sandbox checks approve live effects.
- Live services must not send messages, notify peers, write calendars, write contacts, run AI providers, or call external networks from the render path.

## Replacement Tests

- Page route tests for `/app/events/demo-event-1`, `/app/events/demo-event-1?scenario=empty`, `/app/events/demo-event-1?scenario=pending`, and `/app/events/demo-event-1?scenario=failure`.
- Route state checks proving the route renders empty, pending, and failure through `data-state-boundary="app-event-detail-route-state-view"`.
- API envelope tests for `GET /api/events/demo-event-1`, `GET /api/events/demo-event-1/attendees`, and `GET /api/recommendations/event/demo-event-1`.
- Canonical source tests proving `/app/events/demo-event-1` renders one visible venue/time from the event detail source, records reconciliation evidence for any provider payload with different logistics, and separately reports the one-of-three API evidence contradiction collected by the sprint probes.
- Top-level relationship priority tests proving the first product checkpoint names the confirmed want-to-connect person, repeats canonical event logistics, states the API-evidence reconciliation summary, and appears before secondary source-consistency details.
- Product-language route tests proving the rendered priority says one person is first, avoids route/API/capability jargon, and still preserves the model-level reconciliation counts for verifier evidence.
- Action-coherence route tests proving a different ranked recommendation, such as Mina Park, is framed as the next evidence-backed lead after the confirmed Priya Shah in-room action instead of competing with the primary action.
- Reload-after-action and repeated-click persistence tests proving the want-to-connect result remains stable across repeated renders and continues to report `data-action-storage="route-only"` and `data-side-effects="none"` with no live database write, presence, peer notification, external message, or external network request.
- Factory tests proving mock, hybrid, and live service resolution selects registered constructors and reports controlled failures when live implementations are unavailable.
- Mapper tests proving live event, attendee, recommendation, opening-line, readiness, want-to-connect, encounter, and post-event payloads preserve provenance and evidence ids.
- Privacy tests proving route copy avoids raw provider payloads, private notes, credentials, prompts, and unapproved attendee fields.
- Confirmation and sandbox tests before enabling live presence, peer notifications, external messages, calendar writes, contact persistence, or production audit writes.

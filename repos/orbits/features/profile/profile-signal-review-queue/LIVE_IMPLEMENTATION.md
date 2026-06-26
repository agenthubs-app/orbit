# Profile Signal Review Queue Live Implementation

## Live Service And Provider Files

- Keep `features/profile/signal-contract.ts` as the shared DTO and error-code contract for profile update suggestions from chat, activity, and contact signals.
- Keep `features/profile/mock-signal-service.ts` as the deterministic mock boundary used by tests, dev routes, and demos.
- Add a live service beside the mock service, for example `features/profile/live-signal-service.ts`, that implements the same `ProfileSignalReviewQueueService` interface.
- Add provider adapters under this capability folder, for example `features/profile/profile-signal-review-queue/providers/chat-signal-provider.ts`, `activity-signal-provider.ts`, and `contact-signal-provider.ts`.
- The route handlers `app/api/profile/update-suggestions/route.ts` and `app/api/profile/update-suggestions/[id]/accept/route.ts` must continue to return the shared API envelope.

## Switch Mechanism

- Route handlers should resolve a service through the existing feature-mode pattern.
- `mock` mode must keep using `createMockProfileSignalReviewQueueService()`.
- `hybrid` mode may run the mock service while logging that live profile signal review is unavailable.
- `live` mode may call the live service only after provider adapters, replacement tests, and privacy review exist.
- The switch must stay explicit. Pages and route handlers should not import chat, activity, contact, AI, database, calendar, email, or notification adapters directly.

## Required Env Vars And Permissions

- `ORBIT_PROFILE_SIGNAL_PROVIDER` identifies the live signal analysis adapter.
- `ORBIT_CHAT_SIGNAL_PROVIDER` identifies the chat summary source when chat suggestions become live.
- `ORBIT_ACTIVITY_SIGNAL_PROVIDER` identifies the activity or event history source.
- `ORBIT_CONTACT_SIGNAL_PROVIDER` identifies the contact graph source.
- `ORBIT_PROFILE_SIGNAL_API_KEY` or provider-specific credentials must stay outside source control.
- Live chat analysis requires explicit permission to use message summaries as profile evidence.
- Live activity analysis requires explicit permission to read event or relationship activity.
- Live contact analysis requires explicit permission to inspect contact records and source evidence.

## Privacy And Provenance Constraints

- Every suggestion must preserve source and evidence provenance, including source type, source record id, evidence excerpt, collection time, provider name, and confidence.
- Live services must never mutate profile fields automatically from AI, chat, calendar, email, activity, or contact analysis. They return review suggestions and accepted patches only.
- Accepted patches must still require an operator-confirmed profile save before persistence.
- Sensitive source excerpts must be scoped to the review queue and omitted from failure envelopes.
- Failures must return controlled API envelopes and must not expose provider errors, secrets, private messages, calendar data, email content, notification payloads, or database internals.
- Replacement code must preserve source and evidence provenance for every suggestion and accepted profile patch.

## Developer Evidence Surface

- `/dev/capabilities/profile-signal-review-queue` must continue to render success, empty, pending, and controlled failure states from the mock service only.
- The source review rehearsal on that page must show the evidence excerpt, accepted patch, and operator-confirmed save guard without mutating profile state.
- The page should keep listing direct route probes for the review queue, accept route, empty scenario, pending scenario, and controlled failure scenario.
- The handoff panel should keep surfacing provider file expectations, the feature-mode switch, `ORBIT_PROFILE_SIGNAL_PROVIDER`, privacy constraints, and replacement-test obligations.

## Replacement Tests

- Keep `tests/capabilities/profile-signal-review-queue.test.ts` as the mock boundary test.
- Add live-service contract tests that assert the live implementation satisfies `ProfileSignalReviewQueueService`.
- Add route tests for `app/api/profile/update-suggestions/route.ts` and `app/api/profile/update-suggestions/[id]/accept/route.ts` in mock, hybrid, and live modes.
- Add provider adapter tests with chat, activity, and contact fixtures and no real network access by default.
- Add privacy tests that confirm raw source content, provider errors, secrets, and private profile data are not returned in API envelopes.
- Add replacement tests proving live suggestions preserve source and evidence provenance and never write directly to profile fields before confirmation.

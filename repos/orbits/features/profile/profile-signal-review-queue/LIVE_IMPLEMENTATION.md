# Profile Signal Review Queue Live Implementation

This capability now supports deterministic mock mode and remote live mode. Live
mode reads generated relationship records from shared live storage and derives
review-only profile update suggestions with rule-based logic. It does not call
an AI provider and it does not write profile fields.

## Live Service And Provider Files

- Keep `features/profile/signal-contract.ts` as the shared DTO and error-code contract for profile update suggestions from chat, activity, and contact signals.
- Keep `features/profile/mock-signal-service.ts` as the deterministic mock boundary used by tests, dev routes, and demos.
- Keep the live service beside the mock service at `features/profile/live-signal-service.ts`. It implements the same async-compatible `ProfileSignalReviewQueueService` interface.
- Keep the live storage adapter at `features/profile/storage/profile-signal-live-record-provider.ts`.
- The live provider reads generated `profiles`, `contacts`, `connections`, `messages`, `interactionMemories`, and `evidence` records from shared `orbit_records`.
- The route handlers `app/api/profile/update-suggestions/route.ts` and `app/api/profile/update-suggestions/[id]/accept/route.ts` must continue to return the shared API envelope.

## Switch Mechanism

- Route handlers should resolve a service through the existing feature-mode pattern.
- `mock` mode must keep using `createMockProfileSignalReviewQueueService()`.
- `hybrid` mode may run the mock service while logging that live profile signal review is unavailable.
- `live` mode uses `createLiveProfileSignalReviewQueueService()` with the configured shared live record store. It fails closed with `PROFILE_SIGNAL_LIVE_STORE_UNCONFIGURED` when no database URL is configured.
- The switch must stay explicit. Pages and route handlers should not import chat, activity, contact, AI, database, calendar, email, or notification adapters directly.

## Required Env Vars And Permissions

- Current shared live storage uses `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID` selects the workspace partition, defaulting to `orbit-dev` for local development.
- `ORBIT_PROFILE_SIGNAL_PROVIDER` is reserved for a future external signal analysis adapter.
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
- Keep `tests/capabilities/profile-signal-review-live-store.test.ts` as the live provider/service replacement test.
- Add broader route tests for hybrid/live page rendering if the app profile page is later moved from mock SSR composition to live SSR composition.
- Add provider adapter tests with external chat, activity, and contact fixtures if `ORBIT_PROFILE_SIGNAL_PROVIDER` starts selecting an external provider.
- Keep privacy tests confirming raw provider errors, secrets, private messages, calendar data, email content, notification payloads, and database internals are not returned in API envelopes.
- Keep replacement tests proving live suggestions preserve source and evidence provenance and never write directly to profile fields before confirmation.

Current evidence:

- `tests/capabilities/profile-signal-review-live-store.test.ts` proves the live service derives chat, activity, and contact suggestions from generated live records, returns accepted patches, and does not mutate the profile record.
- Remote validation for `/api/profile/update-suggestions` and `/api/profile/update-suggestions/[id]/accept` returned `x-orbit-feature-mode: live` and accepted patch fields without profile writes.

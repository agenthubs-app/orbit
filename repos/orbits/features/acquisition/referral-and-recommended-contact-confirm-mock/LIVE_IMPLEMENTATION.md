# Referral and Recommended Contact Confirm Live Implementation

The live implementation is now registered through
`features/acquisition/service-factory.ts` and implemented by
`features/acquisition/live-referral-service.ts`.

The storage adapter lives at
`features/acquisition/storage/referral-live-record-provider.ts`. It reads remote
`matchRecommendations`, `networkPeople`, `contacts`, and `evidence` records
from the shared `orbit_records` envelope and maps them into the acquisition
referral contract.

## Switch Mechanism

- `ORBIT_MODULE_MODE=mock` keeps route handlers on
  `features/acquisition/mock-referral-service.ts`.
- `ORBIT_MODULE_MODE=live` routes `/api/contact-drafts/referral` and
  `/api/contact-drafts/recommended/[id]/confirm` to
  `features/acquisition/live-referral-service.ts`.
- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or
  `ORBIT_DATABASE_URL` configures the Postgres/Supabase live record store.
- `ORBIT_WORKSPACE_ID` selects the workspace; the local development workspace is
  usually `workspace:orbit-dev`.

## Current Live Boundary

- Reads live match recommendations and recommender/target people from shared
  storage.
- Maps `warm_intro`, `context_share`, and `event_follow_up` recommendation
  types into acquisition referral source kinds.
- Returns recommended contacts and referral contact drafts with source evidence,
  recommender context, confirmation state, and no-side-effect flags.
- `confirmRecommendedContact()` returns a review-only confirmation preview and
  created evidence DTO.

This first live version does not write `contacts`, does not upsert
`contactDrafts`, does not perform multi-hop social graph discovery, does not
send outreach, does not call AI, does not read devices/email/calendar providers,
and does not deliver notifications.

## Privacy And Provenance Constraints

- Every live response carries `privacy="live-referral-recommendations"`.
- Keep source provenance visible in both recommendation and confirmation
  preview payloads.
- Preserve source id, source label, recommender context, evidence ids, and
  confirmation timestamp.
- Keep `liveDatabaseReadExecuted=true` for successful live reads while
  `databaseWriteExecuted=false`, `externalNetworkRequested=false`,
  `multiHopSocialGraphDiscoveryExecuted=false`, and
  `automaticFriendOfFriendOutreachExecuted=false`.
- Unsupported source filters, missing recommendations, pending review, blocked
  confirmation, unconfigured storage, and live provider failures must return
  visible API failure envelopes.

## Tests

- `tests/capabilities/referral-recommendation-live-store.test.ts` proves live
  recommendation mapping, confirmation preview behavior, unconfigured
  fail-closed behavior, factory registration, and API live-mode failure
  envelopes.
- `tests/capabilities/referral-and-recommended-contact-confirm-mock.test.ts`
  keeps the deterministic mock contract, API envelopes, debug panel, and
  no-provider-call constraints covered.
- Future outreach or contact writers need separate tests proving confirmation
  guard integration, audit persistence, rollback behavior, and source evidence
  retention before they can be enabled.

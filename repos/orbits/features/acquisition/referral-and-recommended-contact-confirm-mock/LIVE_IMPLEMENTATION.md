# Referral and Recommended Contact Confirm Live Implementation

## Live Service and Provider Files

- Keep `features/acquisition/referral-contract.ts` as the shared DTO and API contract.
- Keep `features/acquisition/mock-referral-service.ts` as the deterministic mock provider for local and harness runs.
- Add `features/acquisition/referral-and-recommended-contact-confirm-mock/live-service.ts` for the live `ReferralRecommendationService` implementation.
- Add provider adapters under `features/acquisition/referral-and-recommended-contact-confirm-mock/providers/` for approved referral source systems.
- Keep API routes at `app/api/contact-drafts/referral/route.ts` and `app/api/contact-drafts/recommended/[id]/confirm/route.ts`; they should select a service and keep returning the shared API envelope.

## Switch Mechanism

- Use `ORBIT_REFERRAL_RECOMMENDATION_PROVIDER=mock` as the default.
- Use `ORBIT_REFERRAL_RECOMMENDATION_PROVIDER=live` only after the live service, provider adapters, permissions, audit, and replacement tests are ready.
- The route handlers should call a service factory that returns `createMockReferralRecommendationService()` in mock mode and the live service in live mode.
- The dev capability page remains a probe surface and must not own referral matching logic.

## Required Env Vars and Permissions

- `ORBIT_REFERRAL_RECOMMENDATION_PROVIDER` selects `mock` or `live`.
- Live providers need explicit user-authorized access to referral source records.
- Live providers need permission to read recommender context and provenance fields.
- Live confirmation needs an authenticated actor id and an auditable user confirmation event.
- Live contact writes and outbound intro actions must remain disabled until a separate confirmation guard approves them.

## Privacy and Provenance Constraints

- Every referral source must preserve source id, source label, recommender context, evidence ids, and collection time.
- Do not infer friend-of-friend paths from broad social graphs without explicit source consent and product approval.
- Do not send automatic outreach when a recommendation is confirmed; confirmation only promotes a recommended contact into the next reviewed workflow.
- Preserve `privacy`, `generationMethod`, and execution flags so reviewers can see whether graph discovery, outreach, provider access, persistence, AI, or notifications ran.
- Do not store message bodies, private notes, or unrelated network data unless the live provider contract is expanded and reviewed.

## Replacement Tests

- Add service tests for live referral source filtering, empty state, pending provider state, provider failure, and unsupported source failures.
- Add route tests proving `/api/contact-drafts/referral` returns stable envelopes and the correct status codes for success, empty, pending, and failure.
- Add route tests proving `/api/contact-drafts/recommended/[id]/confirm` returns confirmed, blocked, pending, missing recommendation, and provider failure envelopes.
- Add privacy/provenance tests that prove live records keep referral source, recommender context, user confirmation, evidence ids, and execution flags.
- Add integration tests proving live confirmation does not write contacts, send messages, trigger notifications, or enqueue external actions without the separate confirmation guard.

# Manual contact creation mock live replacement

## Live service and provider files

- Keep `features/acquisition/manual-contract.ts` as the typed contract for manual source, note, tags, follow-up hint, provenance, duplicate lookup status, confirmation, and API result shapes.
- Keep `features/acquisition/mock-manual-service.ts` as the deterministic mock implementation for Milestone C and test fixtures.
- Add `features/acquisition/manual-contact-creation-mock/live-service.ts` when live persistence and live duplicate lookup are in scope. That file must implement the same `ManualContactCreationService` interface.
- Put provider adapters next to the live service, for example `features/acquisition/manual-contact-creation-mock/providers/contact-store-provider.ts` and `features/acquisition/manual-contact-creation-mock/providers/duplicate-lookup-provider.ts`.
- Keep `app/api/contact-drafts/manual/route.ts` and `app/api/contact-drafts/[id]/confirm/route.ts` as thin route handlers that call the service interface and return the shared API envelope.

Live handoff evidence excerpts:

- Live provider files live under `features/acquisition/manual-contact-creation-mock/`.
- `ORBIT_MANUAL_CONTACT_PROVIDER` switches from mock to live.
- Manual notes, tags, and follow-up hints preserve source evidence.
- Replacement tests cover create, confirm, validation, empty, and provider failure paths.

## Switch mechanism

Milestone C always calls `createMockManualContactCreationService()` from the manual route, confirm route, and debug review surface. The live switch should introduce a small factory that resolves mock or live mode from the existing feature-mode boundary and from `ORBIT_MANUAL_CONTACT_PROVIDER`.

Mock mode remains the default. Live mode must fail closed with an API envelope if the provider is missing, misconfigured, or unavailable. The debug review surface at `/dev/capabilities/manual-contact-creation-mock` must keep rendering success, empty, pending, and failure states for the selected service mode.

## Required env vars and permissions

- `ORBIT_FEATURE_MODE=live` enables live service resolution only after replacement tests exist.
- `ORBIT_MANUAL_CONTACT_PROVIDER` selects the live manual contact provider.
- `ORBIT_CONTACT_STORE_URL` points to the contact store endpoint or adapter target.
- `ORBIT_DUPLICATE_LOOKUP_PROVIDER` selects the duplicate lookup adapter.
- `ORBIT_CONTACT_STORE_WRITE_SCOPE` must allow draft-to-contact writes only after explicit confirmation.

No live provider may request calendar, email, notification, camera, OCR, or AI permissions for this manual-contact boundary. Those capabilities have separate mock boundaries and must not be pulled into manual contact creation.

## Privacy and provenance constraints

Manual notes, tags, and follow-up hints preserve source evidence. A live implementation must carry the source reference, evidence ids, collection timestamp, operator confirmation, and duplicate lookup result into every contact candidate. Raw provider errors must never escape the shared API envelope.

The route must not write a contact during initial draft creation. The write path can run only after explicit confirmation through `app/api/contact-drafts/[id]/confirm/route.ts`, and the confirmed candidate must still state whether `contactWriteExecuted` and `duplicateLookupExecuted` happened.

## Replacement tests

- Replace the mock-only expectations in `tests/capabilities/manual-contact-creation-mock.test.ts` with factory-mode tests proving mock mode remains deterministic.
- Add live-mode route tests for `app/api/contact-drafts/manual/route.ts` covering create, validation, empty, and provider failure paths.
- Add live-mode confirmation tests for `app/api/contact-drafts/[id]/confirm/route.ts` proving explicit confirmation precedes the contact write.
- Add duplicate lookup tests proving possible matches are surfaced without dropping manual source evidence.
- Add debug route tests proving the Debug review surface still renders success, empty, pending, and failure states in live mode.

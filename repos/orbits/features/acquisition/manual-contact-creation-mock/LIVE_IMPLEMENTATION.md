# Manual contact creation mock live replacement

## Live service and provider files

- Keep `features/acquisition/manual-contract.ts` as the typed contract for manual source, note, tags, follow-up hint, provenance, duplicate lookup status, confirmation, and API result shapes.
- Keep `features/acquisition/mock-manual-service.ts` as the deterministic mock implementation for Milestone C and test fixtures.
- Use `features/acquisition/live-manual-service.ts` for live mode. It implements the same `ManualContactCreationService` interface and stages manual drafts into the shared contact draft queue.
- Reuse `features/acquisition/storage/contact-draft-live-record-provider.ts` as the storage boundary. Manual live creation writes a central `contactDrafts` payload with manual note, tags, and follow-up hint metadata.
- Keep `app/api/contact-drafts/manual/route.ts` and `app/api/contact-drafts/[id]/confirm/route.ts` as thin route handlers that call the service interface and return the shared API envelope.

Live handoff evidence excerpts:

- Live manual service lives in `features/acquisition/live-manual-service.ts`.
- `ORBIT_MODULE_MODE=live` switches manual creation from mock to live storage.
- Manual drafts are stored as central `contactDrafts` payloads with note, tags, and follow-up hints.
- Replacement tests cover create, confirm, validation, empty, and unconfigured live-store paths.

## Switch mechanism

Mock mode calls `createMockManualContactCreationService()` from the manual route, confirm route, and debug review surface. Live mode resolves `createLiveManualContactCreationService()` through `features/acquisition/service-factory.ts`.

Mock mode remains the default. Live mode must fail closed with an API envelope if the live record store is missing, misconfigured, or unavailable. The debug review surface at `/dev/capabilities/manual-contact-creation-mock` remains a deterministic mock review surface; live behavior is covered by route, service, storage, and factory tests.

## Required env vars and permissions

- `ORBIT_MODULE_MODE=live` enables live service resolution after replacement tests exist.
- `ORBIT_EVENT_DATABASE_URL` provides the Postgres connection string for the shared live record store.
- `ORBIT_WORKSPACE_ID` scopes manual draft reads and writes to one Orbit workspace.
- No manual-specific external provider, contact-store endpoint, duplicate lookup provider, OCR, QR, email, calendar, notification, or AI credential is required for this first live boundary.

No live provider may request calendar, email, notification, camera, OCR, or AI permissions for this manual-contact boundary. Those capabilities have separate mock boundaries and must not be pulled into manual contact creation.

## Privacy and provenance constraints

Manual notes, tags, and follow-up hints preserve source evidence. The live implementation carries the source reference, evidence ids, collection timestamp, operator confirmation, and duplicate lookup status into every contact candidate. Raw storage errors must never escape the shared API envelope.

The route must not write a contact during initial draft creation. Confirmation through `app/api/contact-drafts/[id]/confirm/route.ts` writes only the confirmed draft back to `contactDrafts`, and the confirmed candidate must still state that `contactWriteExecuted=false` and `duplicateLookupExecuted=false`.

## Replacement tests

- Keep `tests/capabilities/manual-contact-creation-mock.test.ts` for deterministic mock contract and debug-route coverage.
- Keep `tests/capabilities/manual-contact-creation-live-store.test.ts` for live-mode route, storage, factory, unconfigured-store, create, confirm, validation, and no-contact-write coverage.
- Live confirmation tests must prove explicit confirmation writes only `contactDrafts` and leaves `contacts` unchanged.
- Duplicate lookup remains explicitly not executed in this first live boundary; future duplicate provider tests must preserve manual source evidence.

# Contact Acquisition Draft Pipeline Live Implementation

## Live service and provider files

- Keep `features/acquisition/contract.ts` as the DTO and error-code boundary for source-aware contact drafts, confirmation state, and created evidence.
- Keep `features/acquisition/service.ts` as the service interface and API failure mapping boundary.
- Keep `features/acquisition/mock-service.ts` as the deterministic local implementation for mock mode.
- Use `features/acquisition/live-service.ts` for live mode. It satisfies the same `ContactAcquisitionDraftService` interface and maps storage graph records into the acquisition contract.
- Use `features/acquisition/storage/contact-draft-live-record-provider.ts` as the storage-backed live provider. It reads `contactDrafts`, `events`, `attendees`, `eventParticipantIntents`, `networkPeople`, and `evidence`.
- Keep `app/api/contact-drafts/route.ts` and `app/api/contact-drafts/[id]/confirm/route.ts` as thin route handlers that call the service interface and return the shared API envelope.

## Switch mechanism

- `ORBIT_MODULE_MODE=mock` resolves to `createMockContactAcquisitionDraftService`.
- `ORBIT_MODULE_MODE=live` resolves to `createLiveContactAcquisitionDraftService` through `features/acquisition/service-factory.ts`.
- If `ORBIT_MODULE_MODE` is absent, routes continue to fall back to `ORBIT_FEATURE_MODE`.
- Hybrid mode remains conservative: it may still use mock-facing workbench surfaces, but API routes that pass `hybrid` through the module registry can read live storage when a live implementation is registered.
- The debug review surface at `/dev/capabilities/contact-acquisition-draft-pipeline` remains a deterministic mock review surface. Live behavior is covered by route, service, and storage tests.

## Required env vars and permissions

- `ORBIT_EVENT_DATABASE_URL` provides the Postgres connection string for the shared live record store.
- `ORBIT_WORKSPACE_ID` scopes reads and writes to one Orbit workspace.
- `ORBIT_MODULE_MODE=live` activates live contact draft service selection in API routes.
- No OCR, QR, contacts, email, calendar, or external acquisition provider credentials are required for this first live boundary.
- Future provider-backed child capabilities can add business-card OCR, QR scanning, external contact import, email and calendar signals, and referral intake behind their own adapters and permission checks.
- Camera, contacts, event-data, email, and calendar permissions still need staged authorization before future provider-backed sources can read external data.

## Privacy and provenance constraints

- Every draft must include a `source` reference, at least one evidence id, and a human-readable excerpt before it can appear in the queue.
- Operator confirmation must happen before any contact write. The live confirm route writes only the confirmed draft back to the `contactDrafts` live record collection and returns a contact candidate. The downstream contact service must preserve source and evidence provenance when it later creates a contact.
- Raw OCR images, QR payloads, inbox excerpts, calendar text, and imported attendee files must not be exposed through API failure envelopes.
- Provider errors must be mapped to `CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS` and the shared API envelope.
- Duplicate or merge-suggestion decisions must keep the original acquisition source beside the merged contact record.

## Replacement tests

- Keep `tests/capabilities/contact-acquisition-draft-pipeline.test.ts` for deterministic mock contract and debug-route coverage.
- Keep `tests/capabilities/contact-acquisition-draft-live-store.test.ts` for service-mode tests that prove live mode returns the same envelope shape from storage-backed records.
- Live storage tests must cover explicit stored drafts, event-import drafts derived from attendees, empty state, pending confirmation, controlled provider failure, unconfigured store failure, and no direct contact writes.
- Add API tests for `app/api/contact-drafts/route.ts` and `app/api/contact-drafts/[id]/confirm/route.ts` proving status codes, runtime boundary headers, source and evidence provenance, and operator confirmation behavior.
- Add privacy tests proving provider raw payloads and credentials never appear in success or failure envelopes.
- Add replacement debug-route tests proving the Debug review surface still renders success, empty, pending, and failure states without writing contacts directly.

## Live handoff evidence excerpts

- Storage-backed contact draft live provider lives under `features/acquisition/storage/contact-draft-live-record-provider.ts`.
- `ORBIT_MODULE_MODE=live` gates the live contact draft API path.
- Operator confirmation precedes every contact write.
- Replacement tests cover draft list, confirm, privacy, and debug states.

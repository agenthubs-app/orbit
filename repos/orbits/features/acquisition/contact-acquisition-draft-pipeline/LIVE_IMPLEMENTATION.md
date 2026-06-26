# Contact Acquisition Draft Pipeline Live Implementation

## Live service and provider files

- Keep `features/acquisition/contract.ts` as the DTO and error-code boundary for source-aware contact drafts, confirmation state, and created evidence.
- Keep `features/acquisition/service.ts` as the service interface and API failure mapping boundary.
- Replace `features/acquisition/mock-service.ts` with `features/acquisition/live-service.ts` only after live providers satisfy the same `ContactAcquisitionDraftService` interface.
- Add provider adapters under `features/acquisition/providers/` for business-card OCR, QR scanning, event attendee import, external contacts, email and calendar signals, and referral intake.
- Keep `app/api/contact-drafts/route.ts` and `app/api/contact-drafts/[id]/confirm/route.ts` as thin route handlers that call the service interface and return the shared API envelope.

## Switch mechanism

- Continue resolving mock behavior through `ORBIT_FEATURE_MODE=mock` for Milestone C.
- A future live switch should choose `createMockContactAcquisitionDraftService` in mock mode and a `createLiveContactAcquisitionDraftService` factory in live mode.
- Hybrid mode may combine typed demo fixtures with provider health checks, but it must not write contacts or call provider-backed acquisition sources until replacement tests cover that behavior.
- The debug review surface at `/dev/capabilities/contact-acquisition-draft-pipeline` must continue to show success, empty, pending, and failure states for whichever service mode is active.

## Required env vars and permissions

- `ORBIT_CONTACT_ACQUISITION_PROVIDER` selects the live acquisition provider bundle.
- `ORBIT_BUSINESS_CARD_OCR_PROVIDER` identifies the approved business-card OCR service.
- `ORBIT_QR_SCAN_PROVIDER` identifies the QR scanning capability used by the browser or native shell.
- `ORBIT_EVENT_IMPORT_PROVIDER` identifies the event roster import source.
- `ORBIT_EMAIL_SIGNAL_PROVIDER` and `ORBIT_CALENDAR_SIGNAL_PROVIDER` identify signal providers after staged authorization is granted.
- Camera, contacts, event-data, email, and calendar permissions must be staged and confirmed before any live source is read.

## Privacy and provenance constraints

- Every draft must include a `source` reference, at least one evidence id, and a human-readable excerpt before it can appear in the queue.
- Operator confirmation must happen before any contact write. The live confirm route may return a contact candidate, but the downstream contact service must preserve source and evidence provenance when it creates a contact.
- Raw OCR images, QR payloads, inbox excerpts, calendar text, and imported attendee files must not be exposed through API failure envelopes.
- Provider errors must be mapped to `CONTACT_ACQUISITION_DRAFT_ERROR_DEFINITIONS` and the shared API envelope.
- Duplicate or merge-suggestion decisions must keep the original acquisition source beside the merged contact record.

## Replacement tests

- Replace `tests/capabilities/contact-acquisition-draft-pipeline.test.ts` mock-only assertions with service-mode tests that prove live mode still returns the same envelope shape.
- Add contract tests for `features/acquisition/live-service.ts` covering manual add, business-card OCR, QR scanning, event import, external contacts, email and calendar signals, referrals, empty state, pending confirmation, and controlled provider failure.
- Add API tests for `app/api/contact-drafts/route.ts` and `app/api/contact-drafts/[id]/confirm/route.ts` proving status codes, runtime boundary headers, source and evidence provenance, and operator confirmation behavior.
- Add privacy tests proving provider raw payloads and credentials never appear in success or failure envelopes.
- Add replacement debug-route tests proving the Debug review surface still renders success, empty, pending, and failure states without writing contacts directly.

## Live handoff evidence excerpts

- Provider adapters live under `features/acquisition/providers/`.
- `ORBIT_CONTACT_ACQUISITION_PROVIDER` gates provider-backed acquisition.
- Operator confirmation precedes every contact write.
- Replacement tests cover draft list, confirm, privacy, and debug states.

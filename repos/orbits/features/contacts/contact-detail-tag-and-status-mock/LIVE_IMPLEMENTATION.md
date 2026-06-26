# Contact Detail Tag and Status Mock Live Implementation

## Live service and provider files

- Keep `features/contacts/detail-contract.ts` as the DTO, editable tag, status, note, last interaction metadata, provenance, state, service interface, and error-code boundary.
- Keep `features/contacts/mock-detail-service.ts` as the deterministic Milestone C implementation for contact detail review, tag editing, status changes, note updates, and last interaction metadata.
- Add `features/contacts/contact-detail-tag-and-status-mock/live-service.ts` only after live contact persistence and production audit logging are in scope. That file must implement the same `ContactDetailTagStatusService` interface, including service-owned malformed PATCH body and update-pending failure mappings.
- Add provider adapters under `features/contacts/contact-detail-tag-and-status-mock/providers/`, for example `contact-persistence-provider.ts`, `contact-audit-log-provider.ts`, and `contact-evidence-provider.ts`.
- Keep `app/api/contacts/[id]/route.ts` as a thin route handler that calls the service interface and returns the shared API envelope.

Live handoff evidence excerpts:

- Live provider files live under `features/contacts/contact-detail-tag-and-status-mock/`.
- `ORBIT_CONTACT_DETAIL_PROVIDER` switches from mock to live.
- Live replacement wires a contact persistence service and production audit log behind `ContactDetailTagStatusService`.
- Contact detail keeps tags, status, notes, last interaction metadata, source evidence, and provenance together.
- Replacement tests cover detail read, tag edit, status change, note update, malformed update bodies, empty state, pending state, update-pending conflict, validation, and provider failure paths.

## Switch mechanism

- Continue resolving mock behavior through `ORBIT_FEATURE_MODE=mock` for Milestone C.
- `ORBIT_CONTACT_DETAIL_PROVIDER=mock` keeps `createMockContactDetailTagStatusService()` active.
- `ORBIT_CONTACT_DETAIL_PROVIDER=live` should route the API handler through `live-service.ts` only after live replacement tests exist.
- A small future factory should choose mock or live mode from the existing feature-mode boundary and `ORBIT_CONTACT_DETAIL_PROVIDER`.
- Live mode must fail closed with a shared failure envelope if contact persistence, evidence lookup, or production audit logging is missing, misconfigured, or unavailable.
- `/dev/capabilities/contact-detail-tag-and-status-mock` must continue rendering success, empty, pending, and failure states for the selected service mode.

## Required env vars and permissions

- `ORBIT_FEATURE_MODE=live` enables live service resolution only after replacement tests exist.
- `ORBIT_CONTACT_DETAIL_PROVIDER` selects the live contact detail provider bundle.
- `ORBIT_CONTACTS_DATABASE_URL` or the equivalent managed secret identifies the approved contact persistence service.
- `ORBIT_CONTACT_AUDIT_LOG_STREAM` identifies the production audit log target for tag, status, note, and last interaction edits.
- `ORBIT_CONTACT_EVIDENCE_STORE` identifies the source evidence store used to prove where each contact detail field came from.
- User authorization must prove the user can read and edit the requested workspace contact before any live detail read or write runs.

No live implementation may request OCR, camera, calendar, email, notification, external message sending, or AI permissions for this contact-detail boundary. Those capabilities have separate mock boundaries and must remain separate unless a future sprint changes their contracts.

## Privacy and provenance constraints

- Every live contact detail response must preserve source, evidence ids, relationship context, editable tags, status, notes, last interaction metadata, next-action rationale, and collection timestamp.
- Tag, status, note, and last interaction edits must record who initiated the edit and which source evidence justified the change before a contact persistence write is attempted.
- Production audit log writes must never replace user-visible provenance. The API response still needs explicit evidence ids and privacy-safe summaries.
- API failure envelopes must not expose raw database rows, audit log payloads, credentials, provider request ids, email bodies, calendar text, or private diagnostics.
- Empty, pending, validation, not-found, and provider failure paths must state whether the response came from local rules, live persistence, evidence lookup, or audit logging.

## Replacement tests

- Replace mock-only expectations in `tests/capabilities/contact-detail-tag-and-status-mock.test.ts` with service-mode tests proving mock mode remains deterministic.
- Add contract tests for `features/contacts/contact-detail-tag-and-status-mock/live-service.ts` covering detail read, tag replacement, tag add/remove, status change, note update, last interaction update, malformed PATCH body mapping, empty state, pending state, update-pending conflict, not found, validation, and provider failure.
- Add API tests for `app/api/contacts/[id]/route.ts` proving status codes, runtime boundary headers, source/evidence provenance, privacy-safe errors, malformed PATCH body handling, and stable API envelopes.
- Add audit tests proving a live tag, status, note, or last interaction edit cannot report success unless the contact persistence result and production audit log result are both accounted for.
- Add privacy tests proving raw provider payloads, credentials, audit log internals, private message text, and database diagnostics never appear in success or failure envelopes.
- Add debug-route tests proving the dev capability surface still renders success, empty, pending, and failure states without owning business logic locally.

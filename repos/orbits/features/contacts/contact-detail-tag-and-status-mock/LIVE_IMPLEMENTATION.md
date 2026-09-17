# Contact Detail Tag and Status Mock Live Implementation

## Live service and provider files

- Keep `features/contacts/detail-contract.ts` as the DTO, editable tag, status, note, last interaction metadata, provenance, state, service interface, and error-code boundary.
- Keep `features/contacts/mock-detail-service.ts` as the deterministic Milestone C implementation for contact detail review, tag editing, status changes, note updates, and last interaction metadata.
- `features/contacts/live-detail-service.ts` is the current live read/write implementation. It implements the same `ContactDetailTagStatusService` interface, reads generated `contacts`, `connections`, `evidence`, and actor-scoped detail state from shared live record storage through `features/contacts/storage/contact-live-record-provider.ts`, and returns contact detail DTOs with source/evidence provenance.
- Live detail reads use `readContactGraphForContact` when available, so a
  selected contact detail request fetches the selected contact record and only
  the evidence ids attached to that contact and its related connections. The
  older full `readContactGraph` path remains a compatibility fallback for
  providers that have not implemented focused reads.
- Current live `PATCH` validates and persists actor-scoped tags, notes, last-interaction metadata, and industry fields. Explicit `status` is rejected before any write when any owned Connection exists or the Contact has a pending/ready marker, including mixed requests. Only contacts with neither retain the legacy status write path. Note/tag-only writes preserve existing private status. Successful detail writes report `databaseWriteExecuted: true`; this boundary still reports `productionAuditLogWriteExecuted: false`.
- A unique versioned or ready-marked Connection supplies canonical stages even without a ready marker; either side pending prevents promotion. Version and initialization metadata survive storage decoding. Malformed versions fail closed. Duplicate candidates involving lifecycle metadata conflict; unversioned/unmarked historical fixture contexts remain readable, not canonical stage authorities.
- Add provider adapters under `features/contacts/contact-detail-tag-and-status-mock/providers/`, for example `contact-persistence-provider.ts`, `contact-audit-log-provider.ts`, and `contact-evidence-provider.ts`, only when true contact persistence and production audit logging are in scope.
- Keep `app/api/contacts/[id]/route.ts` as a thin route handler that calls the service interface and returns the shared API envelope.

Live handoff evidence excerpts:

- Current live read files live under `features/contacts/live-detail-service.ts` and `features/contacts/storage/contact-live-record-provider.ts`.
- `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live` routes `contact-detail-tag-status` through the live service factory implementation.
- The live service wires contact industry and actor-scoped detail-state persistence through the storage provider; a production audit log remains a separate future dependency.
- Contact detail keeps tags, status, notes, last interaction metadata, source evidence, and provenance together.
- `tests/capabilities/contact-detail-live-store.test.ts` covers live detail read,
  focused selected-contact evidence reads, actor-scoped persistence, and the
  canonical-stage guard against generated live records.
- Remaining replacement tests cover malformed PATCH body mapping, empty state,
  pending state, validation, provider failure, and future audit failure paths.

## Switch mechanism

- Continue resolving mock behavior through `ORBIT_FEATURE_MODE=mock` for Milestone C.
- `createMockContactDetailTagStatusService()` remains active in mock mode.
- `createLiveContactDetailTagStatusService()` is active in live mode through `features/contacts/service-factory.ts`.
- Live read mode fails closed with `CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED` if no live record store is configured.
- Future live write mode must fail closed with a shared failure envelope if contact persistence, evidence lookup, or production audit logging is missing, misconfigured, or unavailable.
- `/dev/capabilities/contact-detail-tag-and-status-mock` must continue rendering success, empty, pending, and failure states for the selected service mode.

## Required env vars and permissions

- `ORBIT_FEATURE_MODE=live` enables live service resolution only after replacement tests exist.
- `ORBIT_MODULE_MODE=live` also enables live service resolution for module factories that inherit the shared module mode.
- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL` identifies the shared live record store used by the current live read implementation.
- `ORBIT_CONTACTS_DATABASE_URL` or the equivalent managed secret is reserved for the future approved contact persistence service.
- `ORBIT_CONTACT_AUDIT_LOG_STREAM` is reserved for the future production audit log target for tag, status, note, and last interaction edits.
- `ORBIT_CONTACT_EVIDENCE_STORE` is reserved for a future dedicated source evidence store if shared live record evidence is not enough.
- User authorization must prove the user can read and edit the requested workspace contact before any live detail read or write runs.

No live implementation may request OCR, camera, calendar, email, notification, external message sending, or AI permissions for this contact-detail boundary. Those capabilities have separate mock boundaries and must remain separate unless a future sprint changes their contracts.

## Privacy and provenance constraints

- Every live contact detail response must preserve source, evidence ids, relationship context, editable tags, status, notes, last interaction metadata, next-action rationale, and collection timestamp.
- Current live tag, note, last interaction, and industry edits persist through the actor-scoped provider; canonical status changes are lifecycle-only, while ordinary legacy status edits persist to detail state. Production audit logging is still not executed by this boundary.
- Persisted live edits must continue recording the actor boundary and source/evidence provenance before a contact persistence write is attempted.
- Production audit log writes must never replace user-visible provenance. The API response still needs explicit evidence ids and privacy-safe summaries.
- API failure envelopes must not expose raw database rows, audit log payloads, credentials, provider request ids, email bodies, calendar text, or private diagnostics.
- Empty, pending, validation, not-found, and provider failure paths must state whether the response came from local rules, live persistence, evidence lookup, or audit logging.

## Replacement tests

- Replace mock-only expectations in `tests/capabilities/contact-detail-tag-and-status-mock.test.ts` with service-mode tests proving mock mode remains deterministic.
- Keep `tests/capabilities/contact-detail-live-store.test.ts` proving current live reads, persisted detail updates, legacy compatibility, and canonical lifecycle-only status changes against shared live storage.
- Add contract tests for remaining persisted live boundaries covering tag replacement, tag add/remove, canonical status conflict, legacy status change, note update, last interaction update, malformed PATCH body mapping, empty state, pending state, update-pending conflict, not found, validation, and provider failure.
- Add API tests for `app/api/contacts/[id]/route.ts` proving status codes, runtime boundary headers, source/evidence provenance, privacy-safe errors, malformed PATCH body handling, and stable API envelopes.
- Add audit tests proving a live tag, status, note, or last interaction edit cannot report success unless the contact persistence result and production audit log result are both accounted for.
- Add privacy tests proving raw provider payloads, credentials, audit log internals, private message text, and database diagnostics never appear in success or failure envelopes.
- Add debug-route tests proving the dev capability surface still renders success, empty, pending, and failure states without owning business logic locally.

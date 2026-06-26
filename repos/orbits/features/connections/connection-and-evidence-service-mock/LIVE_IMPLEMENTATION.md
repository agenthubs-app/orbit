# Connection and Evidence Service Mock Live Implementation

## Live service and provider files

- Keep `features/connections/contract.ts` as the DTO, source-link, evidence timeline, connection record, add-evidence, provenance, state, and error-code boundary.
- Keep `features/connections/service.ts` as the service interface and API failure-context adapter for route handlers.
- Keep `features/connections/mock-service.ts` as the deterministic Milestone C implementation for connection list, connection detail, source links, evidence timeline, and add-evidence behavior.
- Add `features/connections/connection-and-evidence-service-mock/live-service.ts` only after live connection persistence and evidence storage are in scope. That file must implement the same `ConnectionEvidenceService` interface, including service-owned malformed add-evidence body and add-pending failure mappings.
- Add provider adapters under `features/connections/connection-and-evidence-service-mock/providers/`, for example `connection-persistence-provider.ts`, `connection-evidence-store-provider.ts`, and `connection-audit-log-provider.ts`.
- Keep `app/api/connections/route.ts`, `app/api/connections/[id]/route.ts`, and `app/api/connections/[id]/evidence/route.ts` as thin route handlers that call the service interface and return the shared API envelope.

Live handoff evidence excerpts:

- Live provider files live under `features/connections/connection-and-evidence-service-mock/`.
- `ORBIT_CONNECTION_EVIDENCE_PROVIDER` switches from mock to live.
- Live replacement wires a connection persistence service and evidence store behind `ConnectionEvidenceService`.
- Connection detail keeps source links, evidence timeline, relationship reason, next action, and provenance together.
- Replacement tests cover list, detail, add-evidence, malformed add-evidence bodies, empty state, pending state, validation, not-found, and provider failure paths.

## Switch mechanism

- Continue resolving mock behavior through `ORBIT_FEATURE_MODE=mock` for Milestone C.
- `ORBIT_CONNECTION_EVIDENCE_PROVIDER=mock` keeps `createMockConnectionEvidenceService()` active.
- `ORBIT_CONNECTION_EVIDENCE_PROVIDER=live` should route API handlers through `live-service.ts` only after live replacement tests exist.
- A small future factory should choose mock or live mode from the existing feature-mode boundary and `ORBIT_CONNECTION_EVIDENCE_PROVIDER`.
- Live mode must fail closed with a shared failure envelope if connection persistence, evidence lookup, evidence write, or production audit logging is missing, misconfigured, or unavailable.
- `/dev/capabilities/connection-and-evidence-service-mock` must continue rendering success, empty, pending, and failure states for the selected service mode.

## Required env vars and permissions

- `ORBIT_FEATURE_MODE=live` enables live service resolution only after replacement tests exist.
- `ORBIT_CONNECTION_EVIDENCE_PROVIDER` selects the live connection and evidence provider bundle.
- `ORBIT_CONNECTIONS_DATABASE_URL` or the equivalent managed secret identifies the approved connection persistence service.
- `ORBIT_CONNECTION_EVIDENCE_STORE` identifies the evidence store used to read and add source-linked evidence timeline items.
- `ORBIT_CONNECTION_AUDIT_LOG_STREAM` identifies the production audit log target for evidence additions and relationship-context changes.
- User authorization must prove the user can read the requested workspace connection before any live detail read runs.
- User authorization must prove the user can add evidence to the requested workspace connection before any live evidence write or audit log write runs.

No live implementation may request OCR, camera, external message sending, notification delivery, AI provider access, calendar ingestion, or email ingestion for this connection evidence boundary. Those capabilities have separate mock boundaries and must remain separate unless a future sprint changes their contracts.

## Privacy and provenance constraints

- Every live connection response must preserve connection id, contact id, relationship reason, relationship stage, source links, evidence timeline ids, next action, collection timestamp, and privacy-safe provenance.
- Every live add-evidence response must record who initiated the addition, which source link produced the evidence, which connection received the evidence, and whether persistence and audit logging both completed.
- Production audit log writes must never replace user-visible provenance. The API response still needs explicit evidence ids and privacy-safe source labels.
- API failure envelopes must not expose raw database rows, evidence store payloads, credentials, provider request ids, email bodies, calendar text, audit log internals, or private diagnostics.
- Empty, pending, validation, not-found, malformed body, and provider failure paths must state whether the response came from local rules, live persistence, evidence lookup, evidence write, or audit logging.
- Live providers must not infer relationship context with AI unless a future AI provider provenance sprint explicitly authorizes that behavior and adds replacement tests.

## Replacement tests

- Replace mock-only expectations in `tests/capabilities/connection-and-evidence-service-mock.test.ts` with service-mode tests proving mock mode remains deterministic.
- Add contract tests for `features/connections/connection-and-evidence-service-mock/live-service.ts` covering connection list, connection detail, source link mapping, evidence timeline ordering, add-evidence, malformed add-evidence body mapping, empty state, pending state, add-pending conflict, not found, validation, and provider failure.
- Add API tests for `app/api/connections/route.ts`, `app/api/connections/[id]/route.ts`, and `app/api/connections/[id]/evidence/route.ts` proving status codes, runtime boundary headers, source/evidence provenance, privacy-safe errors, malformed body handling, and stable API envelopes.
- Add audit tests proving a live evidence addition cannot report success unless the connection persistence result, evidence store result, and production audit log result are all accounted for.
- Add privacy tests proving raw provider payloads, credentials, audit log internals, private message text, calendar text, email bodies, and database diagnostics never appear in success or failure envelopes.
- Add debug-route tests proving the dev capability surface still renders success, empty, pending, and failure states without owning business logic locally.
- Keep add-evidence success and controlled failure response previews backed by the selected service so live mode proves both envelopes without moving business logic into the dev page.

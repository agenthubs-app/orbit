# Chat Privacy Controls Mock Live Implementation

## Live Service Files

Live service files should stay behind this capability boundary:

- `features/chat/chat-privacy-controls-mock/live-privacy-controls-service.ts`
- `features/chat/chat-privacy-controls-mock/privacy-controls-provider.ts`
- `features/chat/chat-privacy-controls-mock/analysis-opt-in-store.ts`
- `features/chat/chat-privacy-controls-mock/deletion-worker.ts`
- `features/chat/chat-privacy-controls-mock/privacy-audit-log.ts`
- `features/chat/chat-privacy-controls-mock/private-note-redaction.ts`
- `features/chat/chat-privacy-controls-mock/sensitive-share-confirmation.ts`
- `features/chat/chat-privacy-controls-mock/provider-errors.ts`

Product routes and API route handlers should continue consuming the
`ChatPrivacyControlsService` interface from `features/chat/privacy-contract.ts`.
Pages must not import provider SDKs, database clients, deletion queues, audit
streams, or raw provider responses. The live service owns analysis opt-in
persistence, deletion worker requests, privacy audit log writes, private notes
redaction, and confirmation guard handoff for external share previews.

## Switch Mechanism

`ORBIT_CHAT_PRIVACY_CONTROLS_PROVIDER` is the explicit switch from deterministic
mock fixtures to live providers. The default remains `mock` until provider
files, configuration, privacy constraints, and replacement tests are present.

Recommended first values:

- `mock`: default. Uses `createMockChatPrivacyControlsService()` and the
  deterministic fixtures in `features/chat/privacy-contract.ts`.
- `live-privacy-controls`: uses `live-privacy-controls-service.ts`,
  `privacy-controls-provider.ts`, `analysis-opt-in-store.ts`,
  `deletion-worker.ts`, `privacy-audit-log.ts`,
  `private-note-redaction.ts`, `sensitive-share-confirmation.ts`, and
  `provider-errors.ts`.

The switch belongs in the same service factory pattern used by other
capabilities. API routes should ask for a `ChatPrivacyControlsService`; they
should not branch on raw environment variables or provider names directly.

## Required Env Vars Or Permissions

Initial environment contract:

- `ORBIT_CHAT_PRIVACY_CONTROLS_PROVIDER=live-privacy-controls`
- `ORBIT_CHAT_PRIVACY_CONTROLS_DATABASE_URL`
- `ORBIT_CHAT_PRIVACY_AUDIT_LOG_STREAM`
- `ORBIT_CHAT_PRIVACY_DELETION_QUEUE`
- `ORBIT_CHAT_PRIVACY_DELETION_QUEUE_REGION`
- `ORBIT_CHAT_PRIVACY_CONTROLS_TIMEOUT_MS`

Live analysis opt-in changes require permission to read and write only the
current user's chat privacy settings. Live analysis deletion requires permission
to enqueue a scoped deletion worker job for the selected conversation. Live
privacy audit log writes require an append-only audit stream that records
source evidence, actor, timestamp, and result without storing private note body
text.

AI provider access, email, calendar, notification, device, and external share
permissions are not owned by this capability. If a live AI provider or external
share adapter later consumes chat context, it must receive already-redacted,
source-backed payloads from this boundary and must still pass through the
confirmation guard.

The live service should fail closed when a required value is missing: return the
shared API failure envelope with provider-safe context, keep mock fixtures as
the local default, and never silently fall through to an undeclared provider.

## Privacy And Provenance Constraints

Every live analysis opt-in state, deletion state, hidden private note, sensitive
share confirmation, source evidence reference, and provenance object must keep
the mock contract's privacy fields. Live code must preserve these invariants:

- Private notes stay hidden from AI provider prompts and external share previews
  unless a redaction rule explicitly allows a safe summary.
- Private note body text is never written to the privacy audit log.
- Analysis deletion requests are scoped to the selected conversation and must
  not delete unrelated relationship data.
- A deletion worker result and privacy audit log entry must be represented as
  separate provider outcomes.
- Sensitive data cannot be shared externally until the confirmation guard
  records explicit user confirmation.
- Source evidence and provenance must remain attached to every state transition.
- Live database reads and writes must be limited to the current user's chat
  privacy controls and must not broaden into relationship, email, calendar, or
  notification data.

The provider mapper must reject live results that drop source evidence, omit
provenance, expose private notes to AI provider analysis, mark an external share
as executed without confirmation, or claim production deletion without a
matching deletion worker result and privacy audit log outcome.

## Replacement Tests

Replacement tests should cover:

- Contract parity for analysis opt-in, delete-analysis state, hidden private
  notes, sensitive share confirmation, source evidence, provenance, and privacy.
- Service factory behavior for `mock`, `live-privacy-controls`, missing
  provider config, invalid provider switch values, and provider-safe failures.
- API envelope behavior for success, empty, pending, not found, validation,
  confirmation-required, deletion worker failure, audit log failure, and
  controlled provider failure paths.
- The mock service still making no external provider, database, email,
  calendar, notification, network, device, AI provider, deletion worker, or
  production privacy audit log calls.
- Redaction tests proving private notes are hidden from AI analysis and external
  share previews.
- Confirmation guard tests proving sensitive data cannot be shared externally
  before explicit confirmation.
- Deletion worker tests proving deletion requests are scoped and auditable.
- Privacy audit log tests proving audit records keep source evidence and
  provenance without storing private note body text.
- Route tests for `GET /api/chat/privacy` and
  `POST /api/chat/privacy/analysis-toggle` under mock and live modes.
- Declared probe tests proving `POST /api/chat/privacy/analysis-toggle`
  returns the default mock opt-out envelope when no body is provided, while
  explicit invalid toggle values still fail closed.

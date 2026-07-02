# Chat Privacy Controls Live Store Implementation

## Live Service Files

Chat privacy controls now have a storage-backed live implementation:

- `features/chat/privacy-contract.ts`
- `features/chat/live-privacy-service.ts`
- `features/chat/storage/chat-privacy-controls-live-record-provider.ts`
- `features/chat/service-factory.ts`
- `app/api/chat/privacy/route.ts`
- `app/api/chat/privacy/analysis-toggle/route.ts`
- `tests/capabilities/chat-privacy-controls-live-store.test.ts`

The live service reuses the chat conversation live graph provider, then maps
`conversations`, `messages`, `contacts`, and `connections` into privacy control
state. It does not define new storage fields and it does not write privacy
settings, deletion requests, private notes, or audit records back to storage.

## Runtime Selection

Use the shared module mode switch:

- `ORBIT_MODULE_MODE=mock`: use deterministic mock fixtures.
- `ORBIT_MODULE_MODE=live`: use the shared live database provider.
- `ORBIT_MODULE_MODE=hybrid`: follows the existing module factory fallback rules.

Live mode reads database configuration through the shared live storage config:

- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or
  `ORBIT_DATABASE_URL`
- `ORBIT_WORKSPACE_ID`

There is no separate `ORBIT_CHAT_PRIVACY_CONTROLS_PROVIDER` switch in the
current implementation.

## Current Live Boundary

The current live implementation is deterministic and storage-backed:

- It reads source-backed chat context from the live store.
- It returns analysis opt-in state, deletion preview state, hidden private
  notes, and sensitive-share confirmation state with `generatedBy:
  live-store-query`.
- It preserves source evidence, provenance, privacy, redaction, and
  confirmation requirements. Sensitive share previews stay behind the
  confirmation guard.
- It sets AI provider, external network, email, calendar, notification, device,
  production data deletion, production privacy audit log, and live database
  write flags to `false`.
- It sets `liveDatabaseReadExecuted: true` only after reading the live store.
- It keeps `liveDatabaseWriteExecuted: false`.

This is intentionally not a deletion worker, privacy audit log, or external
share integration. Those provider integrations need separate provider,
retention, confirmation, and safety review.

## Failure And State Handling

Live mode fails closed when the shared live database is not configured:

- Error code: `CHAT_PRIVACY_LIVE_STORE_UNCONFIGURED`
- App error: `SERVICE_UNAVAILABLE`
- No fallback to mock data in live mode.

The live service also preserves the existing success, empty, pending,
not-found, validation, confirmation-required, and controlled failure paths.
Empty and pending are successful envelopes. Controlled failure uses the
existing `CHAT_PRIVACY_MOCK_FAILED` state path for compatibility with the debug
surface.

## Replacement Tests

Coverage lives in:

- `tests/capabilities/chat-privacy-controls-live-store.test.ts`
- `tests/capabilities/chat-privacy-controls-mock.test.ts`

The live test proves that generated chat records can produce privacy controls
for `conversation_001`, including the Japanese contact `山田 千尋` and
`Morning Light Foods`, without AI, deletion workers, external share actions,
notifications, database writes, or production privacy audit log writes. The
mock test continues to prove the mock boundary never calls live providers.

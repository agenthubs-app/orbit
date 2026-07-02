# Chat Writing Assist Live Store Implementation

## Live Service Files

Chat writing assist now has a storage-backed live implementation:

- `features/chat/assist-contract.ts`
- `features/chat/live-assist-service.ts`
- `features/chat/storage/chat-writing-assist-live-record-provider.ts`
- `features/chat/service-factory.ts`
- `app/api/chat/assist/rewrite/route.ts`
- `app/api/chat/assist/followup-draft/route.ts`
- `tests/capabilities/chat-writing-assist-live-store.test.ts`

The live service reuses the chat conversation live graph provider, then maps
`conversations`, `messages`, `contacts`, and `connections` into deterministic
writing assists. It does not define new storage fields and it does not write
message drafts back to storage.

## Runtime Selection

Use the shared module mode switch:

- `ORBIT_MODULE_MODE=mock`: use deterministic mock fixtures.
- `ORBIT_MODULE_MODE=live`: use the shared live database provider.
- `ORBIT_MODULE_MODE=hybrid`: follows the existing module factory fallback rules.

Live mode reads database configuration through the shared live storage config:

- `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or
  `ORBIT_DATABASE_URL`
- `ORBIT_WORKSPACE_ID`

There is no separate `ORBIT_CHAT_WRITING_ASSIST_PROVIDER` switch in the current
implementation.

## Current Live Boundary

The current live implementation is deterministic and storage-backed:

- It reads source-backed chat context from the live store.
- It generates polite rewrite, follow-up draft, appointment suggestion, and
  quick greeting payloads with `generatedBy: live-store-query`.
- It preserves source evidence, provenance, privacy, and confirmation
  requirements.
- It sets AI, external send, external network, email, calendar, notification,
  device, production message storage, and audit-log write flags to `false`.
- It sets `liveDatabaseReadExecuted: true` only after reading the live store.
- It keeps `liveDatabaseWriteExecuted: false`.

This is intentionally not an AI writing provider integration. A future AI
writing provider can be added behind the same service contract, but only after
separate provider, retention, confirmation, and safety review.

## Failure And State Handling

Live mode fails closed when the shared live database is not configured:

- Error code: `CHAT_WRITING_ASSIST_LIVE_STORE_UNCONFIGURED`
- App error: `SERVICE_UNAVAILABLE`
- No fallback to mock data in live mode.

The live service also preserves the existing success, empty, pending, and
controlled failure states. Empty and pending are successful envelopes with no
assists. Controlled failure uses the existing
`CHAT_WRITING_ASSIST_MOCK_FAILED` state path for compatibility with the debug
surface.

## Replacement Tests

Coverage lives in:

- `tests/capabilities/chat-writing-assist-live-store.test.ts`
- `tests/capabilities/chat-writing-assist-mock.test.ts`

The live test proves that generated chat records can produce reviewable writing
assists for `conversation_001`, including the Japanese contact `山田 千尋` and
`Morning Light Foods`, without AI, send providers, notifications, or database
writes. The mock test continues to prove the mock boundary never calls live
providers.

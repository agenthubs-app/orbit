# Chat Conversation And Message Live Implementation

## Live service files

- Contract: `features/chat/contract.ts`.
- Service interface: `features/chat/service.ts`.
- Mock service: `features/chat/mock-service.ts`.
- Hybrid service: `features/chat/chat-conversation-and-message-mock/hybrid-service.ts`.
- Live service: `features/chat/live-service.ts`.
- Live storage provider:
  `features/chat/storage/chat-conversation-live-record-provider.ts`.
- Factory registration: `features/chat/service-factory.ts`.
- Route handlers keep the same envelopes:
  `/api/chat/conversations`,
  `/api/chat/conversations/[id]`, and
  `/api/chat/conversations/[id]/messages`.

## Switch mechanism

- `ORBIT_MODULE_MODE=mock` uses deterministic fixtures.
- `ORBIT_MODULE_MODE=hybrid` uses the local remote database.
- `ORBIT_MODULE_MODE=live` resolves
  `createLiveChatConversationMessageService` with the configured shared live
  record store provider.
- The current switch does not use `ORBIT_CHAT_CONVERSATION_PROVIDER`; that older
  name remains a historical handoff note only.
- Live mode fails closed with `CHAT_CONVERSATION_LIVE_STORE_UNCONFIGURED` when
  no database URL is configured. It must not silently fall back to mock, real-time
  transport, WebSocket subscriptions, or external message delivery.

## Required env vars and permissions

- Live storage uses `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or
  `ORBIT_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID` selects the tenant/workspace rows, defaulting to
  `workspace:default`.
- The live provider reads generic `orbit_records` rows from `conversations`,
  `messages`, `contacts`, and `connections`.
- The POST route records an outbound message into the `messages` collection and
  updates the conversation `updatedAt` timestamp only.
- Email, calendar, notification, AI, device access, external networks,
  real-time transport, WebSocket subscriptions, and external message delivery
  are not requested by this capability.

## Data mapping

- `features/chat/storage/chat-conversation-live-record-provider.ts` validates
  payload fields and maps generic live records into `ConversationDTO`,
  `MessageDTO`, `ContactDTO`, and `ConnectionDTO`.
- `features/chat/live-service.ts` maps those DTOs into the chat contract:
  conversation summaries, message threads, send-message state, one-to-one
  context, source evidence, provenance, and privacy fields.
- `sendMessage` is storage-only. It creates a `system` sourced outbound message
  with preserved evidence ids and all external side-effect flags set to false.
- The service still uses the existing chat contract delivery-state vocabulary
  (`mock_received`, `mock_recorded_locally`, `not_sent`) because no external
  delivery provider is enabled.

## Privacy and provenance constraints

- Message content is relationship data. Live code must not send it to AI,
  analytics, email, calendar, notification, device, or external network services
  unless a separate provider and consent path is implemented.
- Every conversation and message keeps source evidence ids and provenance fields.
- Live provenance uses `privacy: "live-chat-conversation-preview"` and
  `generationMethod: "live-store-query"` or `"live-store-send"`.
- `liveDatabaseReadExecuted` and `liveDatabaseWriteExecuted` are true only for
  the live storage operations actually performed.
- API failures keep using `{ success: false, error }` envelopes with safe
  context and no credential leakage.

## Replacement tests

- `tests/capabilities/chat-conversation-message-live-store.test.ts` covers live
  list, thread read, storage-only send, fail-closed configuration, missing
  conversation id, blank message body, and missing conversation handling.
- `tests/capabilities/chat-conversation-and-message-mock.test.ts` keeps proving
  the mock path is deterministic and does not call live transport, WebSocket,
  production message storage, AI, email, calendar, notification, network, or
  device providers.
- Route tests keep proving stable success and failure API envelopes for
  `/api/chat/conversations`,
  `/api/chat/conversations/demo-conversation-1`, and
  `/api/chat/conversations/demo-conversation-1/messages`.
- The body-less deterministic harness POST remains mock-only behavior; explicit
  blank-body requests still return `CHAT_MESSAGE_BODY_REQUIRED`.

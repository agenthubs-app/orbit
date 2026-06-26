# Chat Conversation And Message Mock Live Implementation

## Live service files

- Keep the typed contract in `features/chat/contract.ts`.
- Keep fixture-only demo payloads in `features/chat/fixtures.ts`.
- Keep the service interface in `features/chat/service.ts`.
- Replace `features/chat/mock-service.ts` by adding live provider files under
  `features/chat/chat-conversation-and-message-mock/`, for example:
  `live-service.ts`, `transport-provider.ts`, `message-store-provider.ts`, and
  `subscription-provider.ts`.
- Keep route handlers in `app/api/chat/conversations/route.ts`,
  `app/api/chat/conversations/[id]/route.ts`, and
  `app/api/chat/conversations/[id]/messages/route.ts` returning the same API
  envelopes.

## Switch mechanism

- `ORBIT_CHAT_CONVERSATION_PROVIDER=mock` must continue to use
  `createMockChatConversationMessageService`.
- `ORBIT_CHAT_CONVERSATION_PROVIDER=live` may resolve a live implementation only
  after the live service files above exist and replacement tests prove the same
  envelope contract.
- The switch must fail closed when an unknown provider is configured. Do not
  silently fall back to live transport.

## Required env vars and permissions

- A live real-time transport endpoint is required before enabling live
  conversation updates.
- A WebSocket or equivalent subscription credential is required before enabling
  live thread subscriptions.
- A durable message storage connection string is required before enabling live
  message writes.
- Email, calendar, and notification permissions are separate capabilities and
  must not be requested by chat rendering alone.
- External message delivery requires an explicit confirmation guard before any
  provider send action.

## Privacy and provenance constraints

- Every conversation, message, send-message state, and one-to-one chat context
  must preserve source evidence and provenance fields.
- Message content is relationship data. Live code must not send it to AI,
  analytics, email, calendar, notification, or device services unless that
  provider is explicitly wired and covered by consent and replacement tests.
- API failures must keep using `{ success: false, error }` envelopes with safe
  messages and non-sensitive context.
- The dev capability page remains a probe surface only; product routes must
  consume the same typed service boundary rather than importing fixtures.

## Replacement tests

- Contract tests must continue to assert typed conversation list, message
  thread, send-message state, one-to-one context, error definitions, and
  provenance fields.
- Mock guard tests must keep proving mock mode makes no network, device,
  database, AI, email, calendar, notification, real-time transport, WebSocket,
  or production message storage calls.
- Live provider tests must cover success, empty, pending, controlled failure,
  provider failure, missing conversation, empty message body, and confirmation
  guard behavior.
- Route tests must keep proving stable success and failure API envelopes for
  `/api/chat/conversations`,
  `/api/chat/conversations/demo-conversation-1`, and
  `/api/chat/conversations/demo-conversation-1/messages`.
- POST route tests must keep covering both the body-less deterministic harness
  probe and the explicit blank-body `CHAT_MESSAGE_BODY_REQUIRED` validation
  envelope before any live delivery provider is enabled.

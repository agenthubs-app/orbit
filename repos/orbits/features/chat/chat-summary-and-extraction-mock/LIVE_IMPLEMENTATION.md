# Chat Summary And Extraction Live Implementation

## Live Service Files

- Contract: `features/chat/summary-contract.ts`.
- Mock service: `features/chat/mock-summary-service.ts`.
- Live service: `features/chat/live-summary-service.ts`.
- Live storage adapter:
  `features/chat/storage/chat-summary-live-record-provider.ts`.
- Shared chat graph storage mapper:
  `features/chat/storage/chat-conversation-live-record-provider.ts`.
- Factory registration: `features/chat/service-factory.ts`.
- Route handlers keep the same envelopes:
  `POST /api/chat/conversations/[id]/summary` and
  `GET /api/chat/conversations/[id]/extractions`.

## Switch Mechanism

- `ORBIT_MODULE_MODE=mock` uses deterministic fixtures.
- `ORBIT_MODULE_MODE=live` resolves `createLiveChatSummaryExtractionService`
  with the configured shared live record store provider.
- The previous `ORBIT_CHAT_SUMMARY_EXTRACTION_PROVIDER` AI-provider switch is
  not used by the current implementation.
- Live mode fails closed with `CHAT_SUMMARY_LIVE_STORE_UNCONFIGURED` when no
  database URL is configured. It must not silently fall back to mock, AI
  summarization, profile mutation, notifications, email, calendar, devices, or
  external networks.

## Required Env Vars Or Permissions

- Live storage uses `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, or
  `ORBIT_DATABASE_URL`.
- `ORBIT_WORKSPACE_ID` selects the tenant/workspace rows, defaulting to
  `workspace:default`.
- The provider reads generic `orbit_records` rows from `conversations`,
  `messages`, `contacts`, and `connections`.
- No AI provider credentials, model selection, prompt builder, vector store,
  profile write permission, email/calendar permission, notification permission,
  device permission, or external network permission is required for this goal.

## Privacy And Provenance Constraints

- Live extraction is deterministic and storage-backed. It does not send raw chat
  logs to AI or analytics providers.
- Every summary, extracted need, extracted task, relationship profile update,
  and confirmation-required profile suggestion keeps source evidence,
  provenance, and privacy scope.
- Live provenance uses `privacy: "live-chat-summary-extraction-preview"` and
  `generationMethod: "live-store-summary"` or `"live-store-extraction"`.
- `liveDatabaseReadExecuted` is true only when the live record store is read.
  `liveDatabaseWriteExecuted` remains false because this service is read-only.
- Relationship profile updates are proposals only: `confirmationRequired: true`,
  `autoApplied: false`, and `automaticProfileMutationExecuted: false`.

## Replacement Tests

- `tests/capabilities/chat-summary-extraction-live-store.test.ts` covers live
  summary, extraction, empty/pending scenarios, validation errors, not-found
  errors, and fail-closed missing configuration.
- `tests/capabilities/chat-summary-and-extraction-mock.test.ts` keeps proving
  the mock service is deterministic and makes no external provider, database,
  email, calendar, notification, network, AI, or device calls.
- Route tests keep proving stable success and failure API envelopes for
  `POST /api/chat/conversations/[id]/summary` and
  `GET /api/chat/conversations/[id]/extractions`.
- Build verification covers the dev capability view, which uses synchronous
  guards around mock-only summary service calls.

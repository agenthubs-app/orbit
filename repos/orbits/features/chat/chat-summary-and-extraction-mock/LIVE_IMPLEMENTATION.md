# Chat Summary And Extraction Mock Live Implementation

## Live Service Files

Live service files should stay behind this capability boundary:

- `features/chat/chat-summary-and-extraction-mock/live-summary-service.ts`
- `features/chat/chat-summary-and-extraction-mock/summary-provider.ts`
- `features/chat/chat-summary-and-extraction-mock/prompt-builder.ts`
- `features/chat/chat-summary-and-extraction-mock/provider-mapper.ts`
- `features/chat/chat-summary-and-extraction-mock/profile-suggestion-mapper.ts`
- `features/chat/chat-summary-and-extraction-mock/redaction.ts`
- `features/chat/chat-summary-and-extraction-mock/provider-errors.ts`

The product route and API route handlers should continue consuming the
`ChatSummaryExtractionService` interface from `features/chat/summary-contract.ts`.
Pages must not import provider SDKs or raw provider responses. The prompt builder
owns provider prompts, the provider mapper owns conversion back into Orbit DTOs,
and redaction owns removal of unrelated relationship, credential, calendar, and
email details before any provider request is assembled.

## Switch Mechanism

`ORBIT_CHAT_SUMMARY_EXTRACTION_PROVIDER` is the explicit switch from deterministic
mock fixtures to live provider-backed summary extraction. Accepted live values
should be declared in code before any provider is wired. The default remains the
mock service unless both the provider switch and provider configuration are
present.

Recommended first values:

- `mock`: default. Uses `createMockChatSummaryExtractionService()` and the
  deterministic fixtures in `features/chat/summary-contract.ts`.
- `live-ai-summary`: uses `live-summary-service.ts`, `summary-provider.ts`,
  `prompt-builder.ts`, `provider-mapper.ts`, `profile-suggestion-mapper.ts`,
  `redaction.ts`, and `provider-errors.ts`.

The switch belongs in the same service factory pattern used by other
capabilities. API routes should ask for a `ChatSummaryExtractionService`; they
should not branch on raw environment variables or provider names directly.

## Required Env Vars Or Permissions

A live AI summarization provider needs provider-specific credentials, model
selection, timeout limits, and cost controls. Relationship profile update
suggestions also need a write-capable profile service, but automatic profile
mutation must stay disabled until a confirmation guard approves the change.

Initial environment contract:

- `ORBIT_CHAT_SUMMARY_EXTRACTION_PROVIDER=live-ai-summary`
- `ORBIT_CHAT_SUMMARY_AI_API_KEY`
- `ORBIT_CHAT_SUMMARY_AI_MODEL`
- `ORBIT_CHAT_SUMMARY_AI_TIMEOUT_MS`
- `ORBIT_CHAT_SUMMARY_AI_MAX_TOKENS`

The live service should fail closed when a required value is missing: return the
shared API failure envelope with provider-safe context, keep mock fixtures as the
local default, and never silently fall through to an undeclared provider.

Email, calendar, and notification permissions are not owned by this capability.
If live extraction references those signals, it should receive already-approved
source evidence from their capability services rather than opening a new
provider session here.

## Privacy And Provenance Constraints

Every summary, extracted need, extracted task, relationship profile update, and
confirmation-required profile suggestion must keep source evidence, provenance,
privacy scope, and provider boundary flags. The live service must preserve the
mock contract's no-silent-mutation rule: profile suggestions are proposed with
`confirmationRequired: true` and `autoApplied: false` until reviewed.

Provider prompts must include only the minimum source-backed chat context needed
for the summary. Raw chat logs, unrelated contacts, credentials, and private
calendar or email data must not be sent to the provider.

The provider mapper must reject provider output that drops evidence ids,
changes `confirmationRequired: true`, flips `autoApplied` to true, omits privacy
scope, or cannot trace each summary, need, task, and suggestion back to a source
record.

## Replacement Tests

Replacement tests should cover:

- Contract parity for summary, extracted needs, extracted tasks, profile update
  suggestions, confirmation-required suggestions, and provenance.
- Service factory tests for `mock`, `live-ai-summary`, missing provider config,
  and invalid provider switch values.
- API envelope behavior for success, empty, pending, not found, validation, and
  controlled provider failure paths.
- The mock service still making no external provider, database, email, calendar,
  notification, network, or device calls.
- Prompt builder and redaction tests proving only source-backed chat context is
  sent to the provider.
- Provider mapper tests that preserve source evidence and privacy fields.
- Confirmation guard tests proving automatic profile mutation remains blocked.
- Route tests for `POST /api/chat/conversations/[id]/summary` and
  `GET /api/chat/conversations/[id]/extractions` under mock and live modes.

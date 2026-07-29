# Compose App Chat Live Boundary

`/app/chat` is an authenticated, read-only workspace for conversation lists,
message threads, writing assistance, summaries, extracted relationship signals,
and privacy context. In live mode, every service is created for the canonical
server-side actor. A page GET never records a reply, sends an Agent prompt, or
executes an external action.

## Live Service/Provider Files

The route composes these replaceable contracts without importing providers in
the page UI:

- `features/chat/service.ts` and `features/chat/contract.ts` for conversation
  lists and message threads.
- `features/chat/assist-contract.ts` for writing assist requests and returned suggestions.
- `features/chat/summary-contract.ts` for chat summary, extracted needs, extracted tasks, profile suggestions, and confirmation-required profile updates.
- `features/chat/privacy-contract.ts` for analysis opt-in, deletion, hidden private notes, and sensitive-share confirmation.
- `app/api/chat/conversations/route.ts`, `app/api/chat/conversations/[id]/route.ts`, `app/api/chat/conversations/[id]/messages/route.ts`, `app/api/chat/assist/*`, `app/api/chat/conversations/[id]/summary/route.ts`, `app/api/chat/conversations/[id]/extractions/route.ts`, and `app/api/chat/privacy/*` for API envelope parity.
- Live providers live behind the feature service factories and actor-scoped
  constructors. Any future provider must preserve the same route bundle.

## Switch Mechanism

The switch mechanism is `createModuleServiceFactory` in
`app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts`.
`createActorScopedAppChatRouteServices(actorId)` is the live page entry point.
`/app/chat/page.tsx`, `chat-route-view-model.ts`, and
`chat-view-model-adapter.ts` must continue to depend on that bundle instead of
importing providers or fixture data.

The public query contract is deliberately narrow:

- `conversation` selects one conversation from the actor-scoped list.
- `conversationId` is the equivalent live-link alias.
- `scenario`, `prompt`, `action`, and runtime mode are not public Chat controls.
  Controlled route states use the loader's explicit internal controls argument.
- Agent prompts belong to the interactive `/app/agent` client/API flow; they are
  never executed by the Chat server-render loader.

## Required Env Vars Or Permissions

Live providers require:

- Chat storage credentials and actor/workspace routing for conversation reads.
- AI writing and summarization keys with per-user consent checks.
- Relationship data store access for contact, connection, evidence, task, and profile suggestion reads.
- Privacy settings access for analysis opt-in, deletion requests, private-note visibility, and sensitive-share confirmation.
- Mutation, notification, and external-send permissions only behind a separate
  authenticated action contract with explicit confirmation and idempotency.

## Privacy/Provenance Constraints

Privacy/provenance constraints for `/app/chat` are strict because chat text can include sensitive relationship context:

- Every conversation, message, assist, summary, extraction, profile suggestion, and privacy control must retain source labels and evidence ids.
- Hidden private notes must stay redacted from writing assist, summary, extraction, and share previews unless a future consent model explicitly allows disclosure.
- Profile updates and sensitive-share previews must remain
  confirmation-required and must not auto-apply from summary or extraction
  output.
- The Chat GET route must stay read-only. Do not reintroduce reply recording,
  Agent execution, task creation, notification delivery, or external send
  through query parameters.
- Any future write must use an authenticated mutation endpoint, actor-scoped
  authorization, explicit confirmation, idempotency, and persisted readback.
- Provider errors must be redacted through the shared API envelope and must not expose credentials, raw external payloads, unrelated message bodies, or cross-tenant identifiers.

## Replacement Tests

Replacement tests should cover route states, route recovery, identity selection,
query isolation, and live parity:

- Keep `tests/pages/app-chat-page.test.tsx` asserting source-backed workspace
  rendering, exact `conversation` and `conversationId` selection, unknown-ID
  failure, explicit-only controlled scenarios, and absence of query-driven
  Agent/message execution.
- Keep `tests/pages/app-chat-live-route-services.test.ts` asserting server
  authentication and one actor-scoped bundle for all four Chat services.
- Add service factory tests that prove `mock`, `hybrid`, and `live` modes resolve the intended chat service implementation or fail visibly with `NOT_IMPLEMENTED`.
- Add API parity tests for conversation list, message thread, message send, writing assist, summary, extraction, privacy read, privacy toggle, deletion, and sensitive-share confirmation envelopes.
- Add privacy regression tests for missing consent, private note redaction, disabled analysis, deletion requests, external send attempts, AI provider failures, and profile suggestion confirmation.
- Keep replacement tests proving the Chat page cannot call Agent `sendMessage`
  or a message mutation during GET rendering.

## Evaluator Evidence Summary

Live files: `features/chat/service.ts`, `features/chat/contract.ts`,
`features/chat/assist-contract.ts`, `features/chat/summary-contract.ts`,
`features/chat/privacy-contract.ts`, actor-scoped live providers, and
`app/api/chat/**` route handlers.

Switch: service factory resolution through `shared/services/module-mode.ts` and `app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts`.

Env and permissions: chat transport, relationship data store, AI writing and summarization, privacy settings, deletion workers, notification delivery, and external-send permissions with confirmation.

Privacy and provenance: actor-scoped reads, source labels, evidence ids,
private-note redaction, confirmation-required profile suggestions, and no GET
mutation or prompt execution.

Replacement tests: page route tests, API envelope parity, route state and
recovery checks, conversation identity aliases, public-query isolation, service
factory mode tests, provider permission tests, privacy regressions, and
authenticated mutation tests if a write path is introduced.

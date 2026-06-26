# Compose App Chat Mock-To-Live Handoff

Sprint 65 composes `/app/chat` from the approved chat capability contracts and mock services. The route keeps conversations, message thread review, writing assist, chat summary, extracted relationship signals, privacy controls, and local reply review inside the route adapter while preserving the mock-first replacement path.

## Live Service/Provider Files

The future live service/provider files should replace the mock constructors behind the existing contracts, not the page UI:

- `features/chat/service.ts` and `features/chat/contract.ts` for conversation lists, message threads, and local or external message actions.
- `features/chat/assist-contract.ts` for writing assist requests and returned suggestions.
- `features/chat/summary-contract.ts` for chat summary, extracted needs, extracted tasks, profile suggestions, and confirmation-required profile updates.
- `features/chat/privacy-contract.ts` for analysis opt-in, deletion, hidden private notes, and sensitive-share confirmation.
- `app/api/chat/conversations/route.ts`, `app/api/chat/conversations/[id]/route.ts`, `app/api/chat/conversations/[id]/messages/route.ts`, `app/api/chat/assist/*`, `app/api/chat/conversations/[id]/summary/route.ts`, `app/api/chat/conversations/[id]/extractions/route.ts`, and `app/api/chat/privacy/*` for API envelope parity.
- Provider modules should live next to the chat feature services, for example `features/chat/live-conversation-service.ts`, `features/chat/live-assist-service.ts`, `features/chat/live-summary-service.ts`, and `features/chat/live-privacy-service.ts`.

## Switch Mechanism

The switch mechanism is `createModuleServiceFactory` in `app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts`. Add `hybrid` or `live` implementations to the four chat service factories only after live replacement tests exist. `/app/chat/page.tsx` and `chat-command-center.tsx` should continue to depend on `createAppChatRouteServices()` instead of importing provider files or fixture data.

## Required Env Vars Or Permissions

Live mode will require provider-specific configuration before it can be enabled:

- Chat transport credentials and tenant routing for conversation reads and message writes.
- AI writing and summarization keys with per-user consent checks.
- Relationship data store access for contact, connection, evidence, task, and profile suggestion reads.
- Privacy settings access for analysis opt-in, deletion requests, private-note visibility, and sensitive-share confirmation.
- Notification and external-send permissions only after explicit user confirmation.

## Privacy/Provenance Constraints

Privacy/provenance constraints for `/app/chat` are strict because chat text can include sensitive relationship context:

- Every conversation, message, assist, summary, extraction, profile suggestion, and privacy control must retain source labels and evidence ids.
- Hidden private notes must stay redacted from writing assist, summary, extraction, and share previews unless a future consent model explicitly allows disclosure.
- Profile updates and sensitive-share previews must remain confirmation-required and must not auto-apply from summary or extraction output.
- The local reply action must continue to expose `data-action-evidence` and `data-side-effects="none"` until live send confirmation and external action sandbox coverage are in place.
- The local follow-up tracker must stay sourced from extracted task evidence and keep `data-side-effects="none"` until a live task write path and user confirmation guard are available.
- Provider errors must be redacted through the shared API envelope and must not expose credentials, raw external payloads, unrelated message bodies, or cross-tenant identifiers.

## Replacement Tests

Replacement tests should cover route state checks, route recovery actions, data-action-evidence, and live parity:

- Keep `tests/pages/app-chat-page.test.tsx` asserting the heading, one domain datum, the local reply action result, `data-side-effects="none"`, and no direct fixture imports in the route adapter.
- Keep route tests asserting the local follow-up tracker uses extracted task evidence, survives action reloads, and does not imply external delivery.
- Add service factory tests that prove `mock`, `hybrid`, and `live` modes resolve the intended chat service implementation or fail visibly with `NOT_IMPLEMENTED`.
- Add API parity tests for conversation list, message thread, message send, writing assist, summary, extraction, privacy read, privacy toggle, deletion, and sensitive-share confirmation envelopes.
- Add privacy regression tests for missing consent, private note redaction, disabled analysis, deletion requests, external send attempts, AI provider failures, and profile suggestion confirmation.
- Add replacement tests that prove no live provider call can happen from `/app/chat` without required env vars or permissions.

## Evaluator Evidence Summary

Live files: `features/chat/service.ts`, `features/chat/contract.ts`, `features/chat/assist-contract.ts`, `features/chat/summary-contract.ts`, `features/chat/privacy-contract.ts`, future `features/chat/live-*-service.ts` providers, and `app/api/chat/**` route handlers.

Switch: service factory resolution through `shared/services/module-mode.ts` and `app/(app)/app/chat/compose-app-chat-from-previously-approved-mock-first-capabilities/chat-service-factory.ts`.

Env and permissions: chat transport, relationship data store, AI writing and summarization, privacy settings, deletion workers, notification delivery, and external-send permissions with confirmation.

Privacy and provenance: source labels, evidence ids, private-note redaction, confirmation-required profile suggestions, local follow-up tracker evidence, `data-action-evidence`, and `data-side-effects=none`.

Replacement tests: page route tests, API envelope parity, route state checks, route recovery actions, service factory mode tests, provider permission tests, privacy regressions, and local-reply-to-live-send confirmation tests.

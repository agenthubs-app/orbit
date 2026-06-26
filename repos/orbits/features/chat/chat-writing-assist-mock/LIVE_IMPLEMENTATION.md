# Chat Writing Assist Mock To Live Handoff

## Live Service Files

The mock boundary is implemented in:

- `features/chat/assist-contract.ts`
- `features/chat/mock-assist-service.ts`
- `app/api/chat/assist/rewrite/route.ts`
- `app/api/chat/assist/followup-draft/route.ts`
- `features/chat/chat-writing-assist-mock/debug-view.tsx`

Live service files should stay under `features/chat/chat-writing-assist-mock/`
or a future `features/chat/live-assist-service.ts` provider file that implements
the existing `ChatWritingAssistService` interface. Route handlers should keep
calling the service interface and should not learn provider-specific request or
response shapes.

## Switch Mechanism

Use `ORBIT_CHAT_WRITING_ASSIST_PROVIDER` as the explicit provider switch:

- `mock`: use `createMockChatWritingAssistService`.
- `live`: use the live writing provider adapter after replacement tests exist.

The switch must be centralized in a service factory before live wiring. Do not
branch inside product pages or dev views.

## Required Env Vars And Permissions

A live implementation will require:

- `ORBIT_CHAT_WRITING_ASSIST_PROVIDER=live`
- A server-only AI writing provider key for rewrite and draft generation.
- Email, calendar, and notification permissions only when a confirmed external
  send, appointment creation, or notification action is added.
- Explicit confirmation before any external send action leaves Orbit.

The current mock intentionally requires none of those permissions and must never
call network, device, database, AI writing provider, email, calendar, or
notification services.

## Privacy And Provenance Constraints

Every live assist must preserve:

- Source evidence IDs used to generate the suggestion.
- Provenance describing provider, generation method, and collection time.
- Privacy boundaries for chat text and relationship context.
- Flags or audit metadata proving whether AI writing, external send, database,
  email, calendar, or notification services were requested.
- Confirmation requirements before any suggested text is sent externally.

Live providers must avoid training or retention settings that conflict with
Orbit relationship data privacy. If a provider cannot guarantee those
constraints, keep the mock provider active.

## Replacement Tests

Before switching from mock to live, add replacement tests for:

- Success envelopes for polite rewrite and follow-up draft.
- Appointment suggestion and quick greeting service methods.
- Empty source-context responses.
- Pending local writing guard responses.
- Controlled provider failure responses.
- Provider timeout and malformed provider payload handling.
- Proof that mock mode still makes no provider calls.
- Confirmation guard coverage before external send, email, calendar, or
  notification actions execute.

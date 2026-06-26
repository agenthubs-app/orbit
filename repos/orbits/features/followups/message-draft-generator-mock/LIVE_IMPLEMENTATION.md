# Message Draft Generator Mock To Live Handoff

## Live Service Files

- Keep the typed DTOs and mock contract in `features/followups/message-draft-contract.ts`.
- Keep the deterministic mock implementation in `features/followups/mock-message-draft-service.ts`.
- Add live provider adapters under `features/followups/message-draft-generator-mock/` before switching runtime behavior:
  - `live-message-draft-service.ts` for the `MessageDraftGeneratorService` implementation.
  - `ai-writing-provider.ts` for draft text generation.
  - `external-send-sandbox.ts` for confirmed send actions.
  - `message-draft-provider-factory.ts` for mock/live selection.

## Switch Mechanism

Use `ORBIT_MESSAGE_DRAFT_GENERATOR_PROVIDER` to select the provider boundary:

- `mock`: use `createMockMessageDraftGeneratorService()` and deterministic fixtures.
- `live`: use the live service only after provider adapters, confirmation guards, permissions, and replacement tests exist.

The API routes at `app/api/message-drafts/route.ts` and `app/api/message-drafts/[id]/route.ts` should call the provider factory once that switch exists. Until then they must stay pinned to the mock service.

## Required Env Vars And Permissions

Live mode must declare and validate provider configuration before runtime use:

- AI writing provider credentials and model configuration.
- Email provider permission for draft handoff or send preparation.
- Calendar permission if appointment drafts inspect availability or create scheduling text.
- Notification permission if draft review reminders are delivered.
- Database connection settings if drafts are persisted.

No external send action may run from draft generation alone. Sending requires an explicit confirmation guard and an external action sandbox.

## Privacy And Provenance Constraints

- Preserve `source`, `evidenceIds`, `sourceLabel`, `generationMethod`, and draft-level audit data on every live draft.
- Store the minimum relationship context needed for draft quality.
- Keep provider prompts and responses attached to provenance without exposing private relationship data in dev surfaces.
- Keep AI writing, email, calendar, notification, database, device, and external network activity visible through false/true provenance flags.
- Treat draft copy as sensitive until a user reviews source evidence and confirms any external send.

## Replacement Tests

Before enabling live mode, add tests that cover:

- Mock mode success, empty, pending, controlled failure, and no-provider-call guards.
- Live provider success with source evidence and provenance retained.
- Live provider failure mapped to the shared API failure envelope.
- Missing provider configuration failing visibly before any external request.
- Confirmation guard enforcement before external send.
- Email, calendar, notification, and external send permissions denied or not requested.
- Regression coverage for `POST /api/message-drafts` and `PATCH /api/message-drafts/[id]`.

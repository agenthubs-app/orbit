# Sensitive Action Confirmation Guard Live Implementation

## Live service and provider files

- `features/permissions/confirmation-contract.ts` remains the typed contract for confirmation requirements, decisions, error codes, provenance, and the service interface.
- `features/permissions/mock-confirmation-service.ts` is the Milestone C deterministic implementation and fixture source.
- `features/permissions/live-confirmation-service.ts` should implement the same `SensitiveActionConfirmationService` interface when live sensitive actions are allowed.
- `app/api/confirmations/[id]/approve/route.ts` and `app/api/confirmations/[id]/reject/route.ts` must continue to route through the confirmation service instead of calling action adapters directly.

Live provider adapters should stay separate from the route handlers. Expected adapter files include message send, contact write, calendar event, and profile update executors, each behind the service interface and the same confirmation decision guard.

## Switch mechanism

The app should keep using explicit feature mode resolution. Mock mode uses `createMockSensitiveActionConfirmationService`. Live mode may switch to `createLiveSensitiveActionConfirmationService` only after replacement tests prove that every approve and reject path still passes through the confirmation guard.

The Debug review surface at `/dev/capabilities/sensitive-action-confirmation-guard` should remain available in mock mode and continue to expose approve and reject forms for local verification. In live or hybrid mode, the form actions must still resolve through the same guard service and must not bypass confirmation state checks.

## Required env vars and permissions

- `ORBIT_FEATURE_MODE=live` enables the guarded live service after tests exist.
- `ORBIT_CONFIRMATION_PROVIDER` identifies the live confirmation persistence and audit provider.
- Message send requires a scoped messaging permission.
- Contact write requires a scoped contacts permission.
- Calendar event creation requires a scoped calendar permission.
- Profile update requires a scoped profile permission.

Do not put secrets in this document or in fixtures. Provider credentials belong in the runtime secret store used by deployment.

## Privacy and provenance constraints

Every confirmation requirement and decision must preserve source and evidence provenance. Live approval records must retain the evidence ids that justified the prompt, the actor who approved or rejected it, the decision time, and whether the underlying sensitive action executed.

The service must fail closed. Missing confirmation ids, stale resolved confirmations, permission denial, and provider errors must return shared API failure envelopes. Raw provider messages, contact payloads, calendar details, and profile diffs must not leak into logs or client errors.

Live execution must keep the following boundaries explicit:

- A message send requires a confirmed `send-message` decision.
- A contact write requires a confirmed `add-contact` decision.
- A calendar event requires a confirmed `create-calendar-event` decision.
- A profile update requires a confirmed `update-profile` decision.

## Replacement tests

Before replacing the mock:

- Keep the existing capability test for mock fixtures and add live service contract tests for approve and reject decisions.
- Add route tests proving `app/api/confirmations/[id]/approve/route.ts` and `app/api/confirmations/[id]/reject/route.ts` return shared API envelopes for success, missing id, already resolved, forbidden, and controlled provider failure paths.
- Add adapter tests proving no message send, contact write, calendar event, or profile update runs without a confirmed decision.
- Add privacy tests proving source and evidence provenance survive every live decision and raw provider errors are masked.
- Add UI tests proving the Debug review surface still renders success, empty, pending, and failure states and that approve and reject forms remain wired to the guarded API routes.

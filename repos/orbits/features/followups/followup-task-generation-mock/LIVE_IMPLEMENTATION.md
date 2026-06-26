# Followup Task Generation Mock-to-Live Handoff

This sprint keeps followup task generation mock-first. The current mock files are:

- `features/followups/contract.ts`
- `features/followups/fixtures.ts`
- `features/followups/service.ts`
- `features/followups/mock-service.ts`
- `app/api/tasks/route.ts`
- `app/api/tasks/generate/route.ts`
- `features/followups/followup-task-generation-mock/debug-view.tsx`

## Live Service And Provider Files

Live service files should stay under `features/followups/followup-task-generation-mock/` until the capability is promoted into a broader followups module. Expected provider boundaries:

- `live-service.ts` composes typed providers behind the `FollowupTaskGenerationService` interface.
- `task-persistence-provider.ts` reads and writes task records through the approved live persistence layer.
- `background-scheduler-provider.ts` schedules deferred task generation without bypassing confirmation guards.
- `ai-task-generation-provider.ts` proposes task text from approved relationship evidence.
- `calendar-provider.ts`, `email-provider.ts`, and `notification-provider.ts` remain separate permissioned adapters.

## Switch Mechanism

Use `ORBIT_FOLLOWUP_TASK_GENERATION_PROVIDER=mock|live` or the shared module mode resolver before live provider wiring is enabled. Mock remains the default. Live mode must return a controlled not-implemented failure until every provider file, permission check, and replacement test listed here exists.

## Required Env Vars And Permissions

Live mode must document and validate:

- Persistence credentials for task storage.
- Background scheduler credentials and queue names.
- AI task generation provider credentials and model allowlist.
- Calendar read or write permission, when a generated task needs a calendar-backed due date.
- Email permission, when promised actions or relationship context are derived from email.
- Notification permission, when reminders are delivered outside Orbit.

## Privacy And Provenance Constraints

Every generated task must keep source evidence from the new connection, event encounter, promised action, or dormant relationship trigger. Live task generation may summarize relationship context, but it must preserve the original provenance ids and must not hide whether AI, calendar, email, notification, scheduler, or persistence providers were used.

No live action should send a message, create a calendar item, deliver a notification, or write task state without an explicit confirmation boundary. Empty, pending, and controlled failure states must remain visible API envelopes.

## Replacement Tests

Replacement tests must cover:

- Success generation from new connections, event encounters, promised actions, and dormant relationships.
- Empty state when no relationship trigger is eligible.
- Pending state when confirmation or permissions are unresolved.
- Controlled provider failure for scheduler, task persistence provider, and AI task generation provider.
- Privacy and provenance assertions for source evidence on every generated task.
- Mock guard tests proving the mock service still performs no live provider, scheduler, database, calendar, email, notification, device, network, or AI work.

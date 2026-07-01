# Actions Autonomy Settings Mock To Live Handoff

## Mock Boundary

Sprint 50 implements a mock-first Actions autonomy settings boundary. The current
files expose low, medium, and high autonomy levels with deterministic fixtures,
visible provider boundaries, and explicit confirmation rules. The mock never
starts autonomous execution, scheduled live action jobs, external networks,
devices, databases, AI providers, calendar providers, email providers, or
notification services.

The current code path and service names still use `agent` for compatibility,
but product and architecture documents refer to the module as Actions.

## Live Service And Provider Files

Replace the mock service by adding live files next to this document:

- `features/agent/agent-autonomy-settings-mock/live-service.ts`
- `features/agent/agent-autonomy-settings-mock/service-factory.ts`
- `features/agent/agent-autonomy-settings-mock/providers/settings-store.ts`
- `features/agent/agent-autonomy-settings-mock/providers/job-queue.ts`
- `features/agent/agent-autonomy-settings-mock/providers/audit-log.ts`
- `features/agent/agent-autonomy-settings-mock/providers/ai-policy-adapter.ts`
- `features/agent/agent-autonomy-settings-mock/providers/calendar-policy-adapter.ts`
- `features/agent/agent-autonomy-settings-mock/providers/email-policy-adapter.ts`
- `features/agent/agent-autonomy-settings-mock/providers/notification-policy-adapter.ts`

The live implementation should continue to return the typed envelopes from
`features/agent/settings-contract.ts`. Product pages and API routes should call
a factory rather than importing provider clients directly.

## Switch Mechanism

Use `ORBIT_AGENT_AUTONOMY_SETTINGS_PROVIDER` as the runtime switch:

- `mock`: use `createMockAgentAutonomySettingsService`.
- `live`: use the live service from `service-factory.ts`.
- Any unknown value must fail visibly with a typed API error and must not fall
  back to live provider calls.

The `/api/agent/settings` route should remain the single HTTP boundary for
reading and saving settings. Live mode may persist settings only after the
confirmation guard records explicit confirmation for actions that could affect
external systems.

## Required Environment And Permissions

Live mode must declare and validate these variables or permissions before
provider use:

- `ORBIT_AGENT_AUTONOMY_DATABASE_URL`
- `ORBIT_AGENT_AUTONOMY_JOB_QUEUE_URL`
- `ORBIT_AGENT_AUTONOMY_AI_PROVIDER`
- Calendar permission for reading availability and staging calendar actions.
- Email permission for reading relationship context and staging outbound drafts.
- Notification permission for scheduling reminders.

Missing env vars or permissions should return a failure envelope. They should
not trigger retries, background jobs, or partial provider calls.

## Privacy And Provenance

Live settings must preserve privacy and provenance for every Contact,
Connection, Recommendation, Task, Dashboard item, and AgentAction affected by an
autonomy choice. Store the source of the setting change, actor label, timestamp,
confirmation id, evidence ids, and the provider boundary that evaluated the
change.

The live service must also keep the mock boundary's protected relationship
workflow list intact until equivalent live enforcement exists:

- Participant-facing follow-up: require confirmation of the recipient, source
  evidence, and tone before any email send, message handoff, or AI rewrite.
- Relationship reminder timing: require confirmation of timing and relevance
  before any calendar write, notification delivery, or scheduled live job.
- Relationship data workflow: require confirmation of provenance and intent
  before any contact, connection, evidence, context label, task, or audit record
  mutation reaches live storage.

High autonomy still requires explicit confirmation before any external action,
including sends, calendar writes, notification delivery, database mutation, AI
provider requests, or scheduled live action jobs. If provenance is incomplete,
the live service must return a typed failure rather than applying the setting.

## Replacement Tests

Replacement tests must cover:

- Mock and live factory selection with `ORBIT_AGENT_AUTONOMY_SETTINGS_PROVIDER`.
- GET `/api/agent/settings` success, empty, pending, and controlled failure
  envelopes.
- PUT `/api/agent/settings` for low, medium, and high autonomy levels.
- Relationship workflow protections for participant-facing follow-up,
  relationship reminder timing, and relationship data workflow mutations.
- Invalid level rejection before provider access.
- Missing env var and missing permission failures.
- Confirmation guard enforcement before external action permissions are
  activated.
- Provenance persistence for setting changes and audit records.
- No provider call when the scenario is empty, pending, invalid, or controlled
  failure.

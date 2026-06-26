# Agent Action Queue Mock To Live Handoff

## Live Service And Provider Files

- `features/agent/agent-action-queue-mock/live-service.ts` will implement the `AgentActionQueueService` interface with live reads and guarded writes.
- `features/agent/agent-action-queue-mock/service-factory.ts` will switch between the current `createMockAgentActionQueueService()` and the live service.
- `features/agent/agent-action-queue-mock/providers/` will contain provider adapters for relationship storage, event context, AI ranking, calendar availability, email context, and notification readiness.

## Switch Mechanism

- `ORBIT_AGENT_ACTION_QUEUE_PROVIDER=mock` keeps deterministic fixtures active.
- `ORBIT_AGENT_ACTION_QUEUE_PROVIDER=live` may enable live provider adapters only after replacement tests prove the same API envelopes, provenance fields, and explicit confirmation guard behavior.
- The live path must preserve event reminders, post-event followups, dormant activation, message draft suggestions, and appointment suggestions under the existing contract before product routes consume it.

## Required Environment And Permissions

- `ORBIT_AGENT_ACTION_DATABASE_URL` for approved relationship and action queue persistence.
- `ORBIT_AGENT_ACTION_AI_PROVIDER` for optional live ranking or draft suggestion support.
- Calendar read permission is required before appointment suggestions inspect availability.
- Email read permission is required before post-event followups or dormant activation use inbox context.
- Notification permission is required before live notification readiness is evaluated.
- External send, calendar write, notification delivery, and database write paths must stay disabled until the user gives explicit confirmation for the specific action.

## Privacy And Provenance Constraints

- Every live action must keep source references and evidence ids for the relationship context that produced it.
- Live providers must expose whether AI, email, calendar, notification, database, device, or network access occurred.
- Sensitive actions must remain two-step: suggestion first, explicit confirmation second.
- Privacy boundaries must prevent raw email, calendar, and chat content from leaking into API responses unless the field is already part of the typed contract.

## Replacement Tests

- Contract tests cover all action categories, source references, provenance, and provider-boundary flags.
- API tests cover success, empty, pending, controlled failure, accept, dismiss, missing id, and missing action envelopes.
- Provider guard tests verify mock mode never calls live providers and live mode refuses unconfirmed external side effects.
- Product route tests must prove `/app/**` composition can consume the same service without importing fixtures or dev UI.

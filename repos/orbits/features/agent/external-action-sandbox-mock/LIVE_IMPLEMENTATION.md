# External Action Sandbox Mock Live Implementation Handoff

Sprint 51 implements the mock boundary for no-op send message, no-op create calendar event, no-op notification delivery, and side-effect audit records. The current service must stay deterministic and must not call message, calendar, email, notification, push, device, AI, database, or external network providers.

This is the Actions module's external side-effect boundary. The current code
path still uses `features/agent` for compatibility, but product and architecture
documents refer to the module as Actions.

## Live Service And Provider Files

- `features/agent/external-action-sandbox-mock/live-service.ts` should implement the same `ExternalActionSandboxService` interface exported from `features/agent/external-action-contract.ts`.
- `features/agent/external-action-sandbox-mock/service-factory.ts` should choose mock or live mode and keep the API routes importing only the factory.
- `features/agent/external-action-sandbox-mock/providers/message-provider.ts` should own live message send adapters.
- `features/agent/external-action-sandbox-mock/providers/calendar-provider.ts` should own live calendar event writes.
- `features/agent/external-action-sandbox-mock/providers/notification-provider.ts` should own live notification and push delivery adapters.
- `features/agent/external-action-sandbox-mock/providers/audit-store.ts` should own durable side-effect audit persistence.

## Switch Mechanism

Keep `createMockExternalActionSandboxService` as the default. Add a factory that reads `ORBIT_EXTERNAL_ACTION_SANDBOX_PROVIDER` and returns the mock service unless the value is explicitly set to a reviewed live provider. API routes should continue returning the shared API envelope and runtime headers in both modes.

## Required Env Vars And Permissions

- `ORBIT_EXTERNAL_ACTION_SANDBOX_PROVIDER`: `mock` by default; live values must be allowlisted.
- `ORBIT_EXTERNAL_ACTION_DATABASE_URL`: durable audit store connection for live side-effect audit records.
- `ORBIT_EXTERNAL_ACTION_MESSAGE_PROVIDER`: live message adapter identifier.
- `ORBIT_EXTERNAL_ACTION_CALENDAR_PROVIDER`: live calendar adapter identifier.
- `ORBIT_EXTERNAL_ACTION_NOTIFICATION_PROVIDER`: live notification adapter identifier.
- Message send permission must be granted per user/account and scoped to confirmed recipients.
- Calendar write permission must be granted before creating or editing events.
- Notification delivery permission must be granted before push or local notification delivery.

## Privacy And Provenance Constraints

Live mode must preserve the current provenance fields: source, source label, evidence ids, collected/recorded time, generation method, confirmation id, provider kind, and explicit confirmation status. It must also preserve the relationship context carried by the mock contract: contact label, event label, connection origin, follow-up rationale, and source context ids. Every participant-facing action must pass explicit confirmation before any side effect. Audit records must state whether a side effect executed, which provider was requested, which evidence justified the action, and which relationship context made the action sensible. Do not store raw message bodies, calendar descriptions, or notification text unless the user explicitly confirms retention.

## Replacement Tests

Replacement tests must cover:

- Mock mode still returns deterministic success, empty, pending, and controlled failure states.
- Live factory switch rejects unknown `ORBIT_EXTERNAL_ACTION_SANDBOX_PROVIDER` values.
- Live message, calendar, and notification adapters are never called without explicit confirmation.
- Successful live sends, calendar writes, and notification deliveries create durable side-effect audit records with privacy and provenance fields.
- Live audit records retain the relationship context that justified the action instead of reducing it to a provider-only log.
- Provider failures return API failure envelopes without retrying hidden external side effects.

# Actions Queue Live Implementation

This capability is the Actions module's queue boundary. The code path still
uses `agent` names for compatibility, while product documents refer to the
module as Actions.

## Live Service And Provider Files

- `features/agent/live-service.ts` implements the `AgentActionQueueService`
  interface with async-compatible live reads and guarded decision writes.
- `features/agent/storage/agent-action-live-record-provider.ts` maps shared
  `orbit_records` rows from `agentActions`, `contacts`, `connections`,
  `evidence`, `matchRecommendations`, and `networkPeople` into the queue
  contract.
- `features/agent/service-factory.ts` registers the live service behind
  `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`.

## Current Live Behavior

- `GET /api/agent/actions` reads generated `agentActions` from shared live
  storage and enriches them with recommendation/person context when available.
- `POST /api/agent/actions/:id/accept` updates the matching live action status
  to `approved`.
- `POST /api/agent/actions/:id/dismiss` updates the matching live action status
  to `rejected`.
- The decision write only updates the queue record. It does not send messages,
  create calendar events, deliver notifications, call an AI provider, access a
  device, or execute an external action.

## Switch Mechanism

- `ORBIT_MODULE_MODE=mock` keeps deterministic fixtures active.
- `ORBIT_MODULE_MODE=hybrid` keeps the existing local-remote action queue.
- `ORBIT_MODULE_MODE=live` reads and updates the configured shared live store.
- The live store is configured by `ORBIT_EVENT_DATABASE_URL`,
  `ORBIT_LIVE_DATABASE_URL`, or `ORBIT_DATABASE_URL`, plus optional
  `ORBIT_WORKSPACE_ID`.

## Privacy And Provenance Constraints

- Every live action keeps source references and evidence ids for the context
  that produced it.
- Live provenance explicitly reports database reads and queue decision writes.
- External send, calendar write, notification delivery, AI provider calls,
  external network calls, and device access remain false.
- Sensitive actions remain two-step: queue suggestion first, separate explicit
  execution confirmation later.

## Replacement Tests

- `tests/capabilities/agent-action-queue-live-store.test.ts` proves the live
  service reads generated action records, filters by action type, accepts and
  dismisses queue items through shared live storage, and keeps external side
  effects disabled.
- `tests/capabilities/agent-action-queue-mock.test.ts` preserves the mock API
  envelopes and debug surface.
- API validation should exercise `/api/agent/actions` and the accept/dismiss
  routes in live mode before product pages consume the provider directly.

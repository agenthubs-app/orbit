# App Actions route live handoff

Sprint 67 composes the current legacy route `/app/agent` from approved mock-first services for the
Actions queue, autonomy settings, sensitive-action confirmation guard,
external action sandbox, and notification queue. The page uses the route-owned
adapter in this folder; nested UI does not import raw fixtures.

Product and architecture documents now call this module Actions. The current
route, folder names, service names, and API paths still use `agent` for
compatibility until a separate route/symbol migration is planned.

## Evaluator Evidence Summary

- `app/(app)/app/agent/page.tsx` resolves search params and delegates composed
  states to `AppAgentCommandCenter`.
- `agent-service-factory.ts` owns the service switch for action queue,
  settings, confirmation, sandbox, and notification services through
  `createModuleServiceFactory`.
- `agent-command-center.tsx` renders success, empty, pending, and failure route
  state checks, route recovery actions, and the local review action with
  `data-action-evidence="agent-review-top-action-local-preview"`.
- The local review action calls mock services and reports
  `data-side-effects="none"`; no message, notification, calendar event, stored
  relationship update, production audit write, or external network call is made.
- Visible route copy uses relationship-facing labels for evidence and queue
  items. Raw evidence ids and queue entry ids remain in `data-*` attributes and
  API envelopes for audit/provenance checks rather than appearing as page copy.

Live files:

This section covers live service/provider files.

- `features/agent/live-service.ts` for the live Actions queue.
- `features/agent/agent-action-queue-mock/live-service.ts` for a capability
  specific action queue replacement if the provider remains split by sprint.
- `features/agent/agent-autonomy-settings-mock/live-service.ts` for persisted
  autonomy settings.
- `features/permissions/sensitive-action-confirmation-guard/live-service.ts`
  for durable confirmation requirements and decisions.
- `features/agent/external-action-sandbox-mock/live-service.ts` for audited
  external action no-op and send handoff behavior.
- `features/notifications/reminder-schedule-and-notification-mock/live-service.ts`
  for notification queue and reminder delivery handoff.
- `app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-service-factory.ts`
  remains the page switch point.

Switch:

Switch mechanism: keep the page behind the route service factory.

- Keep the page importing `createAppAgentRouteServices`.
- Register `hybrid` or `live` constructors in `agent-service-factory.ts` next to
  the current mock constructors.
- Drive the switch with `ORBIT_MODULE_MODE` or `ORBIT_FEATURE_MODE`, matching the
  shared module-mode contract.
- Keep `/api/agent/actions`, `/api/agent/settings`, `/api/notifications`,
  `/api/confirmations/[id]/approve`, `/api/confirmations/[id]/reject`,
  `/api/sandbox/external-actions/audit`, and
  `/api/sandbox/external-actions/send-message` as the HTTP evidence surfaces.

Env and permissions:

Required env vars or permissions:

- Supabase or durable app storage URL, service role, row-level security policy,
  and migration permission for contact, connection, task, notification,
  confirmation, and action queue tables.
- Auth/session permission so each action queue item and confirmation decision is
  tied to the current user and organization.
- AI provider key, model allowlist, prompt logging policy, and retention policy
  before action ranking or writing assistance can use a real model.
- Email/message provider permission for sending participant-facing messages.
- Calendar provider permission for scheduling or updating events.
- Notification provider permission for push, email, SMS, and in-app delivery.
- Production audit log write permission for confirmation decisions and external
  action attempts.

Privacy and provenance:

Privacy/provenance constraints:

- Every action, setting, confirmation, send check, and notification queue entry
  must keep source labels, evidence ids, actor id, tenant id, collected time, and
  provider record ids.
- Product UI should continue to translate those ids into readable relationship
  labels while retaining exact ids in attributes, audit logs, API responses, and
  persisted records.
- Participant-facing sends require explicit confirmation and must pass through
  the confirmation guard before the sandbox can hand off to a real provider.
- External action records must state whether an effect was requested, executed,
  suppressed, or rolled back.
- Private chat, email, calendar, and relationship notes cannot be shown to an AI
  provider or message provider unless consent and scope are recorded.
- Failure states must fail visibly with recovery actions; they must not retry
  sending, scheduling, delivery, storage writes, device access, or external
  network calls automatically.

Replacement tests:

- Keep `tests/pages/app-agent-page.test.tsx` asserting the page heading, one
  relationship datum, one local action result, route state checks, route
  recovery actions, API success envelopes, adapter imports, live handoff,
  readable evidence labels, hidden raw ids, and `data-action-evidence`.
- Add service tests for `hybrid` and `live` modes proving the same DTO shapes as
  the mock contracts.
- Add API tests for success, empty, pending, and controlled failure states on
  `/api/agent/actions`, `/api/agent/settings`, and `/api/notifications`.
- Add confirmation and external action tests proving no external effect can run
  until a durable confirmation decision exists.
- Add privacy tests covering evidence ids, actor ownership, tenant isolation,
  redaction, and provider opt-in.

# Compose App From Approved Mock Capabilities: Live Handoff

## Current Mock Boundary

`/app` is composed in `app/(app)/compose-app-from-previously-approved-mock-first-capabilities/app-workbench.tsx`.
The route reads approved mock service factories for app bootstrap, profile,
events, followup tasks, dashboard, reminder notifications, and agent actions.
It does not import raw fixture files into nested UI components and it exposes
the route action as a submitted focus-queue preview with no external side
effects. The default workspace renders one product status at a time: the
success workspace at `/app`, the focus-queue result after `?taskLimit=1`, and
the empty, pending, or failure state boundary after `?scenario=empty`,
`?scenario=pending`, or `?scenario=failure`.

## Live Service/Provider Files

Live service/provider files should replace the mock factories behind the
existing service interfaces instead of changing the route UI:

- `features/bootstrap/live-service.ts`
- `features/profile/live-service.ts`
- `features/events/live-service.ts`
- `features/followups/live-service.ts`
- `features/dashboard/live-service.ts`
- `features/notifications/live-service.ts`
- `features/agent/live-service.ts`
- shared runtime selection in `shared/services/module-mode.ts` and
  `shared/services/capability-registry.ts`

## Switch Mechanism

The switch mechanism should keep `/app` importing a route adapter while the
adapter obtains services from the shared service factory/registry. Mock mode
continues to use deterministic local factories. Live mode should be selected by
the existing feature-mode/module-mode boundary and route through live service
factories that implement the same typed contracts.

## Required Env Vars Or Permissions

Required env vars or permissions for live mode:

- Supabase project URL, anon key, service role key, and auth/session settings
  for account, profile, event, task, dashboard, notification, and agent data.
- Calendar permission before calendar-derived event readiness or followup
  timing changes the bootstrap aggregate.
- Email permission before email relationship signals affect profile, tasks, or
  dashboard summaries.
- Notification permission before reminders can queue or deliver live
  notifications.
- AI provider key only after a confirmed AI boundary is approved for summaries,
  recommendations, drafts, or agent reasoning.

## Privacy/Provenance Constraints

Privacy/provenance constraints must remain visible on every aggregate:

- Every profile, event, task, dashboard item, notification, and agent action
  keeps source references and evidence ids.
- The route must show whether external network, database, AI, calendar, email,
  notification, device, and external side-effect work executed.
- Sensitive agent actions continue through confirmation guards or the external
  action sandbox before any live send, write, or delivery.
- Live errors must return the shared API envelope and avoid leaking private raw
  provider payloads.

## Replacement Tests

Replacement tests should cover:

- `/app` rendering success, empty, loading, and failure states from the live
  service registry with the same route state boundary, including promised
  App Router `searchParams`.
- `GET /api/app/bootstrap` returning the shared success and failure envelopes in
  mock and live modes.
- The focus-queue action proving no external side effects in mock mode and
  requiring explicit confirmation before live side effects.
- Permission-gated live calendar, email, notification, and AI paths.
- Provenance preservation for one profile datum, one event datum, one task, one
  dashboard metric, one notification, and one agent action.

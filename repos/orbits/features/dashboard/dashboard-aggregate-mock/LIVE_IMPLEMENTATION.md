# Dashboard Aggregate Mock-to-Live Handoff

This sprint keeps the dashboard aggregate mock-first. The current mock boundary
is deterministic and fixture-backed so product routes can later compose stable
relationship asset totals, new contacts, high-value count, pending followups, dormant contacts, and recent activity without depending on production analytics.

Current mock files:

- `features/dashboard/contract.ts`
- `features/dashboard/service.ts`
- `features/dashboard/mock-service.ts`
- `app/api/dashboard/route.ts`
- `app/api/dashboard/summary/route.ts`
- `features/dashboard/dashboard-aggregate-mock/debug-view.tsx`

## Live Service And Provider Files

- Keep `features/dashboard/contract.ts` as the stable DTO and error contract
  unless the dashboard aggregate product contract changes.
- Keep `features/dashboard/service.ts` as the service interface boundary.
- Keep `features/dashboard/mock-service.ts` as the harness and development mock.
- Add `features/dashboard/dashboard-aggregate-mock/live-service.ts` for the
  live implementation. It should implement `DashboardAggregateService`.
- Add live adapters under
  `features/dashboard/dashboard-aggregate-mock/providers/` for analytics query
  execution, production materialized aggregate reads, relationship evidence
  normalization, and source permission checks.
- Route handlers under `app/api/dashboard/**` should select a service through a
  small factory and keep returning the shared API envelope:
  `{ success: true, data }` or `{ success: false, error }`.

## Switch Mechanism

Use an environment switch named `ORBIT_DASHBOARD_AGGREGATE_PROVIDER`.

- `mock`: use `createMockDashboardAggregateService()`.
- `live`: use the live implementation in
  `features/dashboard/dashboard-aggregate-mock/live-service.ts`.
- `hybrid`: read approved live aggregate inputs where permissions exist, but
  fall back to deterministic mock output for missing sources.

Mock remains the default. Live mode must return a controlled not-implemented or
provider-unavailable failure until every provider file, permission check, and
replacement test listed here exists. The switch belongs in a service factory,
not in product pages or the `/dev/capabilities/dashboard-aggregate-mock` UI.

## Required Env Vars And Permissions

- `ORBIT_DASHBOARD_AGGREGATE_PROVIDER`: selects `mock`, `hybrid`, or `live`.
- Analytics warehouse credentials: required only when live analytics query
  execution is enabled.
- Production aggregate store credentials: required only when materialized
  aggregate reads are enabled.
- Relationship data store credentials: required only for live contact,
  connection, followup, dormant-contact, and evidence retrieval.
- calendar permission: required before calendar-derived activity can influence
  recent activity or dormant-contact calculations.
- email permission: required before email-derived relationship signals can
  influence new contacts, pending followups, or recent activity.
- Notification or external-action permission: required only if a dashboard
  recommendation becomes an executable action. The aggregate itself must not
  send messages or deliver reminders.

## Privacy And Provenance Constraints

- privacy and provenance must stay attached to every dashboard aggregate
  payload and summary metric.
- Every metric must preserve source evidence ids, collection time, generation
  method, source label, and whether an analytics query or materialized aggregate
  was used.
- Live aggregation must not silently use email, calendar, chat, event, or
  notification data without the matching permission.
- Dashboard next actions remain suggestions until a separate confirmation guard
  approves any sensitive external action.
- Empty, pending, and controlled failure states must remain visible API
  envelopes so clients can render them without guessing.

## Replacement Tests

Replace or extend `tests/capabilities/dashboard-aggregate-mock.test.ts` when the
live implementation lands.

replacement tests must cover:

- Mock mode still returns the deterministic fixture payload.
- Live mode returns the same relationship asset totals, new contacts,
  high-value count, pending followups, dormant contacts, and recent activity
  shape.
- The summary route keeps the same metric ids and API envelope.
- Empty state when no sourced relationship data is available.
- Pending state when permissions, aggregate refresh, or provider readiness are
  unresolved.
- Controlled failure paths for analytics query failures, production materialized
  aggregate failures, permission-denied calendar input, permission-denied email
  input, and unavailable relationship evidence.
- privacy and provenance assertions for source evidence on every aggregate and
  summary metric.
- Mock guard tests proving the mock service still performs no live provider,
  analytics query, production materialized aggregate, database, calendar, email,
  notification, device, network, or AI work.

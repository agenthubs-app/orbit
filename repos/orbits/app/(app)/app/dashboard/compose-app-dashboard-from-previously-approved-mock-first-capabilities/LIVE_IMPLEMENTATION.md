# Compose App Dashboard Mock-to-Live Handoff

This route composes `/app/dashboard` from approved dashboard, network
distribution, opportunity reminder, and source provenance audit capabilities.
The route adapter consumes services through `dashboard-service-factory.ts`;
nested UI components do not import raw fixtures.

## Evaluator Evidence Summary

- Success route: `/app/dashboard` calls `loadAppDashboardRouteViewModel()`,
  maps the success payload through `dashboardRouteToOrbitDashboardViewModel()`,
  and renders `OrbitRealDashboard`.
- The product dashboard shows summary metrics, a recommended next move,
  coverage gaps, industry concentration, source readiness counts, and recent
  sourced activity without rendering command-center evidence accordions or
  technical provenance details.
- Route state checks: `/app/dashboard?scenario=empty`,
  `/app/dashboard?scenario=pending`, and `/app/dashboard?scenario=failure`
  render `data-state-boundary="shared-ui-state-view"` with route recovery
  actions.
- Core action: `/app/dashboard?action=run-dashboard-review` renders
  `data-action-evidence="dashboard-run-review-local-preview"` and
  `data-side-effects="none"` after local opportunity recompute and provenance
  audit review when using the retained command-center/debug surface.
- The recommended next move remains a route adapter composition of the
  opportunity and network gap DTOs; it does not write tasks, send messages, or
  trigger outside delivery from the page.
- API evidence: `/api/dashboard`, `/api/dashboard/distributions`,
  `/api/dashboard/network-gaps`, and `/api/dashboard/opportunities` remain the
  source envelopes for the route.

## Live files:

This section lists the live service/provider files for replacing the current
route services.

- Keep `app/(app)/app/dashboard/page.tsx` as the route shell.
- Keep `app/(app)/app/dashboard/orbit-real-dashboard.tsx` as the product UI.
- Keep `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-view-model-adapter.ts`
  as the route-to-product view-model adapter.
- Keep `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-command-center.tsx`
  as a retained command-center/debug surface, not the default page entry.
- Keep `app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory.ts`
  as the route service selector.
- Add live dashboard aggregate implementation under
  `features/dashboard/dashboard-aggregate-mock/live-service.ts` or a renamed
  capability folder once the existing capability contract moves out of mock-only
  status.
- Add live network distribution implementation under
  `features/dashboard/network-distribution-analytics-mock/live-service.ts`.
- Add live opportunity reminder implementation under
  `features/dashboard/opportunity-reminder-analytics-mock/live-service.ts`.
- Add live provenance audit implementation under
  `features/audit/source-consistency-and-provenance-audit/live-service.ts`.
- API route handlers under `app/api/dashboard/**` and
  `app/api/audit/provenance/**` should continue returning the shared API
  envelope.

## Switch:

The switch mechanism is the route service factory resolving either the current
local services or future connected services.

- Register `live` implementations in `dashboard-service-factory.ts` through
  `createModuleServiceFactory`.
- Keep `mock` as the default until every live dependency has replacement tests.
- Use `ORBIT_MODULE_MODE=live` or a route-specific provider switch such as
  `ORBIT_DASHBOARD_PROVIDER=live` only after the service factories can resolve
  all four live services.
- If one service has no live implementation, the route must fail visibly instead
  of mixing partial live results with local review data.

## Env and permissions:

The required env vars or permissions must be owned by capability services, not
by nested page UI.

- Dashboard aggregate live reads require approved relationship, contact, event,
  task, evidence, and recency data access.
- Network distribution live reads require graph analytics or relationship
  warehouse permissions, plus any vector/search index permission used by the
  approved distribution provider.
- Opportunity analytics live reads require current goal, relationship value,
  follow-up, event, referral, and signal permissions.
- Provenance audit live reads require source reference, evidence, task,
  recommendation, chat summary, and agent action permissions.
- No email, calendar, notification, external message, or AI permission may be
  requested by the page itself. Those permissions must remain inside capability
  services and their confirmation or privacy guards.

## Privacy and provenance:

These privacy/provenance constraints apply before the route can move beyond the
current local review path.

- Every summary metric, distribution bucket, gap, opportunity, recent activity,
  and warning must keep source/evidence ids in the service DTOs. The default
  product dashboard may summarize this into user-facing readiness counts instead
  of rendering raw evidence ids or technical provenance accordions.
- The route must not render provider secrets, raw credentials, private message
  bodies, or unaudited external identifiers.
- The action preview must remain side-effect free until live confirmation flows
  exist. Live implementations must explicitly record whether audit reports,
  notifications, messages, analytics jobs, or storage writes occurred.
- The recommended next move must continue to expose its source evidence and stay
  read-only until a confirmation guard owns task creation, messaging, or any
  other saved workflow.
- Provenance warnings must block or downgrade action prompts when required
  evidence is incomplete.

## Replacement tests:

- Keep `tests/pages/app-dashboard-live-route-services.test.ts` focused on the
  live service bundle, controlled unconfigured-storage failure, real dashboard
  route adapter, and absence of command-center provenance accordions in the
  default success UI.
- Add live service tests for success, empty, pending, and failure states for all
  four composed services.
- Add action replacement tests proving dashboard review either remains preview
  only or routes through a confirmation guard before any write or external
  delivery.
- Add API replacement tests proving `{ success: true, data }` and
  `{ success: false, error }` envelopes remain stable for dashboard and audit
  routes.

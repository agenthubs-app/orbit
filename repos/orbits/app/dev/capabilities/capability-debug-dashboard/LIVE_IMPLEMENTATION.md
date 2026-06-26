# Capability Debug Dashboard Live Implementation

## Live service and provider files

- `app/dev/capabilities/capability-debug-dashboard/live-service.ts` will implement the same `CapabilityDebugDashboardService` interface exported from `service.ts`.
- `app/dev/capabilities/capability-debug-dashboard/providers/admin-observability-provider.ts` will adapt approved production admin observability reads into the typed dashboard DTOs.
- `app/dev/capabilities/capability-debug-dashboard/providers/capability-registry-provider.ts` will read live capability health, scenario health, API probe status, and reset-control availability.
- `app/dev/capabilities/capability-debug-dashboard/service-factory.ts` will choose between `createMockCapabilityDebugDashboardService` and the live service.

## Switch mechanism

- Keep mock mode as the default.
- `ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER=mock` uses deterministic fixtures.
- `ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER=live` may resolve the live provider only after replacement tests and privacy review pass.
- No product route should import the dev page. Product routes may consume the typed service boundary later.

## Required env vars and permissions

- `ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER`
- `ORBIT_ADMIN_OBSERVABILITY_ENDPOINT`
- `ORBIT_ADMIN_OBSERVABILITY_TOKEN`
- Admin read permission for capability health and route health.
- Observability read permission for API probe status and reset-control availability.

## Privacy and provenance constraints

- The live provider must not expose raw relationship content, message bodies, email content, calendar event content, or notification payloads.
- Every capability row, scenario row, API probe, and reset control must carry source and evidence provenance.
- Sensitive reset controls must stay behind confirmation guards and must log the operator, source, and evidence id before execution.
- Failure states must use the API envelope and must not leak provider credentials or raw observability responses.

## Replacement tests

- Contract tests must cover success, empty, pending, and controlled failure states.
- Service tests must prove live mode does not call providers unless `ORBIT_CAPABILITY_DEBUG_DASHBOARD_PROVIDER=live` is explicitly set.
- Route and rendering tests must cover all declared API probes: `/api/app/bootstrap`, `/api/mock/scenarios`, and `/api/audit/provenance`.
- Replacement tests must prove admin read permission and observability read permission are required before live status appears.
- Mock provider guard tests must remain in place until the live provider has parity for success, empty, pending, controlled failure, privacy, provenance, and reset-control confirmation behavior.

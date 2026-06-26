# App Bootstrap Mock Aggregator Live Implementation

## Live Service And Provider Files

- `features/bootstrap/app-bootstrap-mock-aggregator/live-service.ts` should implement `AppBootstrapService` from `features/bootstrap/service.ts`.
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/account-provider.ts` should read the authenticated account and workspace context.
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/profile-provider.ts` should read the profile summary and manual profile preferences.
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/event-provider.ts` should read upcoming event readiness records.
- `features/bootstrap/app-bootstrap-mock-aggregator/providers/relationship-provider.ts` should run the approved live database aggregation for connection summary, pending tasks, top agent actions, dashboard summary, permission summary, and notification summary.

## Switch Mechanism

Use `ORBIT_APP_BOOTSTRAP_PROVIDER=mock|live` behind the existing feature-mode guard. Mock mode must keep using `createMockAppBootstrapService`; live mode may resolve the live service only after provider files, permissions, and replacement tests exist. Hybrid mode should prefer mock data for any field whose live provider is missing rather than silently dropping provenance.

## Required Env Vars And Permissions

- `ORBIT_APP_BOOTSTRAP_PROVIDER`
- Auth/session provider configuration for the live account read.
- Database connection variables for the live database aggregation.
- Calendar permission before calendar-derived upcoming events or readiness can affect the bootstrap.
- Email permission before email relationship signals can affect tasks, agent actions, or connection summary.
- Notification permission before notification summary can include live pending deliveries.

## Privacy And Provenance Constraints

Every first-screen account, profile, upcoming events, connection summary, pending tasks, top agent actions, dashboard summary, permission summary, and notification summary field must carry source or evidence provenance. The live service must never infer relationship context without attaching source references or evidence ids. Server-side personalization and live database aggregation must be visible in provenance flags so evaluators can tell the live path ran. Sensitive actions in top agent actions must remain confirmation-required and route through the confirmation guard before any external side effect.

The live service must not copy mock-only evidence ids into production data. Empty, pending, and controlled failure states must remain explicit API envelopes instead of being hidden behind partial success payloads.

## Replacement Tests

- Replace the mock provider guard tests with tests proving `ORBIT_APP_BOOTSTRAP_PROVIDER=mock` still performs no network, database, AI, calendar, email, notification, or device calls.
- Add live service tests for success, empty, pending, and controlled failure envelopes.
- Add contract tests that the live service returns the same top-level DTO fields as the mock: first-screen account, profile, upcoming events, connection summary, pending tasks, top agent actions, dashboard summary, permission summary, and notification summary.
- Add permission tests proving calendar permission, email permission, and notification permission gate the relevant live fields.
- Add provenance tests proving every aggregate field includes evidence ids or source references.

# Shared Mock Runtime Live Implementation Notes

## Current Mock Boundary

Sprint 6 provides the shared mock runtime in `shared/mock/registry.ts`,
`shared/mock/state-store.ts`, and `shared/mock/fixtures.ts`. Capability pages
and route handlers should consume fixture variants through service factories,
not by importing raw fixture objects into nested UI components.

## Live Service And Provider Files

Replace the mock registry behind future capability service factories. The live
providers should live beside their capability services, for example:

- `shared/account/account-service.ts` and `shared/account/live-account-provider.ts`
- `shared/events/event-service.ts` and `shared/events/live-event-provider.ts`
- `shared/contacts/contact-service.ts` and `shared/contacts/live-contact-provider.ts`
- `shared/signals/signal-service.ts` and `shared/signals/live-signal-provider.ts`
- `shared/dashboard/dashboard-service.ts` and `shared/dashboard/live-dashboard-provider.ts`
- `shared/agent/agent-service.ts` and `shared/agent/live-agent-provider.ts`
- `shared/notifications/notification-service.ts` and `shared/notifications/live-notification-provider.ts`

Each live provider must return the shared DTOs from `shared/domain/contracts.ts`
or capability-specific DTOs that preserve the same source and evidence
provenance guarantees.

## Switch Mechanism

Use `resolveFeatureMode()` from `shared/config/feature-mode.ts` inside each
service factory. In `mock` mode, create state from `getMockFixtureVariant()`.
In `hybrid` mode, compare live provider output against mock DTO validation
without exposing live-only payloads in UI. In `live` mode, call the provider only
after required configuration and permissions are present. The only runtime
switch is `ORBIT_FEATURE_MODE`, read through `resolveFeatureMode()`; do not
branch on raw environment strings.

## Required Env Vars Or Permissions

Live mode will require provider-specific configuration before it can replace the
mock runtime:

- Supabase or account database URL and service credentials for account/profile data.
- OAuth client id, client secret, redirect URL, and scopes for email/calendar signals.
- Event source API credentials or import permissions for attendee rosters.
- Notification provider API key and sender configuration for delivery.
- AI provider key, model allowlist, and prompt logging policy for agent actions.

No real API key or token should be stored in fixtures, tests, docs, or client
bundles.

## Privacy And Provenance Constraints

Live providers must preserve `source`, `evidenceIds`, evidence `sourceType`,
`sourceId`, `confidence`, `occurredAt`, and `createdBy` values. Sensitive
payloads from email, calendar, chat, AI prompts, and external actions must be
stored behind explicit permission checks and exposed only as minimal summaries
needed by the current user workflow. External sends, reminders, intros, and
notification delivery must continue through confirmation guards.

## Replacement Tests

Before switching a capability from mock to live, add tests that prove:

- Mock and live providers return the same envelope and DTO contract shapes.
- Every live contact, connection, task, dashboard item, notification, and agent
  action references existing evidence.
- Permission-denied and missing-configuration cases fail visibly with a safe
  error envelope.
- Hybrid mode validation catches provenance loss before live data reaches pages.
- Confirmation-required agent and notification actions cannot bypass the guard.

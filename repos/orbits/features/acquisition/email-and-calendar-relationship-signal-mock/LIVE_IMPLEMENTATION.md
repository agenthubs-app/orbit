# Email And Calendar Relationship Signal Mock Live Implementation

## Current Mock Boundary

Sprint 22 ships a mock-first boundary for email and calendar relationship
signals. The reusable contract is `features/acquisition/email-calendar-contract.ts`,
the deterministic service is `features/acquisition/mock-email-calendar-service.ts`,
and the debug surface is
`features/acquisition/email-and-calendar-relationship-signal-mock/debug-view.tsx`.

The mock replaces Gmail, Google Calendar, Microsoft Graph, background sync, and
message body ingestion with local fixtures and rule-based filtering. It never
contacts provider APIs, device calendars, mailboxes, databases, notification
services, or model providers.

## Live Service And Provider Files

Introduce live code beside this document so the product route can switch
providers without importing debug UI:

- `features/acquisition/email-and-calendar-relationship-signal-mock/live-service.ts`
  should implement `EmailCalendarSignalService` from
  `features/acquisition/email-calendar-contract.ts`.
- `features/acquisition/email-and-calendar-relationship-signal-mock/providers/gmail-provider.ts`
  should adapt Gmail metadata reads into `EmailCalendarRelationshipSignal`
  objects.
- `features/acquisition/email-and-calendar-relationship-signal-mock/providers/google-calendar-provider.ts`
  should adapt Google Calendar event metadata into relationship signals.
- `features/acquisition/email-and-calendar-relationship-signal-mock/providers/microsoft-graph-provider.ts`
  should adapt Microsoft Graph mail and calendar metadata into relationship
  signals.
- `features/acquisition/email-and-calendar-relationship-signal-mock/provider-factory.ts`
  should choose mock or live implementations and keep route handlers unchanged.

## Switch Mechanism

Use `ORBIT_EMAIL_CALENDAR_SIGNAL_PROVIDER` as the explicit provider switch.
Allowed values should be `mock` and `live`. The default must remain `mock` for
Milestone C and for harness runs.

The route handlers should continue to depend on the
`EmailCalendarSignalService` interface. The only switch should happen in a
factory module, not in page components or API route business logic.

## Required Environment And Permissions

Live mode requires provider credentials and scoped user consent before any
metadata read:

- Gmail: client id, client secret, redirect URI, token storage boundary, and a
  metadata-only mail scope.
- Google Calendar: client id, client secret, redirect URI, token storage
  boundary, and an event metadata scope.
- Microsoft Graph: application id, tenant configuration, redirect URI, token
  storage boundary, and least-privilege mail and calendar metadata scopes.

Message body ingestion must stay disabled unless a future sprint adds a
separate consent and minimization contract. Background sync must also remain a
separate permissioned capability, not a side effect of this boundary.

## Privacy And Provenance Constraints

Every live `EmailCalendarRelationshipSignal` must preserve source, evidence,
permission, confirmation, and provenance fields from the sprint contract.
Provider adapters may store metadata needed to explain why a relationship signal
exists, but they must not silently ingest message bodies or full calendar notes.
The privacy boundary is metadata-first and must stay visible in each signal's
provenance.

Sensitive conversion remains confirmation-gated. A confirmed signal can become
evidence for a later relationship action, but the confirmation route must not
send messages, write contacts, enqueue notifications, or perform external
actions by itself.

Failures must use the shared API envelope and include the provider, permission
state, and provenance reason without exposing tokens, message bodies, or private
calendar descriptions.

## Replacement Tests

Before switching `ORBIT_EMAIL_CALENDAR_SIGNAL_PROVIDER=live`, add replacement
tests that cover:

These replacement tests must run against the live provider factory with network
access mocked or sandboxed at the provider adapter boundary.

- Successful list envelopes for Gmail, Google Calendar, and Microsoft Graph
  metadata signals.
- Successful confirmation for a calendar signal with explicit user confirmation.
- Empty state when permission exists but no qualifying metadata rows are found.
- Pending state while provider permission or review is incomplete.
- Blocked confirmation when user confirmation has not been supplied.
- Not-found confirmation for unknown signal ids.
- Provider failure mapping for Gmail, Google Calendar, and Microsoft Graph.
- Privacy checks proving message body ingestion, background sync, notification
  delivery, and relationship writes do not occur in the list or confirm routes.

# On-site Want-to-connect Live Replacement

This capability now has a generated live-storage provider for on-site
want-to-connect context. The current live path is deterministic and must not
call real-time presence, peer notification, external messaging, calendar, email,
notification, or model services.

## Current Live Service Files

- `features/events/want-connect/live-service.ts` will implement
  the live `WantConnectService` contract from
  `features/events/want-connect/contract.ts`.
- `features/events/want-connect/storage/generated-want-connect-live-record-provider.ts`
  reads generated event attendee roster context and stages recorded intent to
  the `event_want_connect` work collection.
- `features/events/service-factory.ts` selects the generated live provider when
  `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`.

## Reserved External Provider Boundary

- `features/events/want-connect/providers/` will contain the
  provider adapters for real-time presence, peer notification delivery, and the
  external messaging sandbox.
- `features/events/want-connect/provider-factory.ts` will select
  external providers without changing route handlers or product pages when that
  boundary is implemented.
- Real-time presence, peer notification, and external messaging are not executed
  by the current generated live storage path.

## Switch Mechanism

`ORBIT_WANT_CONNECT_PROVIDER` is the legacy provider-specific switch name kept
for the replacement handoff.

- `mock`: use `createMockWantConnectService`.
- `live`: use `live-service.ts`; current runtime selection is controlled by
  `ORBIT_MODULE_MODE=live` or `ORBIT_FEATURE_MODE=live`.
- Any unknown value must fail closed to the mock or return a typed
  `SERVICE_UNAVAILABLE` envelope until live configuration is verified.

## Required Environment Variables

Current live storage requires these required environment variables:

- `ORBIT_EVENT_DATABASE_URL`
- `ORBIT_WORKSPACE_ID`

Future real-time and messaging providers require these required environment
variables:

- `ORBIT_WANT_CONNECT_PROVIDER=live`
- `ORBIT_PRESENCE_PROVIDER_URL`
- `ORBIT_PRESENCE_PROVIDER_KEY`
- `ORBIT_PEER_NOTIFICATION_PROVIDER_URL`
- `ORBIT_PEER_NOTIFICATION_PROVIDER_KEY`
- `ORBIT_EXTERNAL_MESSAGE_SANDBOX_URL`
- `ORBIT_EXTERNAL_MESSAGE_SANDBOX_KEY`

## Required Permissions

Current live storage requires explicit permissions before any write:

- event workspace write permission for the active event;
- operator confirmation before any follow-up action is triggered;
- audit permission to write source evidence and provider response metadata.

Future real-time and messaging providers require explicit permissions before any
provider call:

- event participant visibility permission for the active event;
- real-time presence subscription permission scoped to the event;
- peer notification permission for both participants;
- external messaging sandbox permission plus user confirmation before sending;

## Privacy And Provenance Constraints

Every live intent, mutual-interest state, and match success notice must preserve
the source fields and evidence ids in `WantConnectPayload` and
`WantConnectMatchesPayload`. Live providers may enrich only the fields owned by
the contract; they must not add untyped participant data or hide provider
failures behind success payloads.

The live service must keep these privacy constraints:

- never expose another attendee's private presence state without an event-scoped
  permission check;
- never deliver peer notification or external messaging without explicit user
  confirmation;
- record whether real-time presence, peer notification, external messaging, live
  database, calendar, email, notification, or model work was requested;
- keep provider request ids, timestamps, and source labels in provenance or
  evidence records for later audit.
- current generated live storage must keep `realtimePresenceRequested`,
  `peerNotificationDelivered`, `externalMessageSent`,
  `notificationProviderRequested`, and `modelProviderRequested` false unless
  those providers are explicitly wired later.

## Replacement Tests

Replacement tests must cover:

- `tests/capabilities/want-connect-live-generated-store.test.ts` proves live
  mode can generate on-site match context from remote attendee data and persist
  operator intent without external side effects;
- mock and live provider factory switching through `ORBIT_WANT_CONNECT_PROVIDER`;
- intent creation success with event-scoped provenance;
- match listing success with a match success notice;
- empty match list when no mutual interest exists;
- pending target interest without peer notification delivery;
- missing event and missing target validation envelopes;
- real-time presence provider failure mapped to `SERVICE_UNAVAILABLE`;
- peer notification provider failure mapped to `SERVICE_UNAVAILABLE`;
- external messaging sandbox blocked until confirmation;
- route handler envelopes for
  `POST /api/events/[id]/want-to-connect` and
  `GET /api/events/[id]/matches`;
- privacy assertions proving no unapproved attendee presence state or external
  message content appears in API responses.

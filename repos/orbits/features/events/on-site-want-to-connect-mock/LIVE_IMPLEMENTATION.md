# On-site Want-to-connect Mock Live Replacement

This sprint ships the mock boundary for on-site want-to-connect intent. The
current implementation is deterministic and must not call real-time presence,
peer notification, external messaging, database, calendar, email, notification,
or model services.

## Live Service Files

- `features/events/on-site-want-to-connect-mock/live-service.ts` will implement
  the live `WantConnectService` contract from
  `features/events/want-connect-contract.ts`.
- `features/events/on-site-want-to-connect-mock/providers/` will contain the
  provider adapters for real-time presence, peer notification delivery, and the
  external messaging sandbox.
- `features/events/on-site-want-to-connect-mock/provider-factory.ts` will select
  mock or live providers without changing route handlers or product pages.

## Switch Mechanism

Use `ORBIT_WANT_CONNECT_PROVIDER` as the runtime switch.

- `mock`: use `createMockWantConnectService`.
- `live`: use `live-service.ts` and provider adapters.
- Any unknown value must fail closed to the mock or return a typed
  `SERVICE_UNAVAILABLE` envelope until live configuration is verified.

## Required Environment Variables

Live replacement requires these required environment variables:

- `ORBIT_WANT_CONNECT_PROVIDER=live`
- `ORBIT_PRESENCE_PROVIDER_URL`
- `ORBIT_PRESENCE_PROVIDER_KEY`
- `ORBIT_PEER_NOTIFICATION_PROVIDER_URL`
- `ORBIT_PEER_NOTIFICATION_PROVIDER_KEY`
- `ORBIT_EXTERNAL_MESSAGE_SANDBOX_URL`
- `ORBIT_EXTERNAL_MESSAGE_SANDBOX_KEY`

## Required Permissions

Live replacement requires explicit permissions before any provider call:

- event participant visibility permission for the active event;
- real-time presence subscription permission scoped to the event;
- peer notification permission for both participants;
- external messaging sandbox permission plus user confirmation before sending;
- audit permission to write source evidence and provider response metadata.

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

## Replacement Tests

Replacement tests must cover:

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

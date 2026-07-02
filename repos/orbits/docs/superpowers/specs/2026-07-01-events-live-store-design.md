# Events Live Store Design

## Goal

Events should support a first `live` mode for Orbit-owned event records without
turning the feature into a calendar synchronization system. This phase lets the
Events CRUD/import capability read, detail, and manually create real event
records through a live-store boundary.

## Scope

This design applies only to `event-crud-import`.

In scope:

- Register an explicit `live` implementation for the Events CRUD/import service
  factory.
- Add a live service that implements `EventCrudAndImportService`.
- Keep activity data mapped through the existing Events contract.
- Preserve provenance for source ids, evidence ids, provider labels, and
  database read/write execution.
- Fail visibly when the live store provider is not configured.

Out of scope:

- Google Calendar, Apple Calendar, event-platform, or organizer-feed sync.
- OAuth, provider tokens, recurrence expansion, calendar deduplication, and
  background sync.
- Live implementations for attendee roster, goal/readiness, encounter notes,
  want-to-connect, and post-event review.

## Domain Boundary

`Events Live Store` means Orbit's own event records. It is the live storage
boundary for events that already belong in Orbit.

`Calendar Provider Import` means bringing external calendar or event-platform
records into Orbit. It remains a later integration. That later flow may write
into the Events Live Store, but it is not the same capability.

## Runtime Behavior

`mock` remains deterministic fixture mode.

`hybrid` remains the local-remote database migration mode. It may read and write
the local database-shaped store, but it is not a real live provider.

`live` must be explicit. The Events CRUD/import service factory must register a
live constructor for `event-crud-import`; it must not rely on mock or hybrid
fallback. If live provider configuration is missing, the live constructor should
return a service that fails every operation with a controlled
`EVENTS_LIVE_STORE_UNCONFIGURED` failure.

## Contract Changes

The current Events contract uses `liveDatabaseWriteExecuted: false` to prove
mock and hybrid paths do not touch a live database. A live store must not lie
about this. The contract should allow database execution flags to be `boolean`
for Events CRUD/import records, imported records, and provenance.

Mock and hybrid implementations must keep returning `false`. Live read paths
should mark reads through provider-level provenance. Live manual creation should
mark `liveDatabaseWriteExecuted: true` only after the provider reports a
successful write.

## Files

- `features/events/event-crud-and-import/contract.ts`: allow live-store database execution flags and
  add a live-store configuration failure code.
- `features/events/event-crud-and-import/live-service.ts`: implement the
  live CRUD/import service and provider interface.
- `features/events/service-factory.ts`: register the live constructor only for
  `event-crud-import`.
- `tests/capabilities/event-crud-and-import-live-store.test.ts`: cover live
  factory resolution, unconfigured failure, fake live provider reads, writes,
  details, filters, and side-effect provenance.
- `features/events/DESIGN.md` and `docs/architecture/modules/events.md`:
  document the phase split between Events Live Store and Calendar Provider
  Import.

## Testing

Use TDD. The first failing test should prove `resolveEventCrudAndImportService`
does not yet support `live` for `event-crud-import`.

The replacement tests should prove:

- `live` is available for `event-crud-import`.
- Missing live-store configuration returns a controlled Events failure, not a
  thrown provider error and not mock data.
- A fake live provider can list events, get details, and create a manual event.
- Live manual creation sets `liveDatabaseWriteExecuted: true`.
- Calendar, organizer-feed, external-network, AI, email, and notification flags
  remain false.
- Other Events child capabilities do not accidentally become live.

## Later Work

Calendar Provider Import needs a separate design because it adds OAuth,
permissions, provider payload mapping, recurring events, deduplication,
background sync, and user consent. Its output can be written into Events Live
Store only after that import boundary has its own replacement tests.

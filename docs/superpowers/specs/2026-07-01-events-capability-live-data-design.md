# Events Capability Live Data Design

## Goal

Move Events from "mock-named folders with mock-only services" toward business
capabilities that own mock, hybrid, and live implementations. The migration runs
in three ordered stages: structural democking, live payload/provider skeletons,
then full live data links.

## Stage 1: Structural Democking

Rename event child capability directories to business names:

- `event-attendee-roster-mock` -> `attendee-roster`
- `event-goal-and-readiness-mock` -> `goal-readiness`
- `event-encounter-note-capture-mock` -> `encounter-note`
- `on-site-want-to-connect-mock` -> `want-connect`
- `post-event-contact-review-mock` -> `post-event-review`

Move each capability's root-level contract, fixtures, and mock service into the
capability directory as `contract.ts`, `fixtures.ts`, and `mock-service.ts`.
`mock` remains an implementation name; it should not appear in the capability
directory name.

## Stage 2: Live Payload And Provider Skeletons

Each capability gets a storage provider boundary and collection constants using
the shared `LiveRecord<TPayload>` envelope:

- `event_attendees`
- `event_attendee_import_batches`
- `event_goals`
- `event_encounter_notes`
- `event_want_connect_intents`
- `post_event_contact_drafts`
- `post_event_review_decisions`

Feature-specific fields live in `StorageXPayload`; shared identity, source,
evidence, lifecycle, timestamp, and search fields remain in the `LiveRecord`
envelope.

## Stage 3: Full Live Data Links

Add live services one capability at a time and register them in
`features/events/service-factory.ts`. In live mode, each service reads/writes
the relevant live records and returns the same feature contract result shape as
the mock implementation. Missing live configuration fails closed instead of
falling back to mock data.

Persistent event work records include event attendees, attendee import batches,
event goals, encounter notes, want-connect intents, post-event contact drafts,
and post-event review decisions. Computed views include readiness scores,
suggested checklists, recommendation eligibility, match results, summaries, and
follow-up suggestions.

## Boundary Rules

Events may store event work records and post-event contact drafts. Events must
not create formal contacts directly; confirmed contact creation continues
through Acquisition/Contacts.

Calendar Provider Import remains separate from Events Live Store. Calendar or
event-platform sync may populate event records later, but it does not own the
Events capability model.

## Verification

Each stage must preserve `npm run lint` and `npm test`. Live provider tests must
cover storage mapping, unconfigured failure behavior, and the guarantee that
computed views can be rebuilt from persisted live records.

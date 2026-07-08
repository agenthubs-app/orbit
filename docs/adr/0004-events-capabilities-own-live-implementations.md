# Events Capabilities Own Live Implementations

Events capabilities will be named for their business role rather than their
current mock implementation. `attendee-roster`, `goal-readiness`,
`encounter-note`, `want-connect`, and `post-event-review` are product
capabilities; mock, hybrid, and live are replaceable implementations under
those capabilities.

## Considered Options

- Keep `*-mock` capability directories and add live providers beside them. This
  is cheap but keeps teaching future code that the capability itself is a mock.
- Rename capabilities first, then add live storage providers. This separates
  boundary cleanup from data-link work and makes live implementations land in
  the correct place.
- Rename and fully live-wire all event capabilities in one pass. This reaches
  the target state fastest but changes paths, service contracts, persistence,
  API behavior, and tests at the same time.

## Consequences

Events will migrate in order: first structural democking, then live payload and
provider boundaries, then full live data links. User-created or user-accepted
event work becomes persistent Live Records in `orbit_records` collections;
derived readiness scores, recommendation eligibility, match results, summaries,
and follow-up suggestions remain computed views unless a later performance or
audit requirement promotes them. Events may create post-event contact drafts,
but formal contact creation still belongs to Acquisition/Contacts confirmation.

# Orbit

Orbit is a relationship-management product centered on an agent that helps users prepare for, act during, and follow up after relationship moments.

## Language

**Orbit AI**:
The user-facing relationship manager that can answer questions and proactively surface relationship work through the Orbit AI conversation.
_Avoid_: generic chatbot, notification center

**Events**:
Relationship moments with a time, place, context, and possible people to meet or follow up with.
_Avoid_: calendar system, meeting storage

**Events Live Store**:
The source of real Orbit event records owned by the product, independent of external calendar or event-platform synchronization.
_Avoid_: live calendar import, provider sync

**Calendar Provider Import**:
The flow that brings events from an external calendar or event platform into Orbit.
_Avoid_: events live store

**Local Live Database**:
A developer-machine database that uses the same live provider boundary as production data storage, while staying local to the developer environment.
_Avoid_: hybrid store, browser localStorage, mock fixtures

**Remote Live Database**:
A network-hosted database service that uses the same live provider boundary as Orbit production data storage.
_Avoid_: local live database, hybrid store, provider sync

**Live Record**:
A persistent Orbit data item stored through the live provider boundary, with shared metadata for ownership, provenance, and cross-feature lookup.
_Avoid_: fixture row, localStorage item, provider-specific document

**Event Capability**:
A business capability within Events, such as attendee roster, readiness, encounter notes, want-to-connect, or post-event review. A capability may have mock, hybrid, or live implementations, but the capability itself is not a mock.
_Avoid_: mock feature, mock folder

**Event Work Record**:
A persistent fact created or accepted during an event relationship workflow, such as an attendee import, goal, encounter note, want-connect intent, or post-event contact draft.
_Avoid_: computed recommendation, transient view

**Event Computed View**:
A derived event relationship output that can be recalculated from event work records and other source data, such as readiness scores, recommendation eligibility, match results, summaries, and suggested follow-ups.
_Avoid_: persisted fact, user-confirmed record

**Post-Event Contact Draft**:
A candidate contact created from post-event review that still requires user confirmation before becoming a formal contact.
_Avoid_: contact, imported contact

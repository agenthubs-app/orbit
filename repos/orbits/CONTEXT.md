# Orbit Relationship Workspace

Orbit helps a user prepare, maintain, and act on professional relationships while keeping inferred or imported information reviewable before it becomes durable relationship data.

## Contact Acquisition

**Business Card Scan**:
One processing attempt that turns a user-supplied business-card image into reviewable extracted fields and keeps source provenance.
_Avoid_: Contact import, confirmed contact

**Contact Draft**:
An unconfirmed candidate contact assembled from manual input, OCR, an event, or another acquisition source.
_Avoid_: Contact, saved contact

**Confirmed Contact**:
A person record the user has explicitly accepted into their relationship workspace.
_Avoid_: OCR result, contact draft

**Orbit Invitation**:
An optional, separately confirmed email that invites a confirmed contact to join Orbit after the recipient address and message have been reviewed.
_Avoid_: Contact confirmation, automatic welcome email

## Events

**Event**:
The activity itself, including its content, schedule, organizer context, and lifecycle state.
_Avoid_: Registration, RSVP

**Event Registration**:
One user's auditable RSVP relationship to one event, independent of the event's own lifecycle state.
_Avoid_: Event status, booking

**Registration Question Set**:
A small, reviewable set of event-specific prompts used during registration to fill meaningful gaps in a participant profile.
_Avoid_: Questionnaire, global profile

**Event Participant Profile**:
The user's confirmed, event-scoped positioning, goals, contribution, and connection preferences for one event.
_Avoid_: Global profile, registration answers

## Relationship Inbox

**Conversation Thread**:
A persistent subject-based history of messages with one relationship context.
_Avoid_: Alert, notification

**Relationship Alert**:
A time-bound reminder or proactive signal that can be reviewed or dismissed without becoming a conversation thread.
_Avoid_: Message, conversation

**Relationship Inbox**:
The workspace that presents conversation threads and relationship alerts as separate information types.
_Avoid_: Notification feed, chat window

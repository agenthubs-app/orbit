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

**Relationship Connection**:
One account's actor-scoped relationship to one Confirmed Contact. It owns that account's relationship stage; another account represents the same real person with its own Confirmed Contact and Connection.
_Avoid_: Contact status, global relationship state

**Relationship Stage**:
The current maintenance state of a Relationship Connection: needs follow-up, active, nurture, or archived.
_Avoid_: Contact Draft review state, task due state, partnership type

**Follow-up Task**:
A user-confirmed, persistent action linked to a Relationship Connection, optionally scheduled with a due time.
_Avoid_: Suggested follow-up, relationship stage

**Suggested Follow-up**:
A reviewable AI- or rule-generated proposal that becomes a Follow-up Task only after user confirmation.
_Avoid_: Task, reminder, completed action

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

**Registered Event Organizer**:
An Orbit user with a complete AuthUser, Account, and Profile identity chain whose account-backed Actor owns an Event. Every Event organizer must be a registered user, including organizers who are not in the current user's relationship network.
_Avoid_: Contact, organizer label, synthetic actor, unregistered external host

**Contact Actor Link**:
An explicit, auditable link between one user's Confirmed Contact and the registered Orbit Actor belonging to that person. The link establishes identity correspondence; it does not transfer Contact ownership or grant Event permissions.
_Avoid_: Contact import, account membership, event role

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

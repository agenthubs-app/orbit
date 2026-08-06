# Event relationship lifecycle

Status: accepted for incremental delivery

## Decision

Orbit uses one canonical aggregate for each kind of truth:

- `event-operations` owns registration-derived participants, AI generation,
  published recommendations, table/seat placement, check-in, attendee consent,
  and the event relationship graph. The attendee UI reads recommendations only
  from a published generation after `resultsAvailableAt`. A queued, running,
  failed, unpublished, or missing generation is rendered as an explicit state;
  it is never replaced by locally ranked participants. When the strict Chinese
  output policy is enabled, a violating model draft gets exactly one bounded
  AI-only repair call that is told the exact offending Latin tokens; response
  accounting (tokens, provider bytes) sums both model calls and keeps the final
  finish reason, persisted task errors stay generic, and a stream-only stderr
  diagnostic reports why a repair failed. There is no deterministic or local
  string-replacement fallback.
- `event contact request` is the only new contact-consent command. Acceptance
  creates actor-scoped relationship projections through the durable operations
  outbox. Legacy matchmaking requests remain readable for history, but cannot
  create recommendations, contact requests, or scheduling writes.
- `encounter` owns an explicit human observation: whether the participants
  talked, a typed or voice memo, commitments, next action, tags, privacy, and
  optional event/contact/connection references. Check-in and table placement
  never imply an encounter. Encounter evidence may be projected to a contact
  timeline asynchronously.
- `appointment` owns meeting negotiation. It uses optimistic versions and
  idempotency keys; each proposal contains three to five UTC candidate times,
  an IANA timezone, duration, medium, and note. A pending reschedule does not
  replace the last mutually confirmed revision. Accept, counter, decline,
  cancel, complete, and repeated reschedule attempts are retained as history.
- `appointment projection` creates a calendar record only for the current
  confirmed revision. A Google Meet conference is requested as part of that
  same idempotent Calendar upsert, so rescheduling cannot split the calendar and
  meeting into contradictory provider records. Stale-revision provider jobs are
  acknowledged without making an external request. Missing provider
  configuration is reported as `not_synced`, not as success.
- `post-event review` is a retriable fail-closed state machine
  (`queued -> running -> ready | failed`). AI summaries are shown only after a
  real provider result is stored. Completion progress may use deterministic
  evidence counts, but summary prose and follow-up recommendations may not use
  templates or local fallback generation.

## Registration entry layering

Registration cost is layered so the per-event wizard only asks what the event
actually needs:

- The universal profile owns identity. When the profile has a role or
  organization, the wizard seeds `positioning` ("role @ organization") as an
  already-answered turn and the per-event interview starts at the three intent
  questions (who you want to meet, what outcome you want, what you can offer).
  Answering the remaining adaptive questions stays optional; once the core
  fields are complete the wizard offers finishing registration immediately.
  Seeded turns are unsigned: the wizard submits them as plain `answers` next
  to the signed `responses`, and the registration boundary only uses them to
  fill fields no verified response covers (stored as legacy participant
  snapshots, never overriding a verified answer). Admission-controlled events
  do not seed at all — every core answer there must pass the signed
  question-token check because organizers review the application.
- The event detail page carries an anonymous quick-answer card (who you want
  to meet / what you can offer). Answers live only in `localStorage` on the
  visitor's device until the wizard seeds them as answered turns after login,
  and are removed once the registration persists. Nothing is written
  server-side before the authenticated registration command.
- `GET /api/events/[id]/registration/preview` is the only anonymous
  registration read. It returns aggregate cluster buckets (industry, else the
  role segment of positioning) plus a total; a bucket is published only at
  five or more members so individuals cannot be reverse-mapped, and bucket
  labels use participant-stated answers only — no inferred content.

## Consistency and authorization

Commands take the authenticated actor from the server boundary, never from a
request body. Mutations require an idempotency key and the aggregate's expected
version. Canonical records and their outbox messages commit in one repository
transaction; consumers are replay-safe and do not perform cross-aggregate dual
writes. Instants are stored in UTC and user intent retains its IANA timezone.
Reminder dedupe keys are `appointmentId + revision + type`; confirming a new
revision invalidates pending reminders for the older one.

## Delivery sequence

1. Replace the event-detail legacy recommendation surface with the published
   attendee workspace, participant detail, and event contact-request commands.
2. Add explicit encounter capture and project accepted contact/encounter
   evidence into contact history.
3. Add the appointment aggregate, repository migration, commands, outbox, and
   in-app notification projection before connecting external providers.
4. Add the post-event state machine and provider worker; keep the UI fail-closed
   until the provider is configured and a stored result is ready.

The normal-user acceptance path is A recommends B, A opens B's published
profile, A requests contact, B accepts, both receive actor-scoped contacts, A
records an encounter, they negotiate and reschedule an appointment, reminders
and provider projections run, the meeting completes, and the post-meeting memo
appears on the relationship timeline.

## Worker run contract

This repository does not contain a deployment manifest or external process
manager configuration. Production therefore has an explicit operator contract:
run exactly one or more long-lived `npm run event-operations:worker` processes
beside the web process, with the same database/workspace and model-provider
configuration. That integrated worker drains generation, operations outbox,
appointment, encounter, and post-event AI queues. `SIGINT` and `SIGTERM` abort
poll/backoff waits immediately and the process closes both database pools before
exiting. The narrower worker scripts remain local diagnostics; they are not a
claim that an external deployment has been configured.

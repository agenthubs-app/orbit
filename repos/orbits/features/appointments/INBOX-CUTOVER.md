# Appointment notifications in the typed inbox

## Runtime path

Appointment change notices and the automatic 30-minute reminder are projected from `appointment_outbox` by `runAppointmentOutboxBatch`. The aggregate mutation and its outbox rows share the command transaction. The worker upserts typed inbox rows before acknowledging the outbox row; replay uses the stable inbox semantic key, so a crash between the upsert and acknowledgement is safe.

The 30-minute event is a distinct `appointment.reminder.t30m` event. It is not represented as `t1h` and is not sent through the legacy agent-action reminder projector. At projection time, each participant is checked independently against the shared explicit-reminder precedence rule. A worker that wakes after the scheduled fire time but before the meeting keeps the original `scheduledFor`; a retry at or after the meeting start does not create the reminder. Current confirmation revision, reminder invalidation, and appointment status are rechecked before writing.

The request-time business refresh no longer reads `appointment_aggregates`. Existing appointments are handled by the explicit backfill below. New changes and due reminders use the same durable worker path as the source mutation.

## Explicit historical backfill

Run one bounded pass at a time, with a stable batch id and cutoff, after the typed inbox writer is ready:

```sh
node --import tsx scripts/backfill-appointment-inbox.ts \
  --actor 'actor-id' \
  --batch-id 'appointment-inbox-cutover-2026-09' \
  --cutoff '2026-09-26T00:00:00.000Z' \
  --limit 10 \
  --writers-ready
```

The command is explicit and is not called by an API route or worker. It scans a bounded page of actor-participant appointments per pass, upserts eligible historical change notices, records historical push suppressions before each upsert, and inserts a deduplicated 30-minute outbox row for an upcoming current confirmation when that row is missing. Repeat with the same actor, batch id, and cutoff until the returned progress says `done: true`. `writersReady` is intentionally required so history is not fenced before a durable writer is in service. Do not choose a new cutoff or batch id to resume an existing pass.

The progress record is scoped to actor, batch id, and cutoff. `missingContacts` counts records whose actor-owned contact projection was unavailable; these are not fabricated into actionable notices. Started meetings are not backfilled with a new 30-minute reminder. Historical changes beyond the supported proposal/counter/accept/decline/cancel commands are not converted into inbox notices.

## Verification boundary

Local tests cover durable worker ordering, stable history identity, due and late-worker timing, explicit-reminder precedence per participant, stale revisions, and lifecycle event creation/invalidation. The backfill command itself has not been run against any database as part of this change; an operator should first verify the target database and writer readiness, then inspect each bounded pass result.

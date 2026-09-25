# Notification source reads and cutover state

The active inbox read and typed-delivery materialization paths no longer scan
business records. They consume bounded `inboxNotifications` pages only. Source
mutations project a stable notification; reads authorize the referenced source
by exact ID and revision.

## Producers

- Canonical reminders use durable projection work and the reminder worker.
- Appointment changes and the automatic 30-minute reminder use
  `appointment_outbox`; the worker writes the typed inbox row before ACK.
- Business-card completion is projected by the V1/V2 queue worker at the state
  transition. Historical batches use `scripts/backfill-business-card-inbox.ts`.
- Integration expiry is projected after OAuth token exchange. A future
  authorization check distinguishes refreshable tokens from credentials that
  will require reconnection; only the latter creates a row at token expiry.
- Messages advance from a saved delivery cursor using narrow references, not
  message histories.

Appointment and business-card backfills are explicit operator commands. They
are not called from GET handlers, badge polling, or delivery materialization.
No backfill was run against a database during this change.

## Local cost evidence

The diagnostic in `scripts/diagnostics/notification-source-read-cost.ts`
reproduces the removed request-time behavior with 10,000 synthetic rows per
source. One 2026-09-26 run observed roughly 23 MB of serialized rows per full
source pass. This is a stress comparison, not a production traffic estimate;
real capacity must be calculated from deployed read metrics and Neon usage.

## Release gate

Before enabling server Push ownership for an actor population:

1. deploy every producer and the relevant workers;
2. run the canonical-reminder, appointment, and business-card historical
   backfills to completion for that population;
3. apply the existing notification cutover migration so old and typed delivery
   cannot both own the same send;
4. verify the inbox GET performs no source enumeration and compare daily Neon
   egress before and after release.

The old signal refresh remains only on the pre-cutover Push branch. The cutover
migration, rather than an automatic fallback, is the boundary that retires that
branch without duplicate notifications.

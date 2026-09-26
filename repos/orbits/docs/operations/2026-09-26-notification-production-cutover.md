# Notification production cutover — 2026-09-26

## Production deployment

- Vercel project: `orbit-staging-20260917`.
- Producer deployment: `dpl_FvQUtuQ12pb3sh8ejBt93fozRyqq`.
- Final deployment with the legacy delivery scan removed:
  `dpl_9veYnUJEUedv1LXBUyhQdaGcjPxe` (`Ready`).
- Production aliases: `orbitailink.com`, `www.orbitailink.com`.
- `ORBIT_CANONICAL_INBOX_PROJECTION=1` is enabled for Production.

## Backfill

The target was Neon project `curly-block-17385488`, branch
`br-royal-darkness-b3c76ac4`, workspace
`workspace:orbit-small-staging-20260917`. Four production actors were found.

- Appointment inbox backfill used batch `appointment-inbox-cutover-20260926`
  and cutoff `2026-09-26T03:13:04.000Z`. All four actors returned `done: true`.
- The source contained zero appointments, so zero appointment notifications or
  reminders were created.
- Business-card backfill was run for all four actors from the Unix epoch. Both
  V1 and V2 source stores contained zero eligible batches, so zero notifications
  were created.

## Delivery migration

The zero-write migration plan was generated immediately before apply for every
actor. Every plan had zero blocked deliveries. Batch
`notification-cutover-20260926` was then applied to all four actors at generation
1, with no conflicts.

The post-deploy database check found four account rows and four enabled cutover
rows, all with `legacyBlocked=true`. No legacy delivery remained in processing,
unknown-receipt, scheduled, or retry-scheduled state.

The delivery worker no longer contains the legacy signal refresh/materialization
branch. An opted-in actor without a cutover row receives one typed cutover row in
the policy transaction and then uses the incremental typed delivery path. A
persisted rollback/fence remains authoritative and is not silently re-enabled.

## Additive schema and live acceptance

The first live reminder attempt exposed a deployment prerequisite: Production
did not yet contain `orbit_inbox_projection_work`. The reminder transaction
failed closed and left no partial reminder or inbox record. The additive schema
exported by `features/notifications/storage/inbox-projection-work.ts` was then
installed on the production branch, including its indexes and schedule reminder
window schema. No existing table or business row was rewritten.

A second acceptance pass used actor `user_mu534qd2_myi62i` and an owned canonical
task. It created an in-app-only reminder, ran the configured canonical reminder
maintenance task, completed the projection work row, and rendered one unread
`[QA] 增量通知验收` item in the production relationship inbox. The browser showed
the notification badge and exact title/body. No external push channel was used.

The read metrics emitted during the complete create/deliver/project/verify pass
reported 47 measured database operations and approximately 21.1 KiB of returned
serialized rows. Neon showed 1.19 MB of network transfer for the project in the
September 2026 consumption period after the pass; the CLI usage fields still
reported zero, so the console value is the authoritative snapshot used here.

After verification, the six exact QA live records (task, task mutation, reminder,
wake, delivery, and inbox item) and the matching completed projection-work row
were permanently deleted in one transaction. A follow-up query returned zero
matching records, and a production-page reload showed no remaining QA badge.

# Notification production cutover — 2026-09-26

## Production deployment

- Vercel project: `orbit-staging-20260917`.
- Deployment: `dpl_FvQUtuQ12pb3sh8ejBt93fozRyqq`.
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

The delivery worker no longer contains the legacy signal refresh/materialization
branch. An opted-in actor without a cutover row receives one typed cutover row in
the policy transaction and then uses the incremental typed delivery path. A
persisted rollback/fence remains authoritative and is not silently re-enabled.

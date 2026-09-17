# Production cutover — 2026-09-17 (in progress)

User-authorized target: replace the old `orbit` Web/API production with
`orbit-staging-20260917`. Preserve the old Neon project and all its data; do not
connect to, migrate, seed, reset or delete it. This is **not** an old-data migration.
The new workspace keeps its existing organizer, 30 contacts, 15 follow-up tasks,
and 10 events. Production sessions will require sign-in again.

## Fixed deployment boundary

- Source baseline: `29efb4c9`, isolated branch `codex/production-cutover-read-write-20260917`.
- New Vercel project: `prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`.
- New Neon project: `orange-forest-30108072`, branch `br-restless-wind-az8p5o5s`.
- Expected database host: `ep-blue-forest-azwt71sw-pooler.c-3.ap-southeast-1.aws.neon.tech`.
- Workspace: `workspace:orbit-small-staging-20260917`.
- Domains: `www.orbitailink.com`, `orbitailink.com`.
- Old Vercel project: `prj_yhzteXixndQnTnxsh7TinSUev0Nh`; pause only after the new target is ready.
- Do not copy old database variables. Transfer only required external-service
  configuration in memory, without printing secrets. Use new production auth/cron secrets.

## Workstreams and acceptance

1. Identity: persisted profile/account mapping must be resolved in SQL before
   returning payloads; unrelated users must not increase returned rows.
2. Reads: private ownership filtering at SQL boundary; preserve list completeness,
   sorting, filters and totals; pagination must have matching Web/App consumers.
   Do not hide results with an arbitrary limit. Dashboard aggregates should avoid
   unnecessary full payloads.
3. Writes: ownership and conditional/atomic changes, registration races,
   read-deduplication invalidation. Existing transactional domain repositories
   remain authoritative; generic guards are not substitutes for domain checks.
4. Operations: pin the approved database target; run regression on dedicated local
   PostgreSQL, not Neon; retain required background delivery and reminder semantics.

## Validation / cutover gates

- Dedicated local database: `orbit_cutover_test_20260917`; no cloud test env loaded.
- First tests: 28 targeted tests passed; initial TypeScript check passed.
- Contact detail real-PG fixture: response JSON 2,441 bytes / 6 rows, unchanged with
  tenfold unrelated data; this is **not** wire transfer or monthly billing evidence.
- Cloud quota inspected before use: dashboard showed 0.09 CU-hours, 34.6 MB storage,
  386.75 kB transfer, no suspension warning (provider accounting can lag).
- Cloud validation budget: at most 100 SQL requests / 1 MiB returned JSON for
  explicit migrations and smoke checks; no bulk test/import/export or keepalive.
- Build and verify new production deployment before moving either domain.
- Verify browser login, account ownership, contacts/tasks/events, Web/API origin,
  and required background configuration; then pause old compute entry points.
- Domain rollback must not silently resume writes to old data. Prefer fix-forward;
  any reversal needs explicit old-data write policy.

Production configuration is now installed in the new Vercel project only. The
first production build `dpl_CAp2wGcgaW2FTMMrKoyHNKB8hdiU` is READY in `sin1`.
Browser login passed and showed the correct organizer, 30 contacts and nine
published events. It is an intermediate build; final source fixes follow.

New-database index migration completed in five explicit SQL calls, 918 bytes of
returned JSON. Collection counts before/after were identical. No old database
connection was opened. Four identity/ownership indexes were added.

Expanded regression: 506 tests, 501 passed, four skipped, one pre-existing failure
in `app-agent-contact-recommendations.test.tsx` (Chinese source-label expectation),
reproduced unchanged on `29efb4c9`. Local PostgreSQL conditional-write and
ordinary-contact-list isolation tests pass. TypeScript checks pass.

Implemented conditional writes are an explicit capability, currently adopted by
contact industry updates; they do **not** retroactively make all generic upserts
safe. Registration/provisioning use insert-only semantics. Legacy list clients
remain complete; per-user list pagination and dashboard SQL aggregation still
need acceptance before claiming all four workstreams are finished.

Not yet completed: final deployment, domain transfer, old project pause,
end-to-end production smoke, complete four-workstream acceptance.
No capacity claim is justified by a connection limit or these fixture measurements.

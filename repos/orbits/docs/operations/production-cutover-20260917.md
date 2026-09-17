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

## Cutover completed

- Source commit `732a017f`, pushed to the isolated remote branch.
- Production deployment `dpl_7SnhZuB3xhmuffFB9eCt2eKcfBsr`, READY, runtime `sin1`.
- Both `www.orbitailink.com` and `orbitailink.com` transferred and verified on
  `prj_PFJXRat2a7ADxz6tWVLQU7rNTaIt`.
- Old Vercel project API confirms `paused=true`; browser shows
  `503 DEPLOYMENT_PAUSED` on its old default domain.
- Browser sign-in on the formal `www` domain succeeded; the contact page shows
  the expected 30 contacts. No model prompt, email or external message was sent.
- App base URL remains unchanged. New auth secret intentionally invalidates old
  sessions; users must sign in to the new workspace. No old accounts/data were copied.
- Direct browser navigation to `/api/account/me` was blocked by the browser
  automation client, so it is not claimed as an independent API smoke pass.
  The live browser sign-in exercises the authentication HTTP flow.
- Original Neon SQL connections and writes by this task: zero. Pausing Vercel
  is an application configuration change, not a database change. Historical
  preview URLs/external local workers are not claimed to be globally revoked.

Still in progress: complete four-workstream acceptance, full pagination and
server-side aggregate redesign, comprehensive Web/App cross-write smoke. Legacy
generic upsert paths still require domain-by-domain adoption of conditional writes.
No capacity claim is justified by a connection limit or these fixture measurements.

## Follow-up read-model hardening

- Contact list queries now explicitly project only fields consumed by the list
  DTO. Private notes, raw captures, handles and detail history remain available
  on detail reads, but do not travel through list queries.
- A real PostgreSQL regression compares complete API responses for ordinary
  lists, search, custom tags, value filters and page input. Responses are identical
  while returned JSON is less than 1/20 of the full-payload fixture. This ratio is
  fixture-specific, not a promise about every production request or Neon billing.
- Conditional updates require a strictly advancing timestamp; the contact writer
  advances by at least one millisecond, avoiding a same-timestamp CAS race.
- `ORBIT_PG_READ_METRICS=1` is configured for the next production deployment.
  Logs contain only query kind, count, row count, approximate bytes, duration and
  failure state, never SQL arguments, passwords or payload text. This is
  observability, not an automatic monthly quota guard or a paid monitoring service.
- The standard `npm test` entry refuses nonlocal database URLs/hosts before
  loading tests. Dedicated local PostgreSQL and reserved `.invalid` mock targets
  remain allowed. Direct `node --test`, external scripts and historical deployments
  are outside this guard; it is not a network firewall. Guard regressions and the
  existing scaffold test pass (3/3).

## Remaining design / acceptance work

1. Preserve **both** current search contracts before introducing UI pagination:
   Web uses NFKC + Chinese word segmentation + aliases + presentation labels;
   the existing contacts API uses substring filters over a different field set.
   Reusing its narrow `search_text` SQL page reader unchanged would lose results.
2. Move facets/counts and dashboard aggregates into database read models, with
   full-response parity tests for canonical lifecycle, custom tags and evidence.
   Do not count only the current page. Existing full list responses are retained.
3. Adopt scoped/conditional mutations per domain, preserving idempotency receipts
   and existing transactional repositories. The generic privileged upsert remains
   available for internal projection/administration and is not a public API.
4. Plan idle/due-only scheduling with durable wakeups on every producer before
   reducing the existing heartbeat. Simply increasing the polling interval would
   delay reminders and is not an acceptable cost optimization.

No existing Preview URL is a safe disposable test environment after promotion:
historical staging deployments reference this same database. Do not run cloud
regression, fixture reset or seeds through them. Use the dedicated local database;
a future separate staging environment requires separately scoped configuration.

## Capacity interpretation

Neon's current [Free plan](https://neon.com/pricing) includes 100 CU-hours,
0.5 GB storage and 5 GB public transfer per project/month. A 10,000-connection
pooler ceiling is not a supported-user count. Monthly capacity depends on measured
bytes and compute per active user plus background work. The existing ten-minute
maintenance cadence is preserved to avoid delaying reminders; it is not free and
has not been replaced with an idle/due-only scheduler. No paid upgrade was made.

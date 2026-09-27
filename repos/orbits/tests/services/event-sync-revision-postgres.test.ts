import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";
import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { EVENT_SYNC_REVISION_RELAX_SQL, EVENT_SYNC_REVISION_TABLES, runEventSyncRevisionMigration } from "../../features/events/event-operations/storage/sync-revision";
import { legacyResponsesFromAnswers } from "../../features/events/registration/interview-response-contract";
import { acquireSyncCommitOrderLock } from "../../features/sync/commit-order-lock";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { EVENT_MEMBERSHIP_PROBE_DOMAIN, SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { domainPageSchema } from "../../shared/api-schema/universal-read";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { lockedFixtureQuery, STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0113, SC-04: the event tables 0115 syncs carry sync_revision from the
// orbit_records sequence under the 0108 commit-order lock, and the sync read
// service reads a dedicated-table domain from its manual. The probe domain
// (event memberships, never leased) proves it end to end on product writers.
const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 90_000 };
const W = "workspace:event-sync";
const A = "actor:a";
const B = "actor:b";
const SECRET = "event-sync-revision-secret-0123456789abcdef0123456789";

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

async function host(t: TestContext, options: { migrate?: boolean } = {}) {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `event_sync_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema} -c statement_timeout=15000` });
  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await pool.end(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  await pool.query(STRICT_SYNC_REVISION_SQL);
  await runEventOperationsMigrations(client);
  if (options.migrate !== false) await runEventSyncRevisionMigration(client);
  const repository = createPostgresEventOperationsRepository({ client, workspaceId: W });
  const base = (await pool.query<{ now: Date }>("select statement_timestamp() as now")).rows[0]!.now.getTime();
  const store = createPostgresLiveRecordStore({ client: pool });
  for (const actor of [A, B]) {
    await store.upsertRecord({ workspaceId: W, collectionName: "accounts", recordId: actor, userId: actor, sourceType: "manual", sourceId: actor, evidenceIds: [], lifecycleState: "active", createdAt: at(base, 0), updatedAt: at(base, 0), payload: { id: actor } });
  }
  async function openEvent(eventId: string) {
    await repository.saveConfiguration({
      checkInOpensAt: at(base, -5), eventEndsAt: at(base, 180), eventId, eventStartsAt: at(base, 30), maxAttemptsPerTask: 3,
      organizerActorId: "organizer-1", profileEditDeadlineAt: at(base, 10), recommendationCount: 4, registrationCutoffAt: at(base, 20),
      resultsAvailableAt: at(base, 25), roundOneStartsAt: at(base, 45), roundTwoStartsAt: at(base, 90), shardSize: 6, tableSize: 6, updatedAt: at(base, 0),
    });
    await repository.activateCanonicalRegistrations(eventId, []);
    await lockedFixtureQuery(client, "update event_ops_events set lifecycle_state_v2 = 'published' where workspace_id = $1 and event_id = $2", [W, eventId]);
  }
  async function register(eventId: string, userId: string, valueOffered = "Grid operations") {
    const answers = { industry: "Climate", valueOffered };
    return repository.registerCanonicalParticipant({ answers, displayName: userId, eventId, interviewResponses: [...legacyResponsesFromAnswers(answers, at(base, -1))], userId });
  }
  const probeService = createDomainReadService({ client: pool, cursorSecret: SECRET, domains: [...SYNC_DOMAINS, EVENT_MEMBERSHIP_PROBE_DOMAIN] });
  const handlersFor = (actor: string, service = probeService) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => Date.now(),
  });
  return { pool, client, repository, openEvent, register, handlersFor, base };
}

type Host = Awaited<ReturnType<typeof host>>;

async function revisions(pool: Pool): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const table of EVENT_SYNC_REVISION_TABLES) {
    const rows = await pool.query<{ key: string; sync_revision: string | null }>(`select row_to_json(t)::jsonb - 'sync_revision' - 'updated_at' as key, sync_revision::text as sync_revision from ${table} t`);
    for (const row of rows.rows) found.set(`${table}:${JSON.stringify(row.key)}`, String(row.sync_revision));
  }
  return found;
}

/** A device's mirror of the probe domain, following its cursor through the real route handler. */
function device(h: Host, actor: string) {
  const rows = new Map<string, Record<string, unknown>>();
  let cursor: string | undefined;
  return {
    rows,
    get cursor() { return cursor; },
    async pull(): Promise<number> {
      let changes = 0;
      for (let page = 0; page < 20; page += 1) {
        const response = await h.handlersFor(actor).domain(new Request(`https://orbit.local/api/sync/domains/${EVENT_MEMBERSHIP_PROBE_DOMAIN.domainId}?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), EVENT_MEMBERSHIP_PROBE_DOMAIN.domainId);
        assert.equal(response.status, 200);
        const data = domainPageSchema.parse(((await response.json()) as { data: unknown }).data);
        for (const change of data.changes) { rows.set(change.id, change.payload!); changes += 1; }
        cursor = data.nextCursor;
        if (!data.hasMore) return changes;
      }
      throw new Error("pagination did not terminate");
    },
  };
}

test("the migration backfills existing event rows once, uniquely and in the shared sequence; a rerun changes nothing", options, async (t) => {
  const h = await host(t, { migrate: false });
  await h.openEvent("event-1");
  await h.register("event-1", A);
  await runEventSyncRevisionMigration(h.client);
  const first = await revisions(h.pool);
  for (const table of ["event_ops_events", "event_ops_configuration_heads", "event_ops_membership_heads"]) {
    assert.equal([...first.keys()].filter((key) => key.startsWith(`${table}:`)).length, 1, `${table} had a row before the migration`);
  }
  assert.ok([...first.values()].every((value) => /^[1-9]\d*$/.test(value)), "no row is left without a revision");
  const orbit = (await h.pool.query<{ sync_revision: string }>("select sync_revision::text from orbit_records")).rows.map((row) => row.sync_revision);
  const all = [...first.values(), ...orbit];
  assert.equal(new Set(all).size, all.length, "revisions are unique across orbit_records and the event tables (one sequence)");
  for (const table of EVENT_SYNC_REVISION_TABLES) {
    const column = (await h.pool.query("select is_nullable from information_schema.columns where table_schema = current_schema() and table_name = $1 and column_name = 'sync_revision'", [table])).rows[0];
    assert.equal(column?.is_nullable, "NO", `${table}.sync_revision is not null`);
  }
  await runEventSyncRevisionMigration(h.client);
  assert.deepEqual(await revisions(h.pool), first, "a rerun leaves every revision as it was");
});

test("an unlocked write to an event sync table is refused; relax lets it through; the migration makes it strict again", options, async (t) => {
  const h = await host(t);
  await h.openEvent("event-1");
  await h.register("event-1", A);
  const refused = /SYNC_WRITE_LOCK_REQUIRED/;
  await assert.rejects(h.pool.query("update event_ops_membership_heads set updated_at = now() where actor_id = $1", [A]), refused);
  await assert.rejects(h.pool.query("update event_ops_events set title = 'raw' where event_id = 'event-1'"), refused);
  await assert.rejects(h.pool.query("update event_ops_configuration_heads set updated_at = now() where event_id = 'event-1'"), refused);
  await h.pool.query(EVENT_SYNC_REVISION_RELAX_SQL);
  const before = (await h.pool.query<{ r: string }>("select sync_revision::text as r from event_ops_events where event_id = 'event-1'")).rows[0]!.r;
  await h.pool.query("update event_ops_events set title = 'relaxed' where event_id = 'event-1'");
  const after = (await h.pool.query<{ r: string }>("select sync_revision::text as r from event_ops_events where event_id = 'event-1'")).rows[0]!.r;
  assert.ok(BigInt(after) > BigInt(before), "the relaxed trigger still assigns a revision");
  await runEventSyncRevisionMigration(h.client);
  await assert.rejects(h.pool.query("update event_ops_events set title = 'raw' where event_id = 'event-1'"), refused);
});

test("product writers (configuration, activation, registration, cancellation) pass the strict trigger and every write takes a newer revision", options, async (t) => {
  const h = await host(t);
  const headRevision = async (actor: string) => BigInt((await h.pool.query<{ r: string }>("select sync_revision::text as r from event_ops_membership_heads where event_id = 'event-1' and actor_id = $1", [actor])).rows[0]!.r);
  await h.openEvent("event-1");
  await h.register("event-1", A);
  const registered = await headRevision(A);
  await h.register("event-1", A, "Market design");
  const edited = await headRevision(A);
  assert.ok(edited > registered, "an edit re-sends the membership head");
  await h.repository.cancelCanonicalRegistration({ eventId: "event-1", userId: A });
  const cancelled = await headRevision(A);
  assert.ok(cancelled > edited);
  const status = (await h.pool.query("select status from event_ops_membership_heads where actor_id = $1", [A])).rows[0]?.status;
  assert.equal(status, "cancelled", "a cancelled registration keeps its owner (the device receives 'cancelled')");
  const max = BigInt((await h.pool.query<{ r: string }>("select max(sync_revision)::text as r from orbit_records")).rows[0]!.r);
  assert.ok(cancelled > max, "event revisions come after earlier orbit_records revisions: one sequence");
});

test("probe domain from a dedicated table: first pull is complete, one change sends one row, the next pull sends none; B never appears", options, async (t) => {
  const h = await host(t);
  await h.openEvent("event-1");
  await h.openEvent("event-2");
  await h.register("event-1", A);
  await h.register("event-2", A);
  await h.register("event-1", B);
  const a = device(h, A);
  assert.equal(await a.pull(), 2, "first pull: every membership of A");
  assert.deepEqual([...a.rows.keys()].sort(), ["event-1", "event-2"]);
  for (const payload of a.rows.values()) {
    assert.deepEqual(Object.keys(payload).sort(), ["eventId", "membershipVersion", "status", "updatedAt"], "only the manual's fields leave the server");
    assert.equal(payload.status, "rsvped");
  }
  assert.ok(!JSON.stringify([...a.rows.values()]).includes(B));
  await h.repository.cancelCanonicalRegistration({ eventId: "event-1", userId: A });
  assert.equal(await a.pull(), 1, "one change, one row");
  assert.equal(a.rows.get("event-1")?.status, "cancelled");
  assert.equal(await a.pull(), 0, "nothing changed, nothing sent");
  await h.register("event-1", B, "Market design");
  assert.equal(await a.pull(), 0, "B's change does not move A's bookmark");
  const b = device(h, B);
  assert.equal(await b.pull(), 1);
  assert.deepEqual([...b.rows.keys()], ["event-1"]);
});

test("the probe domain is never leased: the production service grants only the device domains", options, async (t) => {
  const h = await host(t);
  const production = createDomainReadService({ client: h.pool, cursorSecret: SECRET });
  const lease = await h.handlersFor(A, production).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"));
  const grants = ((await lease.json()) as { data: { grants: { domainId: string }[] } }).data.grants.map((grant) => grant.domainId).sort();
  assert.deepEqual(grants, SYNC_DOMAINS.map((domain) => domain.domainId).sort());
  assert.ok(!grants.includes(EVENT_MEMBERSHIP_PROBE_DOMAIN.domainId));
  const page = await h.handlersFor(A, production).domain(new Request(`https://orbit.local/api/sync/domains/${EVENT_MEMBERSHIP_PROBE_DOMAIN.domainId}`), EVENT_MEMBERSHIP_PROBE_DOMAIN.domainId);
  assert.equal(page.status, 404, "an account cannot read the probe domain");
});

/**
 * Two writers on the membership heads: T1 takes a revision and holds its
 * transaction open; T2 writes while T1 is open. A device syncs in between and
 * again after both commit.
 */
async function interleave(h: Host, locked: boolean) {
  const write = async (tx: { query(text: string, values?: readonly unknown[]): Promise<unknown> }, actor: string) => {
    if (locked) await acquireSyncCommitOrderLock(tx);
    await tx.query("update event_ops_membership_heads set updated_at = statement_timestamp() where workspace_id = $1 and event_id = 'event-1' and actor_id = $2", [W, actor]);
  };
  let releaseFirst!: () => void;
  const firstMayCommit = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let firstWrote!: () => void;
  const firstHasWritten = new Promise<void>((resolve) => { firstWrote = resolve; });
  const first = h.client.transaction(async (tx) => { await write(tx, A); firstWrote(); await firstMayCommit; }, { isolation: "read committed" });
  await firstHasWritten;
  let secondDone = false;
  const second = h.client.transaction(async (tx) => { await write(tx, B); }, { isolation: "read committed" }).then(() => { secondDone = true; });
  await new Promise((resolve) => setTimeout(resolve, 400));
  const secondFinishedWhileFirstOpen = secondDone;
  return { secondFinishedWhileFirstOpen, finish: async () => { releaseFirst(); await first; await second; } };
}

test("commit order: a membership revision taken before a later one commits is never skipped (writers hold the lock)", options, async (t) => {
  const h = await host(t);
  await h.openEvent("event-1");
  await h.register("event-1", A);
  await h.register("event-1", B);
  // A single reader sees both owners' rows through the table's own revision order.
  const readAll = async (after: string) => (await h.pool.query<{ actor_id: string; r: string }>("select actor_id, sync_revision::text as r from event_ops_membership_heads where sync_revision > $1 order by sync_revision", [after])).rows;
  const bookmark = (await h.pool.query<{ r: string }>("select max(sync_revision)::text as r from event_ops_membership_heads")).rows[0]!.r;
  const run = await interleave(h, true);
  assert.equal(run.secondFinishedWhileFirstOpen, false, "the second writer waits for the first to commit");
  const between = await readAll(bookmark);
  assert.deepEqual(between, [], "nothing is visible while the first writer holds the lock");
  await run.finish();
  const after = await readAll(bookmark);
  assert.deepEqual(after.map((row) => row.actor_id), [A, B], "commit order equals revision order; the bookmark sees both");
});

test("control: with the relaxed trigger and no lock the same interleaving hides the first row behind a later bookmark", options, async (t) => {
  const h = await host(t);
  await h.openEvent("event-1");
  await h.register("event-1", A);
  await h.register("event-1", B);
  await h.pool.query(EVENT_SYNC_REVISION_RELAX_SQL);
  const bookmark = (await h.pool.query<{ r: string }>("select max(sync_revision)::text as r from event_ops_membership_heads")).rows[0]!.r;
  const run = await interleave(h, false);
  assert.equal(run.secondFinishedWhileFirstOpen, true, "nothing orders the writers");
  const between = (await h.pool.query<{ actor_id: string; r: string }>("select actor_id, sync_revision::text as r from event_ops_membership_heads where sync_revision > $1 order by sync_revision", [bookmark])).rows;
  assert.deepEqual(between.map((row) => row.actor_id), [B], "only the later revision is visible");
  const deviceBookmark = between.at(-1)!.r;
  await run.finish();
  const after = (await h.pool.query<{ actor_id: string }>("select actor_id from event_ops_membership_heads where sync_revision > $1", [deviceBookmark])).rows;
  assert.deepEqual(after, [], "A's smaller revision committed behind the bookmark: a device would never receive it");
});

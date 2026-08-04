import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool, type PoolClient } from "pg";

import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function schemaConnectionString(connectionString: string, schema: string): string {
  const value = new URL(connectionString);
  value.searchParams.set("options", `-c search_path=${schema}`);
  return value.toString();
}

type QueryClient = Pick<PoolClient, "query">;

type Run = Readonly<{
  expectedCount: number;
  manifestHash: string;
  migrationId: string;
  migrationRunId: string;
  planHash: string;
  resultHash: string;
  workspaceId: string;
}>;

const validRun: Run = {
  expectedCount: 2,
  manifestHash: hash("canonical-membership-manifest"),
  migrationId: "canonical-membership-migration:v1",
  migrationRunId: "canonical-membership-run:primary",
  planHash: hash("canonical-membership-plan"),
  resultHash: hash("canonical-membership-result"),
  workspaceId: "workspace:canonical-membership-ledger",
};

async function insertRun(client: QueryClient, overrides: Partial<Run> = {}): Promise<void> {
  const value = { ...validRun, ...overrides };
  await client.query(
    `insert into event_ops_canonical_membership_migration_runs (
       workspace_id,migration_run_id,migration_id,schema_version,plan_hash,manifest_hash,
       expected_count,result_hash,applied_at,created_at
     ) values ($1,$2,$3,1,$4,$5,$6,$7,'2026-08-05T10:00:00.000Z','2026-08-05T10:00:01.000Z')`,
    [
      value.workspaceId, value.migrationRunId, value.migrationId, value.planHash,
      value.manifestHash, value.expectedCount, value.resultHash,
    ],
  );
}

async function insertEvent(
  client: QueryClient,
  overrides: Partial<{
    authority: string;
    deadlineEvidenceHash: string | null;
    eventAggregateHash: string;
    eventId: string;
    migrationRunId: string;
    targetCount: number;
    workspaceId: string;
  }> = {},
): Promise<void> {
  const value = {
    authority: "canonical_membership",
    deadlineEvidenceHash: null,
    eventAggregateHash: hash("canonical-event-aggregate"),
    eventId: "event:canonical",
    migrationRunId: validRun.migrationRunId,
    targetCount: 1,
    workspaceId: validRun.workspaceId,
    ...overrides,
  };
  await client.query(
    `insert into event_ops_canonical_membership_migration_events (
       workspace_id,migration_run_id,event_id,authority,event_aggregate_hash,
       deadline_evidence_hash,target_count,created_at
     ) values ($1,$2,$3,$4,$5,$6,$7,'2026-08-05T10:00:01.000Z')`,
    [
      value.workspaceId, value.migrationRunId, value.eventId, value.authority,
      value.eventAggregateHash, value.deadlineEvidenceHash, value.targetCount,
    ],
  );
}

test(
  "v12 canonical membership migration ledger is immutable, constrained, transactional, and idempotent in a temporary schema",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 60_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `canonical_membership_ledger_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString: schemaConnectionString(databaseUrl, schema), max: 2 });
    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(pool);
      await runEventOperationsMigrations(pool);
      const version = await pool.query<{ count: string; version: string }>(`select
        count(*) filter (where version=12)::text as count, max(version)::text as version
        from event_ops_schema_migrations`);
      assert.deepEqual(version.rows[0], { count: "1", version: "13" });

      await insertRun(pool);
      await insertEvent(pool);
      await insertEvent(pool, {
        authority: "legacy_registration",
        deadlineEvidenceHash: hash("legacy-deadline-evidence"),
        eventAggregateHash: hash("legacy-event-aggregate"),
        eventId: "event:legacy",
        targetCount: 1,
      });
      const stored = await pool.query<{ authority: string; count: string; deadline_evidence_hash: string | null }>(
        `select authority,deadline_evidence_hash,target_count::text as count
           from event_ops_canonical_membership_migration_events
          where workspace_id=$1 and migration_run_id=$2 order by event_id`,
        [validRun.workspaceId, validRun.migrationRunId],
      );
      assert.deepEqual(stored.rows, [
        { authority: "canonical_membership", count: "1", deadline_evidence_hash: null },
        { authority: "legacy_registration", count: "1", deadline_evidence_hash: hash("legacy-deadline-evidence") },
      ]);
      await assert.rejects(insertRun(pool, { migrationRunId: "canonical-membership-run:same-plan" }));
      await assert.rejects(insertEvent(pool, {
        eventId: "event:orphan", migrationRunId: "canonical-membership-run:missing",
      }));

      for (const [name, action] of [
        ["run update", () => pool.query(`update event_ops_canonical_membership_migration_runs set expected_count=3 where workspace_id=$1 and migration_run_id=$2`, [validRun.workspaceId, validRun.migrationRunId])],
        ["run delete", () => pool.query(`delete from event_ops_canonical_membership_migration_runs where workspace_id=$1 and migration_run_id=$2`, [validRun.workspaceId, validRun.migrationRunId])],
        ["run truncate", () => pool.query("truncate event_ops_canonical_membership_migration_runs cascade")],
        ["event update", () => pool.query(`update event_ops_canonical_membership_migration_events set target_count=2 where workspace_id=$1 and migration_run_id=$2 and event_id='event:canonical'`, [validRun.workspaceId, validRun.migrationRunId])],
        ["event delete", () => pool.query(`delete from event_ops_canonical_membership_migration_events where workspace_id=$1 and migration_run_id=$2 and event_id='event:canonical'`, [validRun.workspaceId, validRun.migrationRunId])],
        ["event truncate", () => pool.query("truncate event_ops_canonical_membership_migration_events")],
      ] as const) await assert.rejects(action(), /canonical membership migration ledger is immutable/iu, name);

      await assert.rejects(insertRun(pool, { migrationRunId: "canonical-membership-run:bad-hash", planHash: "not-a-hash" }));
      await insertRun(pool, {
        expectedCount: 0,
        migrationRunId: "canonical-membership-run:zero-count",
        planHash: hash("zero-count-plan"),
        resultHash: hash("zero-count-result"),
      });
      await assert.rejects(insertRun(pool, { migrationRunId: "canonical-membership-run:bad-count", expectedCount: -1 }));
      await assert.rejects(insertEvent(pool, { eventId: "event:bad-authority", authority: "unknown" }));
      await assert.rejects(insertEvent(pool, { eventId: "event:bad-aggregate", eventAggregateHash: "not-a-hash" }));
      await assert.rejects(insertEvent(pool, { eventId: "event:bad-deadline", deadlineEvidenceHash: "not-a-hash" }));
      await assert.rejects(insertEvent(pool, {
        deadlineEvidenceHash: hash("unexpected-canonical-deadline"),
        eventId: "event:canonical-with-deadline",
      }));
      await assert.rejects(insertEvent(pool, {
        authority: "legacy_registration",
        deadlineEvidenceHash: null,
        eventId: "event:legacy-without-deadline",
      }));

      const authorityDeadlinePair = await pool.query<{ present: boolean }>(`select exists (
        select 1 from pg_constraint
         where conrelid='event_ops_canonical_membership_migration_events'::regclass
           and contype='c' and pg_get_constraintdef(oid) ~* 'authority.*deadline_evidence_hash|deadline_evidence_hash.*authority'
      ) as present`);
      assert.equal(authorityDeadlinePair.rows[0]?.present, true);

      const transaction = await pool.connect();
      try {
        await transaction.query("begin");
        await insertRun(transaction, {
          migrationRunId: "canonical-membership-run:rollback",
          planHash: hash("rollback-plan"), resultHash: hash("rollback-result"),
        });
        await insertEvent(transaction, { migrationRunId: "canonical-membership-run:rollback", eventId: "event:rollback" });
        await assert.rejects(insertEvent(transaction, {
          migrationRunId: "canonical-membership-run:rollback", eventId: "event:rollback-fail", eventAggregateHash: "bad",
        }));
      } finally {
        await transaction.query("rollback");
        transaction.release();
      }
      const rolledBack = await pool.query<{ events: string; runs: string }>(`select
        (select count(*) from event_ops_canonical_membership_migration_runs where migration_run_id='canonical-membership-run:rollback')::text as runs,
        (select count(*) from event_ops_canonical_membership_migration_events where migration_run_id='canonical-membership-run:rollback')::text as events`);
      assert.deepEqual(rolledBack.rows[0], { events: "0", runs: "0" });
    } finally {
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

test(
  "main database remains at v11 or earlier without canonical membership ledger writes",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    try {
      const state = await pool.query<{ events: string | null; runs: string | null; version: string }>(`select
        (select coalesce(max(version),0)::text from event_ops_schema_migrations) as version,
        to_regclass('event_ops_canonical_membership_migration_runs')::text as runs,
        to_regclass('event_ops_canonical_membership_migration_events')::text as events`);
      assert.ok(Number(state.rows[0]?.version) <= 11);
      assert.equal(state.rows[0]?.runs === null, state.rows[0]?.events === null);
      if (state.rows[0]?.runs && state.rows[0]?.events) {
        const counts = await pool.query<{ events: string; runs: string }>(`select
          (select count(*)::text from event_ops_canonical_membership_migration_runs) as runs,
          (select count(*)::text from event_ops_canonical_membership_migration_events) as events`);
        assert.deepEqual(counts.rows[0], { events: "0", runs: "0" });
      }
    } finally {
      await pool.end();
    }
  },
);

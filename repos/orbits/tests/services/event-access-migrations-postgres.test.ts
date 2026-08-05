import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  EVENT_OPERATIONS_SCHEMA_MIGRATIONS,
  runEventOperationsMigrations,
} from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function schemaUrl(value: string, schema: string): string {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

async function mainEvidence(pool: Pool): Promise<unknown> {
  return (
    await pool.query(
      `select
         (select coalesce(max(version),0)::text from event_ops_schema_migrations) as version,
         to_regclass('event_ops_event_role_assignment_versions')::text as versions,
         to_regclass('event_ops_event_role_assignment_heads')::text as heads,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,'' order by to_jsonb(item)::text),''))
            from event_ops_events item) as events_hash`,
    )
  ).rows[0];
}

async function expectSqlState(
  operation: Promise<unknown>,
  state: string,
): Promise<void> {
  await assert.rejects(
    operation,
    (error: unknown) => (error as { code?: unknown }).code === state,
  );
}

test(
  "the event access ledger is constrained, monotonic, immutable, and leaves the configured schema unchanged",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const schema = `event_access_${randomUUID().replaceAll("-", "")}`;
    const connectionString = schemaUrl(databaseUrl, schema);
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString, max: 1 });
    const client = createEventOperationsPostgresClient({
      connectionString,
      pool,
    });
    const mainBefore = await mainEvidence(admin);
    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      await runEventOperationsMigrations(client);

      const expected = EVENT_OPERATIONS_SCHEMA_MIGRATIONS.find(
        (migration) => migration.version === 13,
      );
      assert.ok(expected);
      assert.deepEqual(
        (
          await pool.query(
            `select version,name,checksum
               from event_ops_schema_migrations
              where version=13`,
          )
        ).rows,
        [expected],
      );
      assert.equal(
        Number(
          (
            await pool.query(
              `select count(*)::text as count
                 from event_ops_schema_migrations`,
            )
          ).rows[0]?.count,
        ),
        EVENT_OPERATIONS_SCHEMA_MIGRATIONS.length,
      );

      const indexes = (
        await pool.query<{ indexname: string }>(
          `select indexname from pg_indexes
            where schemaname=current_schema()
              and indexname like 'event_ops_event_role_assignment_heads_%'
            order by indexname`,
        )
      ).rows.map((row) => row.indexname);
      assert.deepEqual(indexes, [
        "event_ops_event_role_assignment_heads_event_state_idx",
        "event_ops_event_role_assignment_heads_pkey",
        "event_ops_event_role_assignment_heads_subject_state_idx",
      ]);

      await pool.query(
        `insert into event_ops_events (
           workspace_id,event_id,organizer_actor_id,lifecycle_state,revision,
           created_at,updated_at
         ) values (
           'workspace:test','event:test','actor:owner','active',1,now(),now()
         )`,
      );
      for (const sql of [
        `insert into event_ops_event_role_assignment_versions (
           workspace_id,event_id,subject_actor_id,assignment_version,role,
           state,assigned_by_actor_id,reason
         ) values (
           'workspace:test','event:missing','actor:test',1,'check_in',
           'active','actor:owner','Unknown event'
         )`,
        `insert into event_ops_event_role_assignment_versions (
           workspace_id,event_id,subject_actor_id,assignment_version,role,
           state,assigned_by_actor_id,reason
         ) values (
           'workspace:test','event:test','actor:test',1,'owner',
           'active','actor:owner','Owner is not delegated'
         )`,
        `insert into event_ops_event_role_assignment_versions (
           workspace_id,event_id,subject_actor_id,assignment_version,role,
           state,assigned_by_actor_id,reason
         ) values (
           'workspace:test','event:test','actor:test',0,'check_in',
           'active','actor:owner','Invalid version'
         )`,
      ]) {
        await assert.rejects(pool.query(sql));
      }

      await pool.query(
        `insert into event_ops_event_role_assignment_versions (
           workspace_id,event_id,subject_actor_id,assignment_version,role,
           state,assigned_by_actor_id,reason,created_at
         ) values (
           'workspace:test','event:test','actor:delegate',1,'check_in',
           'active','actor:owner','Cover the arrival desk',
           '2026-08-04T10:00:00.000Z'
         )`,
      );
      await pool.query(
        `insert into event_ops_event_role_assignment_heads (
           workspace_id,event_id,subject_actor_id,assignment_version,
           role,state,revision,updated_at
         ) values (
           'workspace:test','event:test','actor:delegate',1,
           'check_in','active',1,'2026-08-04T10:00:00.000Z'
         )`,
      );
      await assert.rejects(
        pool.query(
          `insert into event_ops_event_role_assignment_heads (
             workspace_id,event_id,subject_actor_id,assignment_version,
             role,state,revision
           ) values (
             'workspace:test','event:test','actor:mismatch',1,
             'operations','active',1
           )`,
        ),
      );

      await pool.query(
        `insert into event_ops_event_role_assignment_versions (
           workspace_id,event_id,subject_actor_id,assignment_version,role,
           state,assigned_by_actor_id,reason,created_at
         ) values (
           'workspace:test','event:test','actor:delegate',2,'operations',
           'active','actor:owner','Expand operating responsibility',
           '2026-08-04T11:00:00.000Z'
         )`,
      );
      await pool.query(
        `update event_ops_event_role_assignment_heads
            set assignment_version=2, role='operations', state='active',
                revision=2, updated_at='2026-08-04T11:00:00.000Z'
          where workspace_id='workspace:test'
            and event_id='event:test'
            and subject_actor_id='actor:delegate'`,
      );
      assert.deepEqual(
        (
          await pool.query(
            `select assignment_version::text,role,state,revision::text
               from event_ops_event_role_assignment_heads`,
          )
        ).rows[0],
        {
          assignment_version: "2",
          revision: "2",
          role: "operations",
          state: "active",
        },
      );

      for (const sql of [
        `update event_ops_event_role_assignment_versions set reason='rewrite'`,
        `delete from event_ops_event_role_assignment_versions`,
        `truncate event_ops_event_role_assignment_versions cascade`,
        `delete from event_ops_event_role_assignment_heads`,
        `truncate event_ops_event_role_assignment_heads`,
        `update event_ops_event_role_assignment_heads
            set assignment_version=1,role='check_in',revision=1,
                updated_at='2026-08-04T12:00:00.000Z'`,
      ]) {
        await expectSqlState(pool.query(sql), "55000");
      }

      await pool.query("begin");
      try {
        await pool.query(
          `insert into event_ops_event_role_assignment_versions (
             workspace_id,event_id,subject_actor_id,assignment_version,role,
             state,assigned_by_actor_id,reason,created_at
           ) values (
             'workspace:test','event:test','actor:delegate',3,'reviewer',
             'active','actor:owner','Temporary failed transition',
             '2026-08-04T12:00:00.000Z'
           )`,
        );
        await assert.rejects(
          pool.query(
            `update event_ops_event_role_assignment_heads
                set assignment_version=3,role='operations',state='active',
                    revision=3,updated_at='2026-08-04T12:00:00.000Z'`,
          ),
        );
      } finally {
        await pool.query("rollback");
      }
      assert.equal(
        Number(
          (
            await pool.query(
              `select count(*)::text as count
                 from event_ops_event_role_assignment_versions
                where assignment_version=3`,
            )
          ).rows[0]?.count,
        ),
        0,
      );
      assert.equal(
        (
          await pool.query(
            `select assignment_version::text as version
               from event_ops_event_role_assignment_heads`,
          )
        ).rows[0]?.version,
        "2",
      );

      assert.deepEqual(await mainEvidence(admin), mainBefore);
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

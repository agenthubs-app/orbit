import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { Pool } from "pg";

import { planNote, planTask, runAgentV1Backfill } from "../../../features/agent-v1/rollout/backfill";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";
import { assertBackfillTarget } from "../../../scripts/backfill-agent-v1-fields";

/**
 * agent-design AG18-1: the backfill of the new multi-value fields on a local isolated database. Only rows without the
 * new field are filled (one or zero items from the single value); rows that have a list are not touched; a dry run
 * writes nothing; a second run plans and writes 0 rows; unprocessable rows are listed and left as they are; a remote
 * database is refused without its confirmation. Needs ORBIT_LIFECYCLE_TEST_DATABASE_URL.
 */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const WORKSPACE = "workspace:backfill-test";
const pools: Pool[] = [];
const clients: TransactionalPostgresClient[] = [];
after(async () => {
  await Promise.all(clients.map((client) => client.close()));
  await Promise.all(pools.map((pool) => pool.end()));
});

const ROWS: { collection: string; id: string; payload: Record<string, unknown>; deleted?: boolean }[] = [
  { collection: "tasks", id: "task:single", payload: { task: { id: "task:single", relatedContactId: "contact:c17", relatedEventId: "event:e103", title: "给小林发修订报价" } } },
  { collection: "tasks", id: "task:none", payload: { task: { id: "task:none", title: "约山本吃饭" } } },
  { collection: "tasks", id: "task:lists", payload: { task: { id: "task:lists", relatedContactId: "contact:c17", relatedContactIds: ["contact:c17", "contact:c21"], relatedEventRefs: [{ id: "private_event:p1", kind: "private" }], title: "已有多值" } } },
  { collection: "tasks", id: "task:bad", payload: { task: { id: "task:bad", relatedContactId: 42, title: "坏数据" } } },
  { collection: "tasks", id: "task:deleted", deleted: true, payload: { task: { id: "task:deleted", relatedContactId: "contact:c17", title: "已删除" } } },
  { collection: "notes", id: "note:old", payload: { note: { eventIds: ["event:e103"], id: "note:old", version: 3 }, schemaVersion: 2 } },
  { collection: "notes", id: "note:refs", payload: { note: { eventIds: ["event:e103"], eventRefs: [{ id: "event:e103", kind: "platform" }, { id: "private_event:p1", kind: "private" }], id: "note:refs", version: 1 }, schemaVersion: 2 } },
  { collection: "notes", id: "note:broken", payload: { schemaVersion: 2 } },
  { collection: "contacts", id: "contact:c17", payload: { displayName: "小林健" } },
];

async function withDatabase(run: (client: TransactionalPostgresClient, pool: Pool) => Promise<void>) {
  assert.match(new URL(databaseUrl!).hostname, /^(localhost|127\.0\.0\.1|::1)$/u, "only a local database");
  const schema = `agent_v1_backfill_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const scoped = new URL(databaseUrl!);
  scoped.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: scoped.toString(), max: 1 });
  pools.push(admin, pool);
  await admin.query(`create schema "${schema}"`);
  try {
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const row of ROWS) {
      await pool.query(
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, lifecycle_state, search_text, payload, created_at, updated_at, deleted_at)
         values ($1, $2, $3, 'actor:a', 'test', 'test', '{}', $4, '', $5::jsonb, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z', $6)`,
        [WORKSPACE, row.collection, row.id, row.deleted ? "deleted" : "active", JSON.stringify(row.payload), row.deleted ? "2026-11-02T00:00:00Z" : null],
      );
    }
    const client = createTransactionalPostgresClient({ connectionString: scoped.toString(), max: 2 });
    clients.push(client);
    await run(client, pool);
  } finally {
    await admin.query(`drop schema if exists "${schema}" cascade`);
  }
}

const payloadOf = async (pool: Pool, id: string) => (await pool.query(`select payload, updated_at from orbit_records where record_id = $1`, [id])).rows[0] as { payload: Record<string, any>; updated_at: Date };

test("the plan of one row: only the missing lists, from the single values", () => {
  assert.deepEqual(planTask({ task: { relatedContactId: "c", relatedEventId: "e" } }), { set: { relatedContactIds: ["c"], relatedEventRefs: [{ id: "e", kind: "platform" }] } });
  assert.deepEqual(planTask({ task: {} }), { set: { relatedContactIds: [], relatedEventRefs: [] } });
  assert.equal(planTask({ task: { relatedContactIds: [], relatedEventRefs: [] } }), null);
  assert.deepEqual(planTask({ task: { relatedContactId: 1 } }), { reason: "relatedContactId is not an id" });
  assert.deepEqual(planNote({ note: { eventIds: ["e"] } }), { set: { eventRefs: [{ id: "e", kind: "platform" }] } });
  assert.equal(planNote({ note: { eventRefs: [] } }), null);
});

test("a remote database is refused for apply without its confirmation", () => {
  assert.throws(() => assertBackfillTarget({ apply: true, connectionString: "postgresql://u:p@db.example.com:5432/prod", target: "cloud" }), /AGENT_V1_BACKFILL_REFUSED/u);
  assert.equal(assertBackfillTarget({ apply: true, confirmRemote: "db.example.com/prod", connectionString: "postgresql://u:p@db.example.com:5432/prod", target: "cloud" }).remote, true);
  assert.equal(assertBackfillTarget({ apply: true, connectionString: "postgresql://u@127.0.0.1:5432/orbit_agent_eval", target: "local" }).remote, false);
});

test("dry run writes nothing; apply fills only missing lists; a second run changes 0 rows", { skip }, async () => {
  await withDatabase(async (client, pool) => {
    const before = JSON.stringify((await pool.query(`select record_id, payload from orbit_records order by record_id`)).rows);
    const dry = await runAgentV1Backfill({ client, mode: "dry-run", workspaceId: WORKSPACE });
    assert.deepEqual([dry.counts.tasks.scanned, dry.counts.tasks.planned, dry.counts.tasks.alreadyFilled, dry.counts.tasks.unprocessable], [4, 2, 1, 1]);
    assert.deepEqual([dry.counts.notes.scanned, dry.counts.notes.planned, dry.counts.notes.alreadyFilled, dry.counts.notes.unprocessable], [3, 1, 1, 1]);
    assert.deepEqual(dry.unprocessable.map((item) => item.recordId).sort(), ["note:broken", "task:bad"]);
    assert.equal(JSON.stringify((await pool.query(`select record_id, payload from orbit_records order by record_id`)).rows), before);

    const applied = await runAgentV1Backfill({ client, mode: "apply", workspaceId: WORKSPACE });
    assert.deepEqual([applied.counts.tasks.written, applied.counts.notes.written], [2, 1]);
    const single = await payloadOf(pool, "task:single");
    assert.deepEqual(single.payload.task.relatedContactIds, ["contact:c17"]);
    assert.deepEqual(single.payload.task.relatedEventRefs, [{ id: "event:e103", kind: "platform" }]);
    assert.equal(single.payload.task.relatedContactId, "contact:c17");
    assert.equal(single.updated_at.toISOString(), "2026-11-01T00:00:00.000Z");
    assert.deepEqual((await payloadOf(pool, "task:none")).payload.task.relatedContactIds, []);
    // A row that had its lists is exactly as it was; so are the unprocessable rows, the deleted row and the contact.
    assert.deepEqual((await payloadOf(pool, "task:lists")).payload, ROWS[2].payload);
    assert.deepEqual((await payloadOf(pool, "task:bad")).payload, ROWS[3].payload);
    assert.deepEqual((await payloadOf(pool, "task:deleted")).payload, ROWS[4].payload);
    assert.deepEqual((await payloadOf(pool, "note:refs")).payload, ROWS[6].payload);
    assert.deepEqual((await payloadOf(pool, "contact:c17")).payload, ROWS[8].payload);
    const note = await payloadOf(pool, "note:old");
    assert.deepEqual(note.payload.note.eventRefs, [{ id: "event:e103", kind: "platform" }]);
    assert.equal(note.payload.note.version, 3);

    const again = await runAgentV1Backfill({ client, mode: "apply", workspaceId: WORKSPACE });
    assert.deepEqual([again.counts.tasks.planned, again.counts.tasks.written, again.counts.notes.planned, again.counts.notes.written], [0, 0, 0, 0]);
    assert.equal(again.unprocessable.length, 2);
  });
});

/**
 * agent-design AG13-4 (PLANNER 易错边界 7): the migration of the private-event and attendance indexes, on a local database
 * only (random schema, loopback). The whole records migration runs twice without error; the unique index refuses a second
 * «我去过» for the same account and event (a deleted one does not count); the reverse lookups of a deletion use the indexes.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { runOrbitRecordsMigration } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL ?? process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "no local test database";
const schema = `ag13_migration_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;

before(async () => {
  if (!databaseUrl) return;
  assert.ok(/^(localhost|127\.0\.0\.1|\[::1\])$/u.test(new URL(databaseUrl).hostname), "loopback database only");
  pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema},public` });
  await pool.query(`create schema ${schema}`);
});

after(async () => {
  if (!databaseUrl) return;
  await pool.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await pool.end();
});

const row = (id: string, eventId: string, state = "active") => ["workspace:m", "event_attendance_notes", id, "actor:a", "manual", id, "{}", "2026-11-15T00:00:00Z", "2026-11-15T00:00:00Z", state, JSON.stringify({ eventRef: { id: eventId, kind: "private" }, id })];
const insert = "insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, created_at, updated_at, lifecycle_state, payload) values ($1, $2, $3, $4, $5, $6, $7::text[], $8, $9, $10, $11::jsonb)";

test("the records migration runs twice on a local database; the indexes are there", { skip }, async () => {
  const client = await pool.connect();
  try {
    await runOrbitRecordsMigration(client);
    await runOrbitRecordsMigration(client);
  } finally {
    client.release();
  }
  const names = (await pool.query("select indexname from pg_indexes where schemaname = $1", [schema])).rows.map((item) => String(item.indexname));
  for (const name of ["orbit_records_attendance_event_uidx", "orbit_records_tasks_event_refs_idx", "orbit_records_notes_event_refs_idx", "orbit_records_schedule_event_refs_idx"]) assert.ok(names.includes(name), name);
});

test("one «我去过» per account and event: a second is refused by the index; a deleted one does not count", { skip }, async () => {
  await pool.query(insert, row("attendance:1", "private_event:p1"));
  await assert.rejects(pool.query(insert, row("attendance:2", "private_event:p1")), (error: unknown) => (error as { code?: string }).code === "23505");
  await pool.query("update orbit_records set lifecycle_state = 'deleted' where record_id = 'attendance:1'");
  await pool.query(insert, row("attendance:3", "private_event:p1"));
  const other = row("attendance:4", "private_event:p1");
  other[3] = "actor:b";
  await pool.query(insert, other);
});

test("the reverse lookups of a deletion use the indexes", { skip }, async () => {
  // Enough rows that a selective lookup is worth its index (a near-empty table is read whole whatever its indexes).
  await pool.query(`insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, created_at, updated_at, lifecycle_state, payload)
    select 'workspace:m', c.name, c.name || ':' || g, 'actor:a', 'manual', 's', '{}', now(), now(), 'active',
      case c.name when 'tasks' then jsonb_build_object('task', jsonb_build_object('relatedEventRefs', jsonb_build_array(jsonb_build_object('kind', 'private', 'id', 'e' || g))))
                  when 'notes' then jsonb_build_object('note', jsonb_build_object('eventRefs', jsonb_build_array(jsonb_build_object('kind', 'private', 'id', 'e' || g))))
                  else jsonb_build_object('eventRefs', jsonb_build_array(jsonb_build_object('kind', 'private', 'id', 'e' || g))) end
    from generate_series(1, 3000) g, (values ('tasks'), ('notes'), ('personal_schedule_items')) c(name)`);
  await pool.query("analyze orbit_records");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local enable_seqscan = off");
    const plan = async (sql: string) => (await client.query(`explain ${sql}`)).rows.map((item) => String(item["QUERY PLAN"])).join("\n");
    for (const [collection, path] of [["tasks", "payload->'task'->'relatedEventRefs'"], ["notes", "payload->'note'->'eventRefs'"], ["personal_schedule_items", "payload->'eventRefs'"]]) {
      const text = await plan(`select record_id from orbit_records where collection_name = '${collection}' and lifecycle_state <> 'deleted' and (${path}) @> '[{"kind":"private","id":"p"}]'::jsonb`);
      assert.match(text, new RegExp(`orbit_records_${collection === "personal_schedule_items" ? "schedule" : collection}_event_refs_idx`, "u"), text);
    }
    const attendance = await plan("select record_id from orbit_records where workspace_id = 'w' and user_id = 'a' and collection_name = 'event_attendance_notes' and lifecycle_state <> 'deleted' and (payload->'eventRef'->>'kind') = 'private' and (payload->'eventRef'->>'id') = 'p'");
    assert.match(attendance, /orbit_records_attendance_event_uidx/u, attendance);
    await client.query("rollback");
  } finally {
    client.release();
  }
});

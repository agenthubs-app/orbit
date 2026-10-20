import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("personal notes and schedule records are erased without touching another actor; shared appointments stop the step", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`create table appointment_aggregates(workspace_id text,appointment_id text,owner_actor_id text not null,invitee_actor_id text not null,
      primary key(workspace_id,appointment_id));
      create table appointment_command_receipts(workspace_id text,actor_id text,appointment_id text,
        foreign key(workspace_id,appointment_id) references appointment_aggregates(workspace_id,appointment_id));
      create table appointment_outbox(workspace_id text,appointment_id text,
        foreign key(workspace_id,appointment_id) references appointment_aggregates(workspace_id,appointment_id));`);
    for (const actor of ["owner", "other"]) {
      for (const collection of ["notes", "memo_extractions", "tasks", "personal_schedule_items", "reminderPlans", "personal_schedule_occurrence_exceptions"]) {
        await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
          values('space',$1,$2,$3,'test',$2,'{}',now(),now())`, [collection, `${actor}-${collection}`, actor]);
      }
    }
    await pool.query("insert into appointment_aggregates values('space','shared','owner','other')");
    const { purgeAccountNotes } = await import("../../features/account/data-rights/purge/notes");
    await assert.rejects(() => purgeAccountNotes(db, "space", "owner"), /SHARED_APPOINTMENT_REQUIRES_DECISION/);
    assert.equal((await pool.query("select count(*)::int as n from orbit_records")).rows[0]?.n, 12);
    await pool.query("delete from appointment_aggregates where appointment_id='shared'");
    await pool.query("insert into appointment_aggregates values('space','own','owner','owner')");
    await pool.query("insert into appointment_command_receipts values('space','owner','own')");
    await pool.query("insert into appointment_outbox values('space','own')");
    const result = await purgeAccountNotes(db, "space", "owner");
    assert.ok(result.deleted >= 9);
    assert.equal((await purgeAccountNotes(db, "space", "owner")).deleted, 0);
    assert.deepEqual((await pool.query("select distinct user_id from orbit_records order by user_id")).rows, [{ user_id: "other" }]);
    assert.equal((await pool.query("select count(*)::int as n from appointment_aggregates")).rows[0]?.n, 0);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const localTestDatabase = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("domain reader exports only own allowed fields and includes plans with steps and logs", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`create table plans (workspace_id text, actor_id text, id text, goal_snapshot text, status text, created_at timestamptz, updated_at timestamptz);
      create table plan_items (workspace_id text, actor_id text, id text, plan_id text, title text, detail text, status text, created_at timestamptz, updated_at timestamptz);
      create table plan_log (workspace_id text, actor_id text, id text, plan_id text, body text, event text, created_at timestamptz);
      create table event_ops_events (workspace_id text,event_id text,organizer_actor_id text,title text,lifecycle_state text,lifecycle_state_v2 text,starts_at timestamptz,created_at timestamptz,updated_at timestamptz,source_payload jsonb);
      create table event_ops_membership_heads (workspace_id text,event_id text,actor_id text,status text);`);
    const ws = "w1";
    for (const actor of ["mine", "other"]) {
      await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values ($1,'contacts',$2,$3,'test',$2,$4::jsonb,now(),now())`, [ws, `${actor}-contact`, actor, JSON.stringify({ displayName: actor, email: `${actor}@example.com`, oauthToken: "SECRET", accountId: actor })]);
      await pool.query(`insert into plans values ($1,$2,$3,$4,'active',now(),now())`, [ws, actor, `${actor}-plan`, `${actor} goal`]);
      await pool.query(`insert into plan_items values ($1,$2,$3,$4,$5,'step detail','open',now(),now())`, [ws, actor, `${actor}-step`, `${actor}-plan`, `${actor} step`]);
      await pool.query(`insert into plan_log values ($1,$2,$3,$4,'progress','note',now())`, [ws, actor, `${actor}-log`, `${actor}-plan`]);
    }
    await pool.query(`insert into event_ops_events values ($1,'hosted','mine','Hosted event','active',null,now(),now(),now(),'{"privateGuestList":["other"]}'),
      ($1,'joined','other','Joined event','active',null,now(),now(),now(),'{"privateGuestList":["other"]}'),
      ($1,'theirs','other','Other event','active',null,now(),now(),now(),'{"privateGuestList":["other"]}')`, [ws]);
    await pool.query(`insert into event_ops_membership_heads values ($1,'joined','mine','rsvped'),($1,'theirs','other','rsvped')`, [ws]);
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values ($1,'event_registrations','legacy-mine','mine','test','legacy-mine','{"registration":{"eventId":"legacy","userId":"mine","status":"rsvped","otherGuest":"other"}}'::jsonb,now(),now())`, [ws]);
    const { createAccountExportDomainReader } = await import("../../features/account/data-rights/domain-reader");
    const read = createAccountExportDomainReader({ db, workspaceId: ws, actorId: "mine" });
    const contacts = await read("contacts");
    assert.deepEqual(contacts?.map(row => row.id), ["mine-contact"]);
    assert.equal(contacts?.[0]?.displayName, "mine");
    assert.ok(!JSON.stringify(contacts).includes("SECRET"));
    const plans = await read("plans");
    assert.deepEqual(plans?.map(row => row.id), ["mine-plan", "mine-step", "mine-log"]);
    assert.ok(!JSON.stringify(plans).includes("other"));
    const events = await read("events");
    assert.deepEqual(events.map(row => row.id), ["legacy-mine", "host:hosted", "attendee:joined"]);
    assert.equal(events[1]?.title, "Hosted event");
    assert.equal(events[2]?.status, "rsvped");
    assert.ok(!JSON.stringify(events).includes("privateGuestList"));
    assert.ok(!JSON.stringify(events).includes("Other event"));
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("event purge removes actor-owned legacy participation and unregistered hosted events", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runEventOperationsMigrations(pool);
    const insert = async (collection: string, id: string, actor: string, value: unknown) =>
      pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('space',$1,$2,$3,'test',$2,$4::jsonb,now(),now())`, [collection, id, actor, JSON.stringify(value)]);
    await insert("event_registrations", "mine", "actor", { registration: { eventId: "event-1", userId: "actor" } });
    await insert("event_registrations", "theirs", "other", { registration: { eventId: "event-1", userId: "other" } });
    await insert("attendees", "mine", "actor", { eventId: "event-1" });
    const { purgeAccountEvents } = await import("../../features/account/data-rights/purge/events");
    assert.equal((await purgeAccountEvents(db, "space", "actor")).deleted, 2);
    assert.equal((await purgeAccountEvents(db, "space", "actor")).deleted, 0);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where collection_name='event_registrations' and user_id='other'`)).rows[0]?.n, 1);
    await insert("events", "shared", "other", { accountId: "other", attendees: [
      { actorId: "actor", displayName: "Private Person" }, { actorId: "other", displayName: "Counterparty" },
    ] });
    assert.equal((await purgeAccountEvents(db, "space", "actor")).deleted, 1);
    const shared = (await pool.query<{ payload: Record<string, unknown> }>(`select payload from orbit_records where collection_name='events' and record_id='shared'`)).rows[0]?.payload;
    assert.ok(!JSON.stringify(shared).includes("Private Person"));
    assert.ok(JSON.stringify(shared).includes("Counterparty"));
    await insert("events", "hosted", "actor", { accountId: "actor", title: "My event" });
    assert.equal((await purgeAccountEvents(db, "space", "actor")).deleted, 1);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where collection_name='events' and record_id='hosted'`)).rows[0]?.n, 0);
    await insert("events", "hosted-with-guest", "actor", { accountId: "actor", title: "Shared event" });
    await insert("event_registrations", "guest", "other", { registration: { eventId: "hosted-with-guest", userId: "other", status: "rsvped" } });
    await assert.rejects(purgeAccountEvents(db, "space", "actor"), /HOST_EVENT_HAS_REGISTRATIONS/);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where collection_name='events' and record_id='hosted-with-guest'`)).rows[0]?.n, 1);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});

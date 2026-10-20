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

test("account rights outbox delivers each channel once and retries only explicit failures", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,provider_record_id,payload,created_at,updated_at)
      values ('w','profiles','profile:user','actor','test','profile:user','user','{"id":"profile:user","accountId":"actor"}'::jsonb,now(),now()),
      ('w','auth_users','auth:user','user','test','auth:user','user','{"id":"user","email":"person@example.com","provider":"credentials"}'::jsonb,now(),now())`);
    const { resolveAccountRightsEmail } = await import("../../features/account/data-rights/configured-outbox");
    assert.equal(await resolveAccountRightsEmail(db, "w", "actor"), "person@example.com");
    assert.equal(await resolveAccountRightsEmail(db, "w", "other"), null);
    const { readAccountDeletionMethod } = await import("../../features/account/data-rights/method-handler");
    assert.equal(await readAccountDeletionMethod(db, "w", "actor", "user"), "credentials");
    assert.equal(await readAccountDeletionMethod(db, "w", "other", "user"), null);
    const { createAccountRightsOutbox } = await import("../../features/account/data-rights/outbox");
    await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values ('w','account_rights_outbox','export-ready:one','actor','account-rights','export-ready:one',
      '{"kind":"export-ready","exportId":"one","status":"pending","version":0}'::jsonb,now(),now())`);
    const mail: string[] = [];
    const push: string[] = [];
    let firstPush = true;
    let clock = new Date("2026-10-20T10:00:00.000Z");
    const outbox = createAccountRightsOutbox({ db, workspaceId: "w", now: () => clock, deliver: {
      async mail(message) { mail.push(message.id); return "delivered"; },
      async push(message) { push.push(message.id); if (firstPush) { firstPush = false; return "retry"; } return "delivered"; },
    } });
    assert.equal((await outbox.runOnce()).kind, "delivered");
    assert.equal((await outbox.runOnce()).kind, "retry");
    assert.equal((await outbox.runOnce()).kind, "idle");
    clock = new Date(clock.getTime() + 60_000);
    assert.equal((await outbox.runOnce()).kind, "delivered");
    assert.equal((await outbox.runOnce()).kind, "idle");
    assert.deepEqual(mail, ["export-ready:one"]);
    assert.deepEqual(push, ["export-ready:one", "export-ready:one"]);
    const row = await pool.query(`select payload from orbit_records where record_id='export-ready:one'`);
    assert.equal(row.rows[0].payload.mail.state, "delivered");
    assert.equal(row.rows[0].payload.push.state, "delivered");
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});

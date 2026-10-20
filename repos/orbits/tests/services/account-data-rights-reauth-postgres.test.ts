import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { hash } from "bcryptjs";
import { Pool } from "pg";
import { authUserRecordId } from "../../features/auth/storage/auth-user-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const localTestDatabase = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("password reauth verifies the matching auth user and limits repeated failures", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const email = "person@example.test";
    const passwordHash = await hash("correct-password", 4);
    await db.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values ('w','auth_users',$1,'profile','test',$1,$2::jsonb,now(),now())`, [authUserRecordId(email), JSON.stringify({ id: "profile", email, provider: "credentials", passwordHash })]);
    const { createPasswordDeletionReauth } = await import("../../features/account/data-rights/reauth");
    let now = new Date("2026-10-20T00:00:00.000Z");
    const verify = createPasswordDeletionReauth({ db, workspaceId: "w", now: () => now });
    for (let i = 0; i < 5; i++) assert.equal(await verify("actor", "profile", email, "wrong"), "invalid");
    assert.equal(await verify("actor", "profile", email, "correct-password"), "limited");
    now = new Date("2026-10-20T00:15:00.001Z");
    assert.equal(await verify("actor", "profile", email, "correct-password"), "verified");
    assert.equal(await verify("actor", "other-profile", email, "correct-password"), "invalid");
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});

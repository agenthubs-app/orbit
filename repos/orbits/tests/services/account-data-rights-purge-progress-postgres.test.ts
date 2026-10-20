import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("purge progress is lease-bound, deterministic, and survives a worker retry", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const { createAccountPurgeProgressStore } = await import("../../features/account/data-rights/purge/progress");
    let now = new Date("2026-11-20T00:00:00.000Z");
    const progress = createAccountPurgeProgressStore({ db, workspaceId: "space", now: () => now });
    await db.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      values('space','account_deletion_requests',$1,'actor','test','actor',$2::jsonb,now(),now())`,
    [`deletion:${createHash("sha256").update("actor").digest("hex")}`,
      JSON.stringify({ actorId: "actor", status: "purging", leaseToken: "first", leaseUntil: "2026-11-20T00:05:00.000Z" })]);
    await assert.rejects(progress.complete("actor", "wrong", "connections", { deleted: 2 }), /PURGE_LEASE_LOST/);
    const first = await progress.complete("actor", "first", "connections", { deleted: 2 });
    assert.equal(first.version, 1);
    assert.deepEqual(first.result, { deleted: 2 });
    assert.deepEqual(await progress.complete("actor", "first", "connections", { deleted: 99 }), first);
    await db.query(`update orbit_records set payload=jsonb_set(jsonb_set(payload,'{leaseToken}','"second"'::jsonb),'{leaseUntil}','"2026-11-20T00:10:00.000Z"'::jsonb)
      where workspace_id='space' and collection_name='account_deletion_requests'`);
    assert.deepEqual(await progress.complete("actor", "second", "connections", { deleted: 99 }), first);
    await assert.rejects(progress.complete("other", "second", "connections", { deleted: 1 }), /PURGE_LEASE_LOST/);
    now = new Date("2026-11-20T00:10:00.000Z");
    await assert.rejects(progress.complete("actor", "second", "events", { deleted: 1 }), /PURGE_LEASE_LOST/);
    assert.equal((await db.query(`select count(*)::int as n from orbit_records where collection_name='account_purge_steps'`)).rows[0]?.n, 1);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});

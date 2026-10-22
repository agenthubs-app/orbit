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

test("final identity and anonymous completion outbox commit together; failed delivery retries after deletion", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const actor = "actor";
    const userId = "old-user";
    const now = new Date("2026-11-20T00:00:00.000Z");
    const insert = async (collection: string, id: string, owner: string, value: unknown) =>
      pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values('space',$1,$2,$3,'test',$2,$4::jsonb,now(),now())`, [collection, id, owner, JSON.stringify(value)]);
    await insert("account_deletion_requests", `deletion:${createHash("sha256").update(actor).digest("hex")}`, actor,
      { actorId: actor, userId, status: "purging", leaseToken: "lease", leaseUntil: "2026-11-20T00:05:00.000Z" });
    await insert("accounts", actor, actor, { id: actor });
    await insert("profiles", `profile:${userId}`, actor, { id: userId, accountId: actor });
    await insert("auth_users", "auth_user:old@example.test", userId, { id: userId, email: "old@example.test", passwordHash: "secret" });
    await insert("accounts", "other", "other", { id: "other" });
    const { createAccountPurgeProgressStore } = await import("../../features/account/data-rights/purge/progress");
    const { purgeAccountFinalIdentity } = await import("../../features/account/data-rights/purge/final-identity");
    const { runLocalAccountPurgeOnce } = await import("../../features/account/data-rights/purge/runner");
    const progress = createAccountPurgeProgressStore({ db, workspaceId: "space", now: () => now });
    let sends = 0;
    const keys: string[] = [];
    const sendCompletion = async (input: { email: string; idempotencyKey: string }) => {
      sends++;
      keys.push(input.idempotencyKey);
      assert.equal(input.email, "old@example.test");
      assert.equal((await pool.query(`select count(*)::int as n from orbit_records where collection_name='auth_users' and user_id=$1`, [userId])).rows[0]?.n, 0,
        "completion is sent only after the identity deletion commits");
      if (sends === 1) throw new Error("mail rejected");
    };
    const run = () => purgeAccountFinalIdentity({ db, workspaceId: "space", actorId: actor, userId, leaseToken: "lease", now: () => now, sendCompletion });
    await assert.rejects(run(), /PURGE_STEPS_INCOMPLETE/);
    assert.equal(sends, 0);
    for (const step of ["connections", "exports", "contacts", "notes", "plans", "agent", "events", "inbox", "residual"]) {
      await progress.complete(actor, "lease", step, { deleted: 0 });
    }
    await insert("notes", "residual", actor, { secret: "private" });
    await assert.rejects(run(), /PURGE_RESIDUAL_RECORDS/);
    assert.equal(sends, 0);
    await pool.query(`delete from orbit_records where collection_name='notes' and record_id='residual'`);
    await pool.query(`create function reject_identity_delete() returns trigger language plpgsql as $$
      begin if old.collection_name='auth_users' then raise exception 'identity delete rejected'; end if; return old; end $$;
      create trigger reject_identity_delete before delete on orbit_records for each row execute function reject_identity_delete()`);
    await assert.rejects(run(), /identity delete rejected/);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where collection_name='account_deletion_completion_mail'`)).rows[0]?.n, 0,
      "a failed identity transaction must roll back the completion message too");
    assert.equal(sends, 0);
    await pool.query(`drop trigger reject_identity_delete on orbit_records; drop function reject_identity_delete()`);
    assert.equal((await run()).deleted, 1);
    assert.equal(sends, 1);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where user_id in ($1,$2)`, [actor, userId])).rows[0]?.n, 0);
    const queued = (await pool.query(`select record_id,user_id,payload from orbit_records where collection_name='account_deletion_completion_mail'`)).rows;
    assert.equal(queued.length, 1);
    assert.ok(!JSON.stringify(queued).includes(actor) && !JSON.stringify(queued).includes(userId));
    assert.equal(queued[0]?.payload?.email, "old@example.test");
    assert.equal((await runLocalAccountPurgeOnce({ db, workspaceId: "space", sendCompletion, now: () => now,
      storage: { delete: async () => undefined }, eraseObject: async () => undefined })).kind, "idle");
    assert.equal(sends, 2);
    assert.equal(keys[0], keys[1]);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where collection_name='account_deletion_completion_mail'`)).rows[0]?.n, 0);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where user_id='other'`)).rows[0]?.n, 1);
    await insert("auth_users", "auth_user:old@example.test", "new-user", { id: "new-user", email: "old@example.test" });
    assert.equal((await pool.query(`select payload->>'id' as id from orbit_records where collection_name='auth_users'`)).rows[0]?.id, "new-user");
    const same = "same-actor-and-user";
    await insert("account_deletion_requests", `deletion:${createHash("sha256").update(same).digest("hex")}`, same,
      { actorId: same, userId: same, status: "purging", leaseToken: "same-lease", leaseUntil: "2026-11-20T00:05:00.000Z" });
    await insert("auth_users", "auth_user:same@example.test", same, { id: same, email: "same@example.test" });
    for (const step of ["connections", "exports", "contacts", "notes", "plans", "agent", "events", "inbox", "residual"]) {
      await progress.complete(same, "same-lease", step, { deleted: 0 });
    }
    assert.equal((await purgeAccountFinalIdentity({ db, workspaceId: "space", actorId: same, userId: same,
      leaseToken: "same-lease", now: () => now,
      sendCompletion: async ({ email }) => assert.equal(email, "same@example.test") })).deleted, 1);
    assert.equal((await pool.query(`select count(*)::int as n from orbit_records where user_id=$1`, [same])).rows[0]?.n, 0);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
});

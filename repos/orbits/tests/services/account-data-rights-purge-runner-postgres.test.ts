import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

test("local purge runner retries a failed upstream revoke and removes an event-free account only after all domains", { skip: local ? false : "requires local orbit_line_c_test" }, async () => {
  const workspaceId = `r18c-run-${randomUUID()}`;
  const actorId = `actor-${randomUUID()}`;
  const userId = `user-${randomUUID()}`;
  const email = `${userId}@example.test`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  let now = new Date("2026-11-20T00:00:00.000Z");
  let revokeAttempts = 0;
  let completionSends = 0;
  try {
    const insert = async (collection: string, id: string, owner: string, value: unknown) =>
      db.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
        values($1,$2,$3,$4,'test',$3,$5::jsonb,now(),now())`, [workspaceId, collection, id, owner, JSON.stringify(value)]);
    const requestId = `deletion:${createHash("sha256").update(actorId).digest("hex")}`;
    await insert("account_deletion_requests", requestId, actorId,
      { id: requestId, actorId, userId, status: "pending", purgeAfter: "2026-11-19T00:00:00.000Z", version: 0 });
    await insert("auth_users", `auth_user:${email}`, userId, { id: userId, email, passwordHash: "secret" });
    await insert("accounts", actorId, actorId, { id: actorId });
    await insert("profiles", `profile:${userId}`, actorId, { id: userId, accountId: actorId });
    await insert("integrationTokens", "google-token", actorId, { encryptedToken: "ciphertext" });
    await insert("other-test-record", "other-contact", "other", { displayName: "Other" });
    const { runLocalAccountPurgeOnce } = await import("../../features/account/data-rights/purge/runner");
    const run = () => runLocalAccountPurgeOnce({ db, workspaceId, now: () => now,
      storage: { delete: async () => undefined }, eraseObject: async () => undefined,
      revokeToken: async () => { revokeAttempts++; if (revokeAttempts === 1) throw new Error("upstream rejected"); },
      sendCompletion: async ({ email: target }) => { assert.equal(target, email); completionSends++; } });
    const first = await run();
    assert.deepEqual(first, { kind: "failed", step: "connections", reason: "upstream rejected" });
    assert.equal((await db.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and collection_name='auth_users' and user_id=$2`, [workspaceId, userId])).rows[0]?.n, 1);
    now = new Date("2026-11-20T00:06:00.000Z");
    const second = await run();
    assert.equal(second.kind, "deleted");
    assert.equal(revokeAttempts, 2);
    assert.equal(completionSends, 1);
    assert.equal((await db.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and user_id in ($2,$3)`, [workspaceId, actorId, userId])).rows[0]?.n, 0);
    assert.equal((await db.query(`select count(*)::int as n from orbit_records where workspace_id=$1 and user_id='other'`, [workspaceId])).rows[0]?.n, 1);
    await insert("auth_users", `auth_user:${email}`, `fresh-${userId}`, { id: `fresh-${userId}`, email });
    assert.equal((await db.query(`select payload->>'id' as id from orbit_records where workspace_id=$1 and collection_name='auth_users'`, [workspaceId])).rows[0]?.id, `fresh-${userId}`);
  } finally {
    await db.query(`delete from orbit_records where workspace_id=$1`, [workspaceId]);
    await db.close();
  }
});

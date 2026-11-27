/**
 * 受控改档（features/account/controlled-ops/account-tier.ts，2026-11-27 分档）：只读预演不写；apply 只改这一个账号的
 * auth_users.payload.tier；会话检查的同一次读取就带出新档位；free = 去掉字段。本机 orbit_line_c_test（完整迁移），每个用例一个新 workspace。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { runControlledTierChange } from "../../features/account/controlled-ops/account-tier";
import { readAuthSessionState } from "../../features/auth/session-revocation";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const local = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();
const dbTest = { skip: local ? false : "requires local orbit_line_c_test (fully migrated)", timeout: 60_000 };

test("set-tier: a dry run writes nothing; apply sets pro on this account only; the session check reads it; free removes it", dbTest, async () => {
  const workspaceId = `account-tier-${randomUUID()}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  const previous = process.env.ORBIT_ACCOUNT_OPS;
  process.env.ORBIT_ACCOUNT_OPS = "build-only";
  try {
    const record = (collection: string, id: string, owner: string, payload: Record<string, unknown>) =>
      pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at,search_text)
        values($1,$2,$3,$4,'test',$3,$5::jsonb,now(),now(),'')`, [workspaceId, collection, id, owner, JSON.stringify(payload)]);
    const at = "2026-11-01T00:00:00.000Z";
    for (const key of ["target", "other"]) {
      await record("auth_users", `auth_user:${key}@example.test`, `user:${key}`, { id: `user:${key}`, email: `${key}@example.test`, displayName: key, provider: "credentials", passwordHash: "h", createdAt: at, updatedAt: at });
      await record("accounts", `actor:${key}`, `actor:${key}`, { id: `actor:${key}` });
      await record("profiles", `profile:user:${key}`, `actor:${key}`, { id: `user:${key}`, accountId: `actor:${key}`, displayName: key });
    }
    const tierOf = async (key: string) => (await pool.query(`select payload->>'tier' as tier from orbit_records where workspace_id=$1 and record_id=$2`, [workspaceId, `auth_user:${key}@example.test`])).rows[0]?.tier ?? null;
    const store = createPostgresLiveRecordStore({ client: pool as never });
    const session = (key: string) => readAuthSessionState({ authenticatedAt: Date.now(), email: `${key}@example.test`, userId: `user:${key}` }, { store, workspaceId } as never);
    const change = (tier: string, apply: boolean) => runControlledTierChange({ apply, db, email: "target@example.test", tier, userId: "user:target", workspaceId });

    const dry = await change("pro", false);
    assert.deepEqual([dry.kind, dry.from, dry.to, dry.actorId], ["dry-run", "free", "pro", "actor:target"]);
    assert.doesNotMatch(dry.email, /target@/u, "the email is masked");
    assert.equal(await tierOf("target"), null);
    assert.equal((await change("pro", true)).kind, "changed");
    assert.deepEqual([await tierOf("target"), await tierOf("other")], ["pro", null]);
    assert.equal((await session("target")).tier, "pro");
    assert.equal((await session("other")).tier, "free");
    assert.equal((await change("pro", true)).kind, "unchanged");
    await assert.rejects(change("gold", true), /TIER_INVALID/u);
    await assert.rejects(runControlledTierChange({ apply: true, db, email: "target@example.test", tier: "pro", userId: "user:other", workspaceId }), /TARGET_EMAIL_ID_MISMATCH/u);
    assert.equal((await change("free", true)).kind, "changed");
    assert.equal(await tierOf("target"), null);
    assert.equal((await session("target")).tier, "free");
  } finally {
    if (previous === undefined) delete process.env.ORBIT_ACCOUNT_OPS; else process.env.ORBIT_ACCOUNT_OPS = previous;
    await pool.query(`delete from orbit_records where workspace_id=$1`, [workspaceId]).catch(() => undefined);
    await pool.end();
  }
});

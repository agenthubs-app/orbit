import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { authUserRecordId } from "../../features/auth/storage/auth-user-live-record-provider";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const localTestDatabase = (() => {
  try { const url = new URL(databaseUrl ?? ""); return ["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/orbit_line_c_test"; }
  catch { return false; }
})();

async function withRecords(run: (context: { db: ReturnType<typeof createTransactionalPostgresClient>; workspaceId: string }) => Promise<void>) {
  const schema = `r18c_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema}` });
  const db = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await run({ db, workspaceId: "w" });
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await db.close();
  }
}

test("deletion application consumes a same-actor, single-use receipt and cancellation wins before the 30-day deadline", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => withRecords(async ({ db, workspaceId }) => {
  const { createAccountDeletionRecordStore } = await import("../../features/account/data-rights/deletion-records");
  let now = new Date("2026-10-20T00:00:00.000Z");
  const store = createAccountDeletionRecordStore({ db, workspaceId, now: () => now });
  const email = "account@example.test";
  await db.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
    values ($1,'auth_users',$2,'profile','test',$2,$3::jsonb,now(),now())`, [workspaceId, authUserRecordId(email), JSON.stringify({ id: "profile", email })]);
  const receipt = await store.issueReceipt("actor", "profile", "deletion-request", now);
  assert.equal((await store.request("other", "profile", receipt)).kind, "bad-receipt");
  assert.equal((await store.request("actor", "other-profile", receipt)).kind, "bad-receipt");
  const attempts = await Promise.all([store.request("actor", "profile", receipt), store.request("actor", "profile", receipt)]);
  assert.deepEqual(attempts.map(item => item.kind).sort(), ["accepted", "existing"]);
  const request = await store.get("actor");
  assert.equal(request?.status, "pending");
  assert.equal(request?.purgeAfter, "2026-11-19T00:00:00.000Z");
  const authRow = await db.query<{ payload: Record<string, unknown> }>(`select payload from orbit_records where workspace_id=$1 and collection_name='auth_users'`, [workspaceId]);
  assert.equal(authRow.rows[0]?.payload.deletionRequestedAt, request?.requestedAt);
  const { isPreDeletionSessionCurrent } = await import("../../features/auth/session-revocation");
  const sessionDatabase = { workspaceId, store: { getRecord: async () => ({ lifecycleState: "active", payload: authRow.rows[0]!.payload }) } } as never;
  assert.equal(await isPreDeletionSessionCurrent({ email, userId: "profile", authenticatedAt: Date.parse(request!.requestedAt) - 1 }, sessionDatabase), false);
  assert.equal(await isPreDeletionSessionCurrent({ email, userId: "profile", authenticatedAt: Date.parse(request!.requestedAt) + 1 }, sessionDatabase), true);
  assert.equal(await store.get("other"), null);
  assert.equal((await store.request("another", "profile", receipt)).kind, "bad-receipt");
  assert.equal((await store.cancel("actor")).kind, "cancelled");
  assert.equal((await store.cancel("actor")).kind, "existing");
  assert.equal((await store.request("actor", "profile", receipt)).kind, "bad-receipt");
  const newReceipt = await store.issueReceipt("actor", "profile", "deletion-request", now);
  assert.equal((await store.request("actor", "profile", newReceipt)).kind, "accepted");
  now = new Date("2026-11-19T00:00:00.000Z");
  assert.equal((await store.cancel("actor")).kind, "too-late");
  assert.equal((await store.claimNextPurge())?.request.status, "purging");
  assert.equal((await store.cancel("actor")).kind, "too-late");
}));

test("host events with active registrations block deletion without consuming receipt", {
  skip: localTestDatabase ? false : "requires local orbit_line_c_test",
}, async () => withRecords(async ({ db, workspaceId }) => {
  const { createAccountDeletionRecordStore } = await import("../../features/account/data-rights/deletion-records");
  const now = new Date("2026-10-20T00:00:00.000Z");
  const store = createAccountDeletionRecordStore({ db, workspaceId, now: () => now });
  await db.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
    values ($1,'auth_users',$2,'profile','test',$2,$3::jsonb,now(),now())`, [workspaceId, authUserRecordId("host@example.test"), JSON.stringify({ id: "profile", email: "host@example.test" })]);
  await db.query(`insert into orbit_records (workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
    values ($1,'events','event-1','actor','test','event-1','{"accountId":"actor"}'::jsonb,now(),now()),
    ($1,'event_registrations','registration-1','guest','test','registration-1','{"registration":{"eventId":"event-1","userId":"guest","status":"rsvped"}}'::jsonb,now(),now())`, [workspaceId]);
  const receipt = await store.issueReceipt("actor", "profile", "deletion-request", now);
  assert.equal((await store.request("actor", "profile", receipt)).kind, "host-blocked");
  await db.query(`delete from orbit_records where workspace_id=$1 and collection_name='event_registrations'`, [workspaceId]);
  assert.equal((await store.request("actor", "profile", receipt)).kind, "accepted");
}));
